export interface IKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface IOrderResult {
  orderId: string;
  symbol: string;
  side: string;
  positionSide: string;
  quantity: number;
  price: number;
  status: string;
}

export interface IFuturesPosition {
  symbol: string;
  positionSide: string;
  positionAmt: number;
  entryPrice: number;
  unrealizedProfit: number;
  leverage: number;
}

export interface IBinanceService {
  testConnection(): Promise<boolean>;
  getUsdtBalance(): Promise<number>;
  getKlines(symbol: string, interval: string, limit: number): Promise<IKline[]>;
  setLeverage(symbol: string, leverage: number): Promise<void>;
  openLong(symbol: string, quoteQty: number, leverage: number): Promise<IOrderResult>;
  openShort(symbol: string, quoteQty: number, leverage: number): Promise<IOrderResult>;
  closeLong(symbol: string, quantity: number): Promise<IOrderResult>;
  closeShort(symbol: string, quantity: number): Promise<IOrderResult>;
  getCurrentPrice(symbol: string): Promise<number>;
  getOpenPositions(): Promise<IFuturesPosition[]>;
}
