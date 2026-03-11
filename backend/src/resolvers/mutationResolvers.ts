import { PrismaClient } from '@prisma/client';
import { BotService } from '../services/BotService';
import { CryptoService } from '../services/CryptoService';
import { IStrategyParams } from '../interfaces/IBotState';

export const buildMutationResolvers = (prisma: PrismaClient, botService: BotService) => ({
  saveApiKeys: async (
    _: unknown,
    { apiKey, secretKey }: { apiKey: string; secretKey: string },
  ) => {
    const existing = await prisma.config.findFirst();
    const data = {
      apiKeyEncrypted: CryptoService.encrypt(apiKey),
      secretKeyEncrypted: CryptoService.encrypt(secretKey),
      testnet: true,
    };
    const config = existing
      ? await prisma.config.update({ where: { id: existing.id }, data })
      : await prisma.config.create({ data });

    return {
      id: config.id,
      hasApiKey: true,
      testnet: config.testnet,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  },

  startBot: async () => {
    await botService.start();
    return botService.getBotStatus();
  },

  stopBot: async () => {
    await botService.stop();
    return botService.getBotStatus();
  },

  updateStrategy: async (_: unknown, { params }: { params: IStrategyParams }) => {
    let state = await prisma.botState.findFirst();
    if (!state) {
      state = await prisma.botState.create({ data: { updatedAt: new Date() } });
    }
    await prisma.botState.update({ where: { id: state.id }, data: { ...params } });
    return botService.getBotStatus();
  },

  addTradingPair: async (_: unknown, { symbol }: { symbol: string }) => {
    const pair = await prisma.tradingPair.upsert({
      where: { symbol: symbol.toUpperCase() },
      update: { isActive: true, isManual: true },
      create: { symbol: symbol.toUpperCase(), isActive: true, isManual: true },
    });
    return { ...pair, createdAt: pair.createdAt.toISOString() };
  },

  removeTradingPair: async (_: unknown, { id }: { id: string }) => {
    await prisma.tradingPair.delete({ where: { id: parseInt(id) } });
    return true;
  },

  refreshAutoPairs: async () => {
    await botService.initializeBinanceService();
    const pairs = await prisma.tradingPair.findMany({ where: { isActive: true } });
    return pairs.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));
  },

  openManualTrade: async (
    _: unknown,
    { symbol, quoteQty, positionSide }: { symbol: string; quoteQty: number; positionSide: string },
  ) => {
    return botService.openManualTrade(symbol.toUpperCase(), quoteQty, positionSide as 'LONG' | 'SHORT');
  },

  closeManualTrade: async (_: unknown, { tradeId }: { tradeId: string }) => {
    return botService.closeManualTrade(parseInt(tradeId));
  },

  forceCloseTrade: async (_: unknown, { tradeId }: { tradeId: string }) => {
    return botService.forceCloseTrade(parseInt(tradeId));
  },

  resetSession: async () => {
    await botService.resetSession();
    return true;
  },
});
