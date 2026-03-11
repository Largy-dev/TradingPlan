export interface IMarkPriceUpdate {
  symbol: string;
  markPrice: number;
  timestamp: number;
}

export interface IKlineUpdate {
  symbol: string;
  isClosed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

export type MarkPriceHandler = (data: IMarkPriceUpdate) => void;
export type KlineHandler = (data: IKlineUpdate) => void;

export interface IBinanceStreamService {
  subscribe(symbols: string[], onMarkPrice: MarkPriceHandler, onKline: KlineHandler): void;
  unsubscribe(): void;
  isConnected(): boolean;
}
