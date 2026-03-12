import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

async function main() {
  for (const symbol of DEFAULT_PAIRS) {
    await prisma.tradingPair.upsert({
      where: { symbol },
      update: {},
      create: { symbol, isActive: true },
    });
  }
  console.log(`Seeded ${DEFAULT_PAIRS.length} default trading pairs: ${DEFAULT_PAIRS.join(', ')}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
