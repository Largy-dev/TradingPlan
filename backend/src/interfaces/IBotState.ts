export interface IBotState {
  id: number;
  isRunning: boolean;
  strategy: string;
  riskPercent: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxOpenTrades: number;
  leverage: number;
  autoSelectPairs: boolean;
}

export interface IBotStatus extends IBotState {
  activePairs: string[];
  openPositions: number;
  totalPnl: number;
  balance: number;
}

export interface IStrategyParams {
  riskPercent?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  trailingStopPct?: number;
  maxOpenTrades?: number;
  leverage?: number;
  autoSelectPairs?: boolean;
}
