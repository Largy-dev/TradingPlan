export interface ISignal {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'HOLD';
  confidence: number;
  // 15m short-term indicators
  ema8: number;
  ema21: number;
  rsi7: number;
  stochK: number;
  stochD: number;
  atrPct: number; // ATR as % of price — volatility measure
  volumeOk: boolean;
  // 1h macro filter
  macroTrendBullish: boolean;
  rsi14_1h: number;
}

export interface IStrategyService {
  analyzeSymbol(symbol: string): Promise<ISignal>;
}
