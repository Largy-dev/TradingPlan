import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { IBinanceService, IKline, ITickerInfo, IOrderResult, IFuturesPosition } from '../interfaces/IBinanceService';

const STABLECOINS = new Set([
  'BUSDUSDT', 'USDCUSDT', 'TUSDUSDT', 'DAIUSDT',
  'USTUSDT', 'FDUSDUSDT', 'USDPUSDT',
]);

export class BinanceService implements IBinanceService {
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly secretKey: string;

  constructor(apiKey: string, secretKey: string, testnet = true) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    const baseURL = testnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    this.http = axios.create({
      baseURL,
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    // Surface the real Binance error message instead of generic "Request failed with status 400"
    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const data = err?.response?.data;
        if (data?.msg) {
          const binanceErr = new Error(`Binance error ${data.code}: ${data.msg}`);
          return Promise.reject(binanceErr);
        }
        return Promise.reject(err);
      },
    );
  }

  private sign(params: Record<string, string | number>): string {
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) entries[k] = String(v);
    const query = new URLSearchParams(entries).toString();
    return crypto.createHmac('sha256', this.secretKey).update(query).digest('hex');
  }

  private signedParams(params: Record<string, string | number> = {}): Record<string, string | number> {
    const timestamp = Date.now();
    const full = { ...params, timestamp };
    return { ...full, signature: this.sign(full) };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.http.get('/fapi/v1/ping');
      await this.enableHedgeMode();
      return true;
    } catch {
      return false;
    }
  }

  // Active le Hedge Mode (positions LONG et SHORT simultanées)
  // Binance renvoie -4059 si déjà activé — on ignore cette erreur
  private async enableHedgeMode(): Promise<void> {
    try {
      await this.http.post('/fapi/v1/positionSide/dual', null, {
        params: this.signedParams({ dualSidePosition: 'true' }),
      });
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code !== -4059) {
        console.warn('[BinanceService] enableHedgeMode warning:', err?.response?.data?.msg ?? err.message);
      }
    }
  }

  async getUsdtBalance(): Promise<number> {
    const { data } = await this.http.get('/fapi/v2/balance', {
      params: this.signedParams(),
    });
    const usdt = (data as any[]).find((b: any) => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.availableBalance) : 0;
  }

  async getKlines(symbol: string, interval = '1h', limit = 100): Promise<IKline[]> {
    const { data } = await this.http.get('/fapi/v1/klines', {
      params: { symbol, interval, limit },
    });
    return (data as any[]).map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  }

  async getTopFuturesPairs(minVolume = 10_000_000, minPriceChangePct = 2, limit = 10): Promise<ITickerInfo[]> {
    const { data } = await this.http.get('/fapi/v1/ticker/24hr');
    return (data as any[])
      .filter((t: any) => {
        const symbol: string = t.symbol;
        return (
          symbol.endsWith('USDT') &&
          !STABLECOINS.has(symbol) &&
          parseFloat(t.quoteVolume) >= minVolume &&
          Math.abs(parseFloat(t.priceChangePercent)) >= minPriceChangePct
        );
      })
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map((t: any) => ({
        symbol: t.symbol,
        priceChangePercent: parseFloat(t.priceChangePercent),
        quoteVolume: parseFloat(t.quoteVolume),
        lastPrice: parseFloat(t.lastPrice),
      }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.http.post('/fapi/v1/leverage', null, {
      params: this.signedParams({ symbol, leverage }),
    });
  }

  async openLong(symbol: string, quoteQty: number, leverage: number): Promise<IOrderResult> {
    await this.setLeverage(symbol, leverage);
    const price = await this.getCurrentPrice(symbol);
    const precision = await this.getQuantityPrecision(symbol);
    const quantity = parseFloat(((quoteQty * leverage) / price).toFixed(precision));

    const { data } = await this.http.post('/fapi/v1/order', null, {
      params: this.signedParams({ symbol, side: 'BUY', positionSide: 'LONG', type: 'MARKET', quantity }),
    });
    return {
      orderId: String(data.orderId),
      symbol: data.symbol,
      side: 'BUY',
      positionSide: 'LONG',
      quantity: parseFloat(data.executedQty || quantity),
      price: parseFloat(data.avgPrice) || price,
      status: data.status,
    };
  }

  async openShort(symbol: string, quoteQty: number, leverage: number): Promise<IOrderResult> {
    await this.setLeverage(symbol, leverage);
    const price = await this.getCurrentPrice(symbol);
    const precision = await this.getQuantityPrecision(symbol);
    const quantity = parseFloat(((quoteQty * leverage) / price).toFixed(precision));

    const { data } = await this.http.post('/fapi/v1/order', null, {
      params: this.signedParams({ symbol, side: 'SELL', positionSide: 'SHORT', type: 'MARKET', quantity }),
    });
    return {
      orderId: String(data.orderId),
      symbol: data.symbol,
      side: 'SELL',
      positionSide: 'SHORT',
      quantity: parseFloat(data.executedQty || quantity),
      price: parseFloat(data.avgPrice) || price,
      status: data.status,
    };
  }

  async closeLong(symbol: string, quantity: number): Promise<IOrderResult> {
    const precision = await this.getQuantityPrecision(symbol);
    const qty = parseFloat(quantity.toFixed(precision));
    const { data } = await this.http.post('/fapi/v1/order', null, {
      params: this.signedParams({ symbol, side: 'SELL', positionSide: 'LONG', type: 'MARKET', quantity: qty }),
    });
    return {
      orderId: String(data.orderId),
      symbol: data.symbol,
      side: 'SELL',
      positionSide: 'LONG',
      quantity: parseFloat(data.executedQty || qty),
      price: parseFloat(data.avgPrice) || 0,
      status: data.status,
    };
  }

  async closeShort(symbol: string, quantity: number): Promise<IOrderResult> {
    const precision = await this.getQuantityPrecision(symbol);
    const qty = parseFloat(quantity.toFixed(precision));
    const { data } = await this.http.post('/fapi/v1/order', null, {
      params: this.signedParams({ symbol, side: 'BUY', positionSide: 'SHORT', type: 'MARKET', quantity: qty }),
    });
    return {
      orderId: String(data.orderId),
      symbol: data.symbol,
      side: 'BUY',
      positionSide: 'SHORT',
      quantity: parseFloat(data.executedQty || qty),
      price: parseFloat(data.avgPrice) || 0,
      status: data.status,
    };
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const { data } = await this.http.get('/fapi/v1/ticker/price', { params: { symbol } });
    return parseFloat((data as any).price);
  }

  async getOpenPositions(): Promise<IFuturesPosition[]> {
    const { data } = await this.http.get('/fapi/v2/positionRisk', {
      params: this.signedParams(),
    });
    return (data as any[])
      .filter((p: any) => Math.abs(parseFloat(p.positionAmt)) > 0)
      .map((p: any) => ({
        symbol: p.symbol,
        positionSide: p.positionSide,
        positionAmt: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice),
        unrealizedProfit: parseFloat(p.unRealizedProfit),
        leverage: parseInt(p.leverage),
      }));
  }

  private async getQuantityPrecision(symbol: string): Promise<number> {
    try {
      const { data } = await this.http.get('/fapi/v1/exchangeInfo');
      const info = (data as any).symbols.find((s: any) => s.symbol === symbol);
      return info?.quantityPrecision ?? 3;
    } catch {
      return 3;
    }
  }
}
