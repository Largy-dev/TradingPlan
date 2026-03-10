export interface ISignal {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'HOLD';
  confidence: number;
  ema9: number;
  ema21: number;
  rsi: number;
  volumeOk: boolean;
}

export interface IStrategyService {
  analyzeSymbol(symbol: string): Promise<ISignal>;
}
