import { pubsub, BOT_STATUS_UPDATED, NEW_TRADE } from '../services/BotService';

export const subscriptionResolvers = {
  botStatusUpdated: {
    subscribe: () => pubsub.asyncIterator([BOT_STATUS_UPDATED]),
  },
  newTrade: {
    subscribe: () => pubsub.asyncIterator([NEW_TRADE]),
  },
};
