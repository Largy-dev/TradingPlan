export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type TradeSide = 'BUY' | 'SELL';

export interface ITrade {
  id: number;
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  status: TradeStatus;
  orderId?: string | null;
  openedAt: string;
  closedAt?: string | null;
}
