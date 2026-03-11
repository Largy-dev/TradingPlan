import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { PubSub } from 'graphql-subscriptions';
import { BinanceService } from './BinanceService';
import { StrategyService } from './StrategyService';
import { CryptoService } from './CryptoService';
import { IBotStatus } from '../interfaces/IBotState';

export const pubsub = new PubSub();
export const BOT_STATUS_UPDATED = 'BOT_STATUS_UPDATED';
export const NEW_TRADE = 'NEW_TRADE';

export class BotService {
  private cronJob: cron.ScheduledTask | null = null;
  private binanceService: BinanceService | null = null;
  private strategyService: StrategyService | null = null;
  private trailingHighs = new Map<number, number>();
  private trailingLows = new Map<number, number>();

  constructor(private readonly prisma: PrismaClient) {}

  async initializeBinanceService(): Promise<boolean> {
    const config = await this.prisma.config.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return false;
    try {
      const apiKey = CryptoService.decrypt(config.apiKeyEncrypted);
      const secretKey = CryptoService.decrypt(config.secretKeyEncrypted);
      this.binanceService = new BinanceService(apiKey, secretKey, config.testnet);
      this.strategyService = new StrategyService(this.binanceService);
      return await this.binanceService.testConnection();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance Futures. Check your API keys.');

    let state = await this.prisma.botState.findFirst();
    if (!state) {
      state = await this.prisma.botState.create({ data: { updatedAt: new Date() } });
    }
    await this.prisma.botState.update({ where: { id: state.id }, data: { isRunning: true } });

    this.cronJob = cron.schedule('* * * * *', () => this.runTick());
    console.log('[BotService] Started — Binance Futures Demo mode');
    await this.publishStatus();
  }

  async stop(): Promise<void> {
    this.cronJob?.stop();
    this.cronJob = null;
    const state = await this.prisma.botState.findFirst();
    if (state) {
      await this.prisma.botState.update({ where: { id: state.id }, data: { isRunning: false } });
    }
    console.log('[BotService] Stopped');
    await this.publishStatus();
  }

  private async runTick(): Promise<void> {
    if (!this.binanceService || !this.strategyService) return;
    try {
      const state = await this.prisma.botState.findFirst();
      if (!state?.isRunning) return;

      const openTrades = await this.prisma.trade.findMany({
        where: { status: 'OPEN' },
        select: { id: true, symbol: true, positionSide: true, entryPrice: true, quantity: true, leverage: true, status: true },
      });

      // Check exit conditions on all open trades
      for (const trade of openTrades) {
        await this.checkExitConditions(trade, state);
      }

      // Check entry conditions if slots available
      const currentOpen = await this.prisma.trade.count({ where: { status: 'OPEN' } });
      if (currentOpen >= state.maxOpenTrades) return;

      const activePairs = await this.getActivePairs(state);
      const openSymbols = new Set(openTrades.map((t) => `${t.symbol}_${t.positionSide}`));

      for (const pair of activePairs) {
        const nowOpen = await this.prisma.trade.count({ where: { status: 'OPEN' } });
        if (nowOpen >= state.maxOpenTrades) break;

        const signal = await this.strategyService.analyzeSymbol(pair);

        if (signal.action === 'LONG' && !openSymbols.has(`${pair}_LONG`)) {
          await this.openPosition(pair, 'LONG', state);
        } else if (signal.action === 'SHORT' && !openSymbols.has(`${pair}_SHORT`)) {
          await this.openPosition(pair, 'SHORT', state);
        }
      }

      await this.publishStatus();
    } catch (err) {
      console.error('[BotService] Tick error:', err);
    }
  }

  private async checkExitConditions(
    trade: { id: number; symbol: string; positionSide: string; entryPrice: number; quantity: number; leverage: number },
    state: { takeProfitPct: number; stopLossPct: number; trailingStopPct: number },
  ): Promise<void> {
    if (!this.binanceService) return;
    try {
      const currentPrice = await this.binanceService.getCurrentPrice(trade.symbol);
      const isLong = trade.positionSide === 'LONG';

      // For LONG: profit when price goes up. For SHORT: profit when price goes down.
      const pnlPct = isLong
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      // Trailing logic
      if (isLong) {
        const high = this.trailingHighs.get(trade.id) ?? trade.entryPrice;
        if (currentPrice > high) this.trailingHighs.set(trade.id, currentPrice);
        const currentHigh = this.trailingHighs.get(trade.id)!;
        const trailingDrop = ((currentHigh - currentPrice) / currentHigh) * 100;

        const tp = pnlPct >= state.takeProfitPct;
        const sl = pnlPct <= -state.stopLossPct;
        const trail = pnlPct >= 2 && trailingDrop >= state.trailingStopPct;

        if (tp || sl || trail) {
          await this.closePosition(trade, currentPrice, tp ? 'TAKE_PROFIT' : sl ? 'STOP_LOSS' : 'TRAILING_STOP');
        }
      } else {
        const low = this.trailingLows.get(trade.id) ?? trade.entryPrice;
        if (currentPrice < low) this.trailingLows.set(trade.id, currentPrice);
        const currentLow = this.trailingLows.get(trade.id)!;
        const trailingRise = ((currentPrice - currentLow) / currentLow) * 100;

        const tp = pnlPct >= state.takeProfitPct;
        const sl = pnlPct <= -state.stopLossPct;
        const trail = pnlPct >= 2 && trailingRise >= state.trailingStopPct;

        if (tp || sl || trail) {
          await this.closePosition(trade, currentPrice, tp ? 'TAKE_PROFIT' : sl ? 'STOP_LOSS' : 'TRAILING_STOP');
        }
      }
    } catch (err) {
      console.error(`[BotService] Exit check error ${trade.symbol}:`, err);
    }
  }

  private async openPosition(symbol: string, positionSide: 'LONG' | 'SHORT', state: { riskPercent: number; leverage: number }): Promise<void> {
    if (!this.binanceService) return;
    try {
      const balance = await this.binanceService.getUsdtBalance();
      const tradeAmount = (balance * state.riskPercent) / 100;
      if (tradeAmount < 5) {
        console.log(`[BotService] Insufficient balance for ${symbol}`);
        return;
      }

      const order = positionSide === 'LONG'
        ? await this.binanceService.openLong(symbol, tradeAmount, state.leverage)
        : await this.binanceService.openShort(symbol, tradeAmount, state.leverage);

      const trade = await this.prisma.trade.create({
        data: {
          symbol,
          side: positionSide === 'LONG' ? 'BUY' : 'SELL',
          positionSide,
          quantity: order.quantity,
          entryPrice: order.price,
          leverage: state.leverage,
          status: 'OPEN',
          orderId: order.orderId,
        },
      });

      console.log(`[BotService] OPEN ${positionSide} ${symbol} @ ${order.price} x${state.leverage} qty:${order.quantity}`);
      pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(trade) });
    } catch (err) {
      console.error(`[BotService] Open position error ${symbol}:`, err);
    }
  }

  private async closePosition(
    trade: { id: number; symbol: string; positionSide: string; entryPrice: number; quantity: number; leverage: number },
    exitPrice: number,
    reason: string,
  ): Promise<void> {
    if (!this.binanceService) throw new Error('Binance not initialized');

    // Use the actual position size from Binance to avoid 400 errors caused by quantity mismatch
    const positions = await this.binanceService.getOpenPositions();
    const position = positions.find(
      (p) => p.symbol === trade.symbol && p.positionSide === trade.positionSide,
    );
    if (!position) {
      throw new Error(`Position not found on Binance (${trade.symbol} ${trade.positionSide}). Use force close to clean up DB.`);
    }
    const quantity = Math.abs(position.positionAmt);

    const order = trade.positionSide === 'LONG'
      ? await this.binanceService.closeLong(trade.symbol, quantity)
      : await this.binanceService.closeShort(trade.symbol, quantity);

    const actualExit = order.price || exitPrice;
    const isLong = trade.positionSide === 'LONG';

    // Binance Futures taker fee (MARKET orders): 0.04% per side
    const TAKER_FEE_RATE = 0.0004;
    const openFee  = quantity * trade.entryPrice * TAKER_FEE_RATE;
    const closeFee = quantity * actualExit       * TAKER_FEE_RATE;
    const totalFees = openFee + closeFee;

    const grossPnl = isLong
      ? quantity * (actualExit - trade.entryPrice)
      : quantity * (trade.entryPrice - actualExit);
    const pnl = grossPnl - totalFees;

    const margin = (quantity * trade.entryPrice) / trade.leverage;
    const pnlPct = (pnl / margin) * 100;

    const updated = await this.prisma.trade.update({
      where: { id: trade.id },
      data: {
        exitPrice: actualExit,
        pnl,
        pnlPercent: pnlPct,
        status: 'CLOSED',
        exitOrderId: order.orderId,
        closedAt: new Date(),
      },
    });

    this.trailingHighs.delete(trade.id);
    this.trailingLows.delete(trade.id);
    console.log(`[BotService] CLOSE ${trade.positionSide} ${trade.symbol} (${reason}) PnL: ${pnl.toFixed(2)} USDT (${pnlPct.toFixed(2)}%)`);
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(updated) });
  }

  async openManualTrade(symbol: string, quoteQty: number, positionSide: 'LONG' | 'SHORT'): Promise<any> {
    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance. Check your API keys.');

    const state = await this.prisma.botState.findFirst();
    const leverage = state?.leverage ?? 10;

    const order = positionSide === 'LONG'
      ? await this.binanceService!.openLong(symbol, quoteQty, leverage)
      : await this.binanceService!.openShort(symbol, quoteQty, leverage);

    const trade = await this.prisma.trade.create({
      data: {
        symbol,
        side: positionSide === 'LONG' ? 'BUY' : 'SELL',
        positionSide,
        quantity: order.quantity,
        entryPrice: order.price,
        leverage,
        status: 'OPEN',
        orderId: order.orderId,
      },
    });

    console.log(`[BotService] MANUAL ${positionSide} ${symbol} @ ${order.price} x${leverage} qty:${order.quantity}`);
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(trade) });
    return this.serializeTrade(trade);
  }

  async closeManualTrade(tradeId: number): Promise<any> {
    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance. Check your API keys.');

    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') throw new Error('Trade not found or already closed.');

    const currentPrice = await this.binanceService!.getCurrentPrice(trade.symbol);
    await this.closePosition(
      { id: trade.id, symbol: trade.symbol, positionSide: trade.positionSide, entryPrice: trade.entryPrice, quantity: trade.quantity, leverage: trade.leverage },
      currentPrice,
      'MANUAL',
    );

    const updated = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    return this.serializeTrade(updated);
  }

  async forceCloseTrade(tradeId: number): Promise<any> {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') throw new Error('Trade not found or already closed.');

    const updated = await this.prisma.trade.update({
      where: { id: tradeId },
      data: { status: 'CLOSED', closedAt: new Date(), exitPrice: trade.entryPrice, pnl: 0, pnlPercent: 0 },
    });

    this.trailingHighs.delete(tradeId);
    this.trailingLows.delete(tradeId);
    console.log(`[BotService] FORCE CLOSE trade #${tradeId} ${trade.symbol} (local DB only)`);
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(updated) });
    return this.serializeTrade(updated);
  }

  private async getActivePairs(state: { autoSelectPairs: boolean }): Promise<string[]> {
    if (!this.binanceService) return [];

    if (state.autoSelectPairs) {
      const topPairs = await this.binanceService.getTopFuturesPairs(10_000_000, 2, 10);
      for (const pair of topPairs) {
        await this.prisma.tradingPair.upsert({
          where: { symbol: pair.symbol },
          update: { isActive: true, isManual: false },
          create: { symbol: pair.symbol, isActive: true, isManual: false },
        });
      }
      const manualPairs = await this.prisma.tradingPair.findMany({ where: { isActive: true, isManual: true } });
      const all = new Set([...topPairs.map((p) => p.symbol), ...manualPairs.map((p) => p.symbol)]);
      return Array.from(all);
    }

    const pairs = await this.prisma.tradingPair.findMany({ where: { isActive: true } });
    return pairs.map((p) => p.symbol);
  }

  async getBotStatus(): Promise<IBotStatus> {
    let state = await this.prisma.botState.findFirst();
    if (!state) {
      state = await this.prisma.botState.create({ data: { updatedAt: new Date() } });
    }

    const [openTrades, closedTrades, activePairs] = await Promise.all([
      this.prisma.trade.findMany({ where: { status: 'OPEN' } }),
      this.prisma.trade.findMany({ where: { status: 'CLOSED' } }),
      this.prisma.tradingPair.findMany({ where: { isActive: true } }),
    ]);

    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    let balance = 0;
    if (this.binanceService) {
      try { balance = await this.binanceService.getUsdtBalance(); } catch { /* ignore */ }
    }

    return {
      ...state,
      activePairs: activePairs.map((p) => p.symbol),
      openPositions: openTrades.length,
      totalPnl,
      balance,
    };
  }

  private async publishStatus(): Promise<void> {
    const status = await this.getBotStatus();
    pubsub.publish(BOT_STATUS_UPDATED, { botStatusUpdated: status });
  }

  private serializeTrade(trade: any): any {
    return {
      ...trade,
      openedAt: trade.openedAt instanceof Date ? trade.openedAt.toISOString() : trade.openedAt,
      closedAt: trade.closedAt instanceof Date ? trade.closedAt.toISOString() : (trade.closedAt ?? null),
    };
  }
}
