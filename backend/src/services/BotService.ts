import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { PubSub } from 'graphql-subscriptions';
import { BinanceService } from './BinanceService';
import { BinanceStreamService } from './BinanceStreamService';
import { StrategyService } from './StrategyService';
import { CryptoService } from './CryptoService';
import { IBotStatus } from '../interfaces/IBotState';
import { IMarkPriceUpdate, IKlineUpdate } from '../interfaces/IBinanceStreamService';

export const pubsub = new PubSub();
export const BOT_STATUS_UPDATED = 'BOT_STATUS_UPDATED';
export const NEW_TRADE = 'NEW_TRADE';

interface CachedTrade {
  id: number;
  symbol: string;
  positionSide: string;
  entryPrice: number;
  quantity: number;
  leverage: number;
}

interface BotStateCache {
  id: number;
  riskPercent: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxOpenTrades: number;
  leverage: number;
}

export class BotService {
  // Infrastructure
  private binanceService: BinanceService | null = null;
  private strategyService: StrategyService | null = null;
  private streamService: BinanceStreamService | null = null;
  private maintenanceCron: cron.ScheduledTask | null = null;
  private entryCron: cron.ScheduledTask | null = null;
  private testnet = true;

  // Runtime state (in-memory caches to avoid DB hits on every tick)
  private isRunning = false;
  private botStateCache: BotStateCache | null = null;
  private openTradesCache = new Map<number, CachedTrade>(); // tradeId → trade
  private closingInProgress = new Set<number>();            // avoid double-close
  private subscribedSymbols = new Set<string>();

  // TP/SL helpers
  private trailingHighs = new Map<number, number>();
  private trailingLows = new Map<number, number>();
  // After closing a position, wait 1 full 15m candle before re-entering same symbol+side
  private readonly COOLDOWN_MS = 15 * 60 * 1_000;
  private recentlyClosed = new Map<string, number>(); // `${symbol}_${positionSide}` → ms
  private scanInProgress = false; // prevent concurrent entry scans overloading the API

  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initializeBinanceService(): Promise<boolean> {
    const config = await this.prisma.config.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return false;
    try {
      const apiKey = CryptoService.decrypt(config.apiKeyEncrypted);
      const secretKey = CryptoService.decrypt(config.secretKeyEncrypted);
      this.testnet = config.testnet;
      this.binanceService = new BinanceService(apiKey, secretKey, config.testnet);
      this.strategyService = new StrategyService(this.binanceService);
      return await this.binanceService.testConnection();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance Futures. Check your API keys.');

    let state = await this.prisma.botState.findFirst();
    if (!state) state = await this.prisma.botState.create({ data: { updatedAt: new Date() } });

    // One-time migration: update old EMA_RSI_VOLUME defaults to the new
    // Pullback Scalping recommended values (only runs once per installation).
    if (state.strategy === 'EMA_RSI_VOLUME') {
      state = await this.prisma.botState.update({
        where: { id: state.id },
        data: {
          strategy: 'PULLBACK_SCALPING',
          takeProfitPct: 0.8,
          stopLossPct: 0.4,
          trailingStopPct: 0.2,
          riskPercent: 2.0,
          leverage: 10,
          maxOpenTrades: 3,
        },
      });
      console.log('[BotService] Migrated risk settings to PULLBACK_SCALPING defaults (TP 0.8% / SL 0.4% / 10x / 2% risk)');
    }

    await this.prisma.botState.update({ where: { id: state.id }, data: { isRunning: true } });

    this.isRunning = true;
    this.botStateCache = this.extractStateCache(state);

    await this.rebuildOpenTradesCache();
    await this.resyncSubscriptions();

    // Entry signals: scan all active pairs every minute
    this.entryCron = cron.schedule('* * * * *', () => this.runEntryScan());
    // Maintenance: refresh pairs + resync streams every 5 minutes
    this.maintenanceCron = cron.schedule('*/5 * * * *', () => this.runMaintenance());

    console.log('[BotService] Started — WebSocket TP/SL + 1-min entry scan active');
    await this.publishStatus();
  }

  async stop(): Promise<void> {
    this.entryCron?.stop();
    this.entryCron = null;
    this.maintenanceCron?.stop();
    this.maintenanceCron = null;
    this.streamService?.unsubscribe();
    this.streamService = null;
    this.subscribedSymbols.clear();
    this.isRunning = false;
    this.botStateCache = null;

    const state = await this.prisma.botState.findFirst();
    if (state) await this.prisma.botState.update({ where: { id: state.id }, data: { isRunning: false } });

    console.log('[BotService] Stopped');
    await this.publishStatus();
  }

  // ---------------------------------------------------------------------------
  // WebSocket handlers
  // ---------------------------------------------------------------------------

  private handleMarkPrice(data: IMarkPriceUpdate): void {
    if (!this.isRunning || !this.botStateCache) return;

    for (const trade of this.openTradesCache.values()) {
      if (trade.symbol !== data.symbol) continue;
      if (this.closingInProgress.has(trade.id)) continue;

      const price = data.markPrice;
      const isLong = trade.positionSide === 'LONG';
      const pnlPct = isLong
        ? ((price - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - price) / trade.entryPrice) * 100;

      let reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | null = null;

      if (isLong) {
        const high = this.trailingHighs.get(trade.id) ?? trade.entryPrice;
        if (price > high) this.trailingHighs.set(trade.id, price);
        const trailingDrop = ((this.trailingHighs.get(trade.id)! - price) / this.trailingHighs.get(trade.id)!) * 100;

        if (pnlPct >= this.botStateCache.takeProfitPct) reason = 'TAKE_PROFIT';
        else if (pnlPct <= -this.botStateCache.stopLossPct) reason = 'STOP_LOSS';
        // Trailing activates at 50% of TP so it works regardless of TP setting
        else if (pnlPct >= this.botStateCache.takeProfitPct * 0.5 && trailingDrop >= this.botStateCache.trailingStopPct) reason = 'TRAILING_STOP';
      } else {
        const low = this.trailingLows.get(trade.id) ?? trade.entryPrice;
        if (price < low) this.trailingLows.set(trade.id, price);
        const trailingRise = ((price - this.trailingLows.get(trade.id)!) / this.trailingLows.get(trade.id)!) * 100;

        if (pnlPct >= this.botStateCache.takeProfitPct) reason = 'TAKE_PROFIT';
        else if (pnlPct <= -this.botStateCache.stopLossPct) reason = 'STOP_LOSS';
        // Trailing activates at 50% of TP so it works regardless of TP setting
        else if (pnlPct >= this.botStateCache.takeProfitPct * 0.5 && trailingRise >= this.botStateCache.trailingStopPct) reason = 'TRAILING_STOP';
      }

      if (reason) {
        // Lock immediately (synchronous) before any await
        this.closingInProgress.add(trade.id);
        this.openTradesCache.delete(trade.id);

        this.closePosition(trade, price, reason)
          .then(() => this.publishStatus())
          .catch((err) => {
            console.error(`[BotService] Close error ${trade.symbol} #${trade.id}:`, err);
            // Restore to cache so next tick retries
            this.openTradesCache.set(trade.id, trade);
          })
          .finally(() => this.closingInProgress.delete(trade.id));
      }
    }
  }

  // Kline close events from WebSocket are informational only.
  // Entry scanning is handled by the 1-minute cron (runEntryScan).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleKlineClose(_data: IKlineUpdate): void {
    // no-op: entries are handled by runEntryScan()
  }

  // ---------------------------------------------------------------------------
  // Subscription management
  // ---------------------------------------------------------------------------

  private async rebuildOpenTradesCache(): Promise<void> {
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'OPEN' },
      select: { id: true, symbol: true, positionSide: true, entryPrice: true, quantity: true, leverage: true },
    });
    this.openTradesCache.clear();
    for (const t of openTrades) this.openTradesCache.set(t.id, t);
  }

  private async resyncSubscriptions(): Promise<void> {
    const symbols = await this.getSubscriptionSymbols();
    const newSet = new Set(symbols);

    const changed =
      symbols.length !== this.subscribedSymbols.size ||
      symbols.some((s) => !this.subscribedSymbols.has(s));

    if (!changed) return;

    this.subscribedSymbols = newSet;

    if (symbols.length === 0) {
      this.streamService?.unsubscribe();
      return;
    }

    if (!this.streamService) {
      this.streamService = new BinanceStreamService(this.testnet);
    }

    this.streamService.subscribe(
      symbols,
      (d) => this.handleMarkPrice(d),
      (d) => this.handleKlineClose(d),
    );
    console.log(`[BotService] Subscribed to ${symbols.length} symbols`);
  }

  private async getSubscriptionSymbols(): Promise<string[]> {
    const activePairs = await this.getActivePairs();
    const openSymbols = Array.from(this.openTradesCache.values()).map((t) => t.symbol);
    return Array.from(new Set([...activePairs, ...openSymbols]));
  }

  private async runMaintenance(): Promise<void> {
    try {
      if (!this.isRunning) return;
      const state = await this.prisma.botState.findFirst();
      if (state) this.botStateCache = this.extractStateCache(state);
      await this.reconcilePositions();
      await this.resyncSubscriptions();
      await this.publishStatus();
    } catch (err) {
      console.error('[BotService] Maintenance error:', err);
    }
  }

  /**
   * Run every minute: check entry signals on all active pairs.
   * WebSocket handles exits (TP/SL/trailing) in real-time.
   * EMA/RSI/MACD are computed on closed candles → signal is stable between closes,
   * so scanning every minute is equivalent to scanning at candle close.
   */
  private async runEntryScan(): Promise<void> {
    // Prevent concurrent scans: if previous scan is still running (slow API), skip this tick
    if (this.scanInProgress) return;
    this.scanInProgress = true;
    try {
      if (!this.isRunning || !this.strategyService || !this.botStateCache) return;
      if (this.openTradesCache.size >= this.botStateCache.maxOpenTrades) return;

      const state = this.botStateCache;
      const symbols = await this.getSubscriptionSymbols();
      const now = Date.now();

      for (const symbol of symbols) {
        if (!this.isRunning) break;
        if (this.openTradesCache.size >= state.maxOpenTrades) break;

        const openKeys = new Set(
          Array.from(this.openTradesCache.values()).map((t) => `${t.symbol}_${t.positionSide}`),
        );
        const longCooling  = (now - (this.recentlyClosed.get(`${symbol}_LONG`)  ?? 0)) < this.COOLDOWN_MS;
        const shortCooling = (now - (this.recentlyClosed.get(`${symbol}_SHORT`) ?? 0)) < this.COOLDOWN_MS;

        if (openKeys.has(`${symbol}_LONG`) && openKeys.has(`${symbol}_SHORT`)) continue;

        try {
          const signal = await this.strategyService.analyzeSymbol(symbol);
          if (signal.action === 'LONG' && !openKeys.has(`${symbol}_LONG`) && !longCooling) {
            await this.openPosition(symbol, 'LONG', state);
          } else if (signal.action === 'SHORT' && !openKeys.has(`${symbol}_SHORT`) && !shortCooling) {
            await this.openPosition(symbol, 'SHORT', state);
          }
        } catch (err) {
          console.error(`[BotService] Entry scan error ${symbol}:`, err);
        }
      }

      await this.publishStatus();
    } catch (err) {
      console.error('[BotService] Entry scan error:', err);
    } finally {
      this.scanInProgress = false;
    }
  }

  /**
   * Reconcile DB OPEN trades against actual Binance positions.
   * If a DB trade is OPEN but no longer exists on Binance (closed externally),
   * auto-force-close it to keep the DB in sync.
   */
  private async reconcilePositions(): Promise<void> {
    if (!this.binanceService) return;
    try {
      const [dbOpenTrades, binancePositions] = await Promise.all([
        this.prisma.trade.findMany({
          where: { status: 'OPEN' },
          select: { id: true, symbol: true, positionSide: true, entryPrice: true, quantity: true, leverage: true },
        }),
        this.binanceService.getOpenPositions(),
      ]);

      const binanceSet = new Set(
        binancePositions.map((p) => `${p.symbol}_${p.positionSide}`),
      );

      for (const trade of dbOpenTrades) {
        const key = `${trade.symbol}_${trade.positionSide}`;
        if (!binanceSet.has(key)) {
          console.warn(
            `[BotService] Reconciliation: trade #${trade.id} ${key} not found on Binance — auto-force-closing`,
          );
          await this.prisma.trade.update({
            where: { id: trade.id },
            data: { status: 'CLOSED', closedAt: new Date(), exitPrice: trade.entryPrice, pnl: 0, pnlPercent: 0 },
          });
          this.openTradesCache.delete(trade.id);
          this.trailingHighs.delete(trade.id);
          this.trailingLows.delete(trade.id);
        }
      }
    } catch (err) {
      console.error('[BotService] Reconciliation error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Trade operations
  // ---------------------------------------------------------------------------

  private async openPosition(
    symbol: string,
    positionSide: 'LONG' | 'SHORT',
    state: BotStateCache,
  ): Promise<void> {
    if (!this.binanceService) return;
    if (this.openTradesCache.size >= state.maxOpenTrades) return;
    try {
      const balance = await this.binanceService.getUsdtBalance();
      const tradeAmount = (balance * state.riskPercent) / 100;
      if (tradeAmount < 5) {
        console.log(`[BotService] Insufficient balance for ${symbol}`);
        return;
      }

      const order =
        positionSide === 'LONG'
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

      const cached: CachedTrade = {
        id: trade.id,
        symbol: trade.symbol,
        positionSide: trade.positionSide,
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        leverage: trade.leverage,
      };
      this.openTradesCache.set(trade.id, cached);

      // If this symbol wasn't subscribed yet, resync streams
      if (!this.subscribedSymbols.has(symbol)) {
        await this.resyncSubscriptions();
      }

      console.log(`[BotService] OPEN ${positionSide} ${symbol} @ ${order.price} x${state.leverage} qty:${order.quantity}`);
      pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(trade) });
    } catch (err) {
      console.error(`[BotService] Open position error ${symbol}:`, err);
    }
  }

  private async closePosition(
    trade: CachedTrade,
    exitPrice: number,
    reason: string,
  ): Promise<void> {
    if (!this.binanceService) throw new Error('Binance not initialized');

    // Always get the real quantity from Binance to avoid quantity mismatch errors
    const positions = await this.binanceService.getOpenPositions();
    const position = positions.find(
      (p) => p.symbol === trade.symbol && p.positionSide === trade.positionSide,
    );
    if (!position) {
      throw new Error(
        `Position not found on Binance (${trade.symbol} ${trade.positionSide}). Use force close to clean up DB.`,
      );
    }
    const quantity = Math.abs(position.positionAmt);

    const order =
      trade.positionSide === 'LONG'
        ? await this.binanceService.closeLong(trade.symbol, quantity)
        : await this.binanceService.closeShort(trade.symbol, quantity);

    const actualExit = order.price || exitPrice;
    const isLong = trade.positionSide === 'LONG';
    const TAKER_FEE_RATE = 0.0005; // 0.05% per side

    const openFee = quantity * trade.entryPrice * TAKER_FEE_RATE;
    const closeFee = quantity * actualExit * TAKER_FEE_RATE;
    const grossPnl = isLong
      ? quantity * (actualExit - trade.entryPrice)
      : quantity * (trade.entryPrice - actualExit);
    const pnl = grossPnl - openFee - closeFee;
    const pnlPct = (pnl / ((quantity * trade.entryPrice) / trade.leverage)) * 100;

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
    this.recentlyClosed.set(`${trade.symbol}_${trade.positionSide}`, Date.now());
    console.log(
      `[BotService] CLOSE ${trade.positionSide} ${trade.symbol} (${reason}) PnL: ${pnl.toFixed(2)} USDT (${pnlPct.toFixed(2)}%)`,
    );
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(updated) });
  }

  // ---------------------------------------------------------------------------
  // Public mutations
  // ---------------------------------------------------------------------------

  async openManualTrade(symbol: string, quoteQty: number, positionSide: 'LONG' | 'SHORT'): Promise<any> {
    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance. Check your API keys.');

    const state = await this.prisma.botState.findFirst();
    const leverage = state?.leverage ?? 10;

    const order =
      positionSide === 'LONG'
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

    // Keep cache in sync even for manual trades
    this.openTradesCache.set(trade.id, {
      id: trade.id,
      symbol: trade.symbol,
      positionSide: trade.positionSide,
      entryPrice: trade.entryPrice,
      quantity: trade.quantity,
      leverage: trade.leverage,
    });
    if (!this.subscribedSymbols.has(symbol) && this.isRunning) {
      await this.resyncSubscriptions();
    }

    console.log(`[BotService] MANUAL ${positionSide} ${symbol} @ ${order.price} x${leverage} qty:${order.quantity}`);
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(trade) });
    return this.serializeTrade(trade);
  }

  async closeManualTrade(tradeId: number): Promise<any> {
    const ok = await this.initializeBinanceService();
    if (!ok) throw new Error('Cannot connect to Binance. Check your API keys.');

    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') throw new Error('Trade not found or already closed.');

    const cached: CachedTrade = {
      id: trade.id,
      symbol: trade.symbol,
      positionSide: trade.positionSide,
      entryPrice: trade.entryPrice,
      quantity: trade.quantity,
      leverage: trade.leverage,
    };

    this.closingInProgress.add(tradeId);
    this.openTradesCache.delete(tradeId);
    try {
      const currentPrice = await this.binanceService!.getCurrentPrice(trade.symbol);
      await this.closePosition(cached, currentPrice, 'MANUAL');
    } catch (err) {
      this.openTradesCache.set(tradeId, cached);
      throw err;
    } finally {
      this.closingInProgress.delete(tradeId);
    }

    await this.publishStatus();
    const updated = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    return this.serializeTrade(updated);
  }

  async closeAllTrades(): Promise<IBotStatus> {
    if (!this.binanceService) {
      const ok = await this.initializeBinanceService();
      if (!ok) throw new Error('Cannot connect to Binance. Check your API keys.');
    }

    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'OPEN' },
      select: { id: true, symbol: true, positionSide: true, entryPrice: true, quantity: true, leverage: true },
    });

    await Promise.allSettled(
      openTrades.map(async (trade) => {
        if (this.closingInProgress.has(trade.id)) return;
        this.closingInProgress.add(trade.id);
        this.openTradesCache.delete(trade.id);
        try {
          const currentPrice = await this.binanceService!.getCurrentPrice(trade.symbol);
          await this.closePosition(trade, currentPrice, 'CLOSE_ALL');
        } catch (err) {
          console.error(`[BotService] CloseAll error ${trade.symbol} #${trade.id}:`, err);
          this.openTradesCache.set(trade.id, trade);
        } finally {
          this.closingInProgress.delete(trade.id);
        }
      }),
    );

    await this.publishStatus();
    return this.getBotStatus();
  }

  async forceCloseTrade(tradeId: number): Promise<any> {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') throw new Error('Trade not found or already closed.');

    const updated = await this.prisma.trade.update({
      where: { id: tradeId },
      data: { status: 'CLOSED', closedAt: new Date(), exitPrice: trade.entryPrice, pnl: 0, pnlPercent: 0 },
    });

    this.openTradesCache.delete(tradeId);
    this.trailingHighs.delete(tradeId);
    this.trailingLows.delete(tradeId);
    console.log(`[BotService] FORCE CLOSE trade #${tradeId} ${trade.symbol} (local DB only)`);
    pubsub.publish(NEW_TRADE, { newTrade: this.serializeTrade(updated) });
    return this.serializeTrade(updated);
  }

  async resetSession(): Promise<void> {
    if (this.isRunning) await this.stop();
    await this.prisma.trade.deleteMany();
    this.openTradesCache.clear();
    this.closingInProgress.clear();
    this.trailingHighs.clear();
    this.trailingLows.clear();
    this.recentlyClosed.clear();
    console.log('[BotService] Session reset — all trades deleted');
    await this.publishStatus();
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  private async getActivePairs(): Promise<string[]> {
    const pairs = await this.prisma.tradingPair.findMany({ where: { isActive: true } });
    return pairs.map((p) => p.symbol);
  }

  async getBotStatus(): Promise<IBotStatus> {
    let state = await this.prisma.botState.findFirst();
    if (!state) state = await this.prisma.botState.create({ data: { updatedAt: new Date() } });

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

  private extractStateCache(state: any): BotStateCache {
    return {
      id: state.id,
      riskPercent: state.riskPercent,
      takeProfitPct: state.takeProfitPct,
      stopLossPct: state.stopLossPct,
      trailingStopPct: state.trailingStopPct,
      maxOpenTrades: state.maxOpenTrades,
      leverage: state.leverage,
    };
  }

  private serializeTrade(trade: any): any {
    return {
      ...trade,
      openedAt: trade.openedAt instanceof Date ? trade.openedAt.toISOString() : trade.openedAt,
      closedAt: trade.closedAt instanceof Date ? trade.closedAt.toISOString() : (trade.closedAt ?? null),
    };
  }
}
