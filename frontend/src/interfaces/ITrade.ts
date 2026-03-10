export interface ITrade {
  id: string;
  symbol: string;
  side: string;
  positionSide: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  leverage: number;
  status: string;
  openedAt: string;
  closedAt?: string | null;
}
