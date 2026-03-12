import { gql } from '@apollo/client';

export const GET_BOT_STATUS = gql`
  query GetBotStatus {
    botStatus {
      id isRunning strategy riskPercent takeProfitPct stopLossPct
      trailingStopPct maxOpenTrades leverage activePairs
      openPositions totalPnl balance
    }
  }
`;

export const GET_TRADES = gql`
  query GetTrades($limit: Int) {
    trades(limit: $limit) {
      id symbol side positionSide quantity entryPrice exitPrice
      pnl pnlPercent leverage status openedAt closedAt
    }
  }
`;

export const GET_TRADING_PAIRS = gql`
  query GetTradingPairs {
    tradingPairs { id symbol isActive createdAt }
  }
`;

export const GET_CONFIG_STATUS = gql`
  query GetConfigStatus {
    configStatus { id hasApiKey testnet createdAt updatedAt }
  }
`;

export const SUB_BOT_STATUS = gql`
  subscription OnBotStatusUpdated {
    botStatusUpdated {
      id isRunning strategy riskPercent takeProfitPct stopLossPct
      trailingStopPct maxOpenTrades leverage activePairs
      openPositions totalPnl balance
    }
  }
`;

export const SUB_NEW_TRADE = gql`
  subscription OnNewTrade {
    newTrade {
      id symbol side positionSide quantity entryPrice exitPrice
      pnl pnlPercent leverage status openedAt closedAt
    }
  }
`;
