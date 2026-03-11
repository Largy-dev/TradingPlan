import { gql } from '@apollo/client';

export const SAVE_API_KEYS = gql`
  mutation SaveApiKeys($apiKey: String!, $secretKey: String!) {
    saveApiKeys(apiKey: $apiKey, secretKey: $secretKey) {
      id hasApiKey testnet updatedAt
    }
  }
`;

export const START_BOT = gql`
  mutation StartBot {
    startBot { id isRunning activePairs openPositions balance }
  }
`;

export const STOP_BOT = gql`
  mutation StopBot {
    stopBot { id isRunning }
  }
`;

export const UPDATE_STRATEGY = gql`
  mutation UpdateStrategy($params: StrategyInput!) {
    updateStrategy(params: $params) {
      id riskPercent takeProfitPct stopLossPct trailingStopPct maxOpenTrades leverage autoSelectPairs
    }
  }
`;

export const ADD_TRADING_PAIR = gql`
  mutation AddTradingPair($symbol: String!) {
    addTradingPair(symbol: $symbol) { id symbol isActive isManual createdAt }
  }
`;

export const REMOVE_TRADING_PAIR = gql`
  mutation RemoveTradingPair($id: ID!) {
    removeTradingPair(id: $id)
  }
`;

export const REFRESH_AUTO_PAIRS = gql`
  mutation RefreshAutoPairs {
    refreshAutoPairs { id symbol isActive isManual createdAt }
  }
`;

export const OPEN_MANUAL_TRADE = gql`
  mutation OpenManualTrade($symbol: String!, $quoteQty: Float!, $positionSide: String!) {
    openManualTrade(symbol: $symbol, quoteQty: $quoteQty, positionSide: $positionSide) {
      id symbol positionSide quantity entryPrice leverage status openedAt
    }
  }
`;

export const CLOSE_MANUAL_TRADE = gql`
  mutation CloseManualTrade($tradeId: ID!) {
    closeManualTrade(tradeId: $tradeId) {
      id symbol positionSide pnl pnlPercent status closedAt
    }
  }
`;

export const RESET_SESSION = gql`
  mutation ResetSession {
    resetSession
  }
`;

export const FORCE_CLOSE_TRADE = gql`
  mutation ForceCloseTrade($tradeId: ID!) {
    forceCloseTrade(tradeId: $tradeId) {
      id symbol positionSide status closedAt
    }
  }
`;

export const CLOSE_ALL_TRADES = gql`
  mutation CloseAllTrades {
    closeAllTrades { id isRunning openPositions balance totalPnl }
  }
`;
