import { PrismaClient } from '@prisma/client';
import { BotService } from '../services/BotService';

export const buildQueryResolvers = (prisma: PrismaClient, botService: BotService) => ({
  botStatus: () => botService.getBotStatus(),

  trades: async (_: unknown, { limit }: { limit?: number }) => {
    const trades = await prisma.trade.findMany({
      orderBy: { openedAt: 'desc' },
      take: limit ?? 50,
    });
    return trades.map((t) => ({
      ...t,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
    }));
  },

  tradingPairs: async () => {
    const pairs = await prisma.tradingPair.findMany({ orderBy: { createdAt: 'desc' } });
    return pairs.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));
  },

  configStatus: async () => {
    const config = await prisma.config.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return null;
    return {
      id: config.id,
      hasApiKey: !!config.apiKeyEncrypted,
      testnet: config.testnet,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  },
});
