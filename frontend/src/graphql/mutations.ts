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
