export interface ISignal {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'HOLD';
  confidence: number;
  // 1h indicators
  ema9: number;
  ema21: number;
  rsi: number;
  macdHistogram: number;
  volumeOk: boolean;
  // 4h macro trend
  macroTrendBullish: boolean;
}

export interface IStrategyService {
  analyzeSymbol(symbol: string): Promise<ISignal>;
}
