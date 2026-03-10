export interface IBotStatus {
  id: string;
  isRunning: boolean;
  strategy: string;
  riskPercent: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxOpenTrades: number;
  leverage: number;
  autoSelectPairs: boolean;
  activePairs: string[];
  openPositions: number;
  totalPnl: number;
  balance: number;
}
