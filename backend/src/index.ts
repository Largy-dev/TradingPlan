import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PrismaClient } from '@prisma/client';
import { typeDefs } from './schema/typeDefs';
import { buildResolvers } from './resolvers';
import { BotService } from './services/BotService';

const DEFAULT_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

async function seedDefaultPairs(prisma: PrismaClient): Promise<void> {
  const count = await prisma.tradingPair.count();
  if (count > 0) return; // already seeded
  for (const symbol of DEFAULT_PAIRS) {
    await prisma.tradingPair.create({ data: { symbol, isActive: true } });
  }
  console.log(`[Server] Seeded ${DEFAULT_PAIRS.length} default trading pairs`);
}

async function main() {
  const prisma = new PrismaClient();
  await seedDefaultPairs(prisma);
  const botService = new BotService(prisma);
  const resolvers = buildResolvers(prisma, botService);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const app = express();
  const httpServer = createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer({ schema }, wsServer);

  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }),
    bodyParser.json(),
    expressMiddleware(apolloServer),
  );

  const PORT = parseInt(process.env.PORT ?? '4000');
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Server ready at http://localhost:${PORT}/graphql`);
  console.log(`WebSocket ready at ws://localhost:${PORT}/graphql`);

  // Restore bot running state after Docker restart
  const savedState = await prisma.botState.findFirst();
  if (savedState?.isRunning) {
    try {
      await botService.start();
      console.log('[Server] Bot auto-restarted from saved state');
    } catch (err) {
      await prisma.botState.updateMany({ data: { isRunning: false } });
      console.warn('[Server] Could not auto-restart bot (API keys invalid?):', err);
    }
  }
}

main().catch(console.error);
