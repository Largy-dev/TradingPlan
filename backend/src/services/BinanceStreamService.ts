import WebSocket from 'ws';
import {
  IBinanceStreamService,
  IMarkPriceUpdate,
  IKlineUpdate,
  MarkPriceHandler,
  KlineHandler,
} from '../interfaces/IBinanceStreamService';

const WS_BASE = {
  testnet: 'wss://stream.binancefuture.com/stream',
  mainnet: 'wss://fstream.binance.com/stream',
};

const MAX_RECONNECT_DELAY_MS = 30_000;

export class BinanceStreamService implements IBinanceStreamService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1_000;
  private markPriceHandler: MarkPriceHandler | null = null;
  private klineHandler: KlineHandler | null = null;
  private symbols: string[] = [];
  private active = false;

  constructor(private readonly testnet: boolean) {}

  subscribe(symbols: string[], onMarkPrice: MarkPriceHandler, onKline: KlineHandler): void {
    this.unsubscribe();
    this.symbols = symbols;
    this.markPriceHandler = onMarkPrice;
    this.klineHandler = onKline;
    this.active = true;
    this.reconnectDelay = 1_000;
    this.connect();
  }

  unsubscribe(): void {
    this.active = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private buildUrl(): string {
    const base = this.testnet ? WS_BASE.testnet : WS_BASE.mainnet;
    const streams = this.symbols.flatMap((s) => {
      const lower = s.toLowerCase();
      return [`${lower}@markPrice@1s`, `${lower}@kline_1h`];
    });
    return `${base}?streams=${streams.join('/')}`;
  }

  private connect(): void {
    if (!this.active || this.symbols.length === 0) return;
    const url = this.buildUrl();
    console.log(`[BinanceStream] Connecting — ${this.symbols.length} symbols`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[BinanceStream] Connected');
      this.reconnectDelay = 1_000;
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        const data = msg.data;
        if (!data) return;

        if (data.e === 'markPriceUpdate') {
          this.markPriceHandler?.({
            symbol: data.s,
            markPrice: parseFloat(data.p),
            timestamp: data.E,
          });
        } else if (data.e === 'kline') {
          const k = data.k;
          this.klineHandler?.({
            symbol: data.s,
            isClosed: k.x,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            openTime: k.t,
          });
        }
      } catch (err) {
        console.error('[BinanceStream] Parse error:', err);
      }
    });

    this.ws.on('close', () => {
      if (!this.active) return;
      console.warn(`[BinanceStream] Disconnected — reconnecting in ${this.reconnectDelay}ms`);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      console.error('[BinanceStream] Error:', err.message);
      this.ws?.terminate();
    });
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      this.connect();
    }, this.reconnectDelay);
  }
}
