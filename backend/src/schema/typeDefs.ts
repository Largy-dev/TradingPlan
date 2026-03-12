import gql from 'graphql-tag';

export const typeDefs = gql`
  type Config {
    id: ID!
    hasApiKey: Boolean!
    testnet: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type BotStatus {
    id: ID!
    isRunning: Boolean!
    strategy: String!
    riskPercent: Float!
    takeProfitPct: Float!
    stopLossPct: Float!
    trailingStopPct: Float!
    maxOpenTrades: Int!
    leverage: Int!
    activePairs: [String!]!
    openPositions: Int!
    totalPnl: Float!
    balance: Float!
  }

  type Trade {
    id: ID!
    symbol: String!
    side: String!
    positionSide: String!
    quantity: Float!
    entryPrice: Float!
    exitPrice: Float
    pnl: Float
    pnlPercent: Float
    leverage: Int!
    status: String!
    orderId: String
    openedAt: String!
    closedAt: String
  }

  type TradingPair {
    id: ID!
    symbol: String!
    isActive: Boolean!
    createdAt: String!
  }

  input StrategyInput {
    riskPercent: Float
    takeProfitPct: Float
    stopLossPct: Float
    trailingStopPct: Float
    maxOpenTrades: Int
    leverage: Int
  }

  type Query {
    botStatus: BotStatus!
    trades(limit: Int): [Trade!]!
    tradingPairs: [TradingPair!]!
    configStatus: Config
  }

  type Mutation {
    saveApiKeys(apiKey: String!, secretKey: String!): Config!
    startBot: BotStatus!
    stopBot: BotStatus!
    updateStrategy(params: StrategyInput!): BotStatus!
    addTradingPair(symbol: String!): TradingPair!
    removeTradingPair(id: ID!): Boolean!
    openManualTrade(symbol: String!, quoteQty: Float!, positionSide: String!): Trade!
    closeManualTrade(tradeId: ID!): Trade!
    forceCloseTrade(tradeId: ID!): Trade!
    resetSession: Boolean!
    closeAllTrades: BotStatus!
  }

  type Subscription {
    botStatusUpdated: BotStatus!
    newTrade: Trade!
  }
`;
