import { PrismaClient } from '@prisma/client';
import { BotService } from '../services/BotService';
import { buildQueryResolvers } from './queryResolvers';
import { buildMutationResolvers } from './mutationResolvers';
import { subscriptionResolvers } from './subscriptionResolvers';

export const buildResolvers = (prisma: PrismaClient, botService: BotService) => ({
  Query: buildQueryResolvers(prisma, botService),
  Mutation: buildMutationResolvers(prisma, botService),
  Subscription: subscriptionResolvers,
});
