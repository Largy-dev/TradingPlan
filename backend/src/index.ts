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

async function main() {
  const prisma = new PrismaClient();
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

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }),
    bodyParser.json(),
    expressMiddleware(apolloServer),
  );

  const PORT = parseInt(process.env.PORT ?? '4000');
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`WebSocket ready at ws://localhost:${PORT}/graphql`);
  });
}

main().catch(console.error);
