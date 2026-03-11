import { EMA, RSI, MACD } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

/**
 * Strategy: Multi-Timeframe Trend Following + MACD Momentum
 *
 * Entry logic:
 *  - 4h macro trend must align with direction (EMA20 > EMA50 for LONG, inverse for SHORT)
 *    → prevents trading against the dominant trend (the main cause of the previous losses)
 *  - 1h EMA9/EMA21 must also align (short-term trend confirmation)
 *  - 1h MACD histogram must be positive (LONG) or negative (SHORT)
 *    → confirms momentum, avoids entering a tired trend
 *  - 1h RSI in range 40-70 (LONG) or 30-60 (SHORT)
 *    → avoids overbought/oversold entries
 *
 * Exit logic (handled by BotService via TP/SL/Trailing):
 *  - Signal-based exit when RSI is extreme and EMA flip occurs
 */
export class StrategyService implements IStrategyService {
  constructor(private readonly binanceService: IBinanceService) {}

  async analyzeSymbol(symbol: string): Promise<ISignal> {
    const empty: ISignal = {
      symbol, action: 'HOLD', confidence: 0,
      ema9: 0, ema21: 0, rsi: 50, macdHistogram: 0,
      volumeOk: false, macroTrendBullish: false,
    };

    // Fetch both timeframes in parallel
    const [klines1h, klines4h] = await Promise.all([
      this.binanceService.getKlines(symbol, '1h', 120),
      this.binanceService.getKlines(symbol, '4h', 80),
    ]);

    if (klines1h.length < 50 || klines4h.length < 50) return empty;

    const closes1h = klines1h.map((k) => k.close);
    const volumes1h = klines1h.map((k) => k.volume);
    const closes4h  = klines4h.map((k) => k.close);

    // ── 4h macro trend ─────────────────────────────────────────
    const ema20_4h = EMA.calculate({ period: 20, values: closes4h });
    const ema50_4h = EMA.calculate({ period: 50, values: closes4h });
    const macroTrendBullish = ema20_4h.at(-1)! > ema50_4h.at(-1)!;

    // ── 1h indicators ──────────────────────────────────────────
    const ema9Values  = EMA.calculate({ period: 9,  values: closes1h });
    const ema21Values = EMA.calculate({ period: 21, values: closes1h });
    const rsiValues   = RSI.calculate({ period: 14, values: closes1h });

    const macdResult = MACD.calculate({
      values: closes1h,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const ema9  = ema9Values.at(-1)!;
    const ema21 = ema21Values.at(-1)!;
    const rsi   = rsiValues.at(-1)!;
    const macdHistogram = macdResult.at(-1)?.histogram ?? 0;

    const avgVolume    = volumes1h.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes1h.at(-1)!;
    const volumeOk = currentVolume >= avgVolume * 0.8;

    const trend1hBullish = ema9 > ema21;
    const trend1hBearish = ema9 < ema21;

    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    if (macroTrendBullish && trend1hBullish && macdHistogram > 0 && rsi >= 40 && rsi <= 70 && volumeOk) {
      // All three layers align bullish → strong LONG signal
      action = 'LONG';
      confidence = this.computeConfidence(rsi, macdHistogram, volumeOk);
    } else if (!macroTrendBullish && trend1hBearish && macdHistogram < 0 && rsi >= 30 && rsi <= 60 && volumeOk) {
      // All three layers align bearish → strong SHORT signal
      action = 'SHORT';
      confidence = this.computeConfidence(100 - rsi, -macdHistogram, volumeOk);
    } else if (trend1hBullish && rsi > 80) {
      action = 'CLOSE_LONG';
      confidence = 0.8;
    } else if (trend1hBearish && rsi < 20) {
      action = 'CLOSE_SHORT';
      confidence = 0.8;
    }

    return { symbol, action, confidence, ema9, ema21, rsi, macdHistogram, volumeOk, macroTrendBullish };
  }

  private computeConfidence(rsi: number, macdStrength: number, volumeOk: boolean): number {
    let score = 0.3;
    if (rsi >= 50 && rsi <= 60) score += 0.3;
    else if (rsi >= 45) score += 0.15;
    if (macdStrength > 0) score += 0.2;
    if (volumeOk) score += 0.2;
    return Math.min(score, 1.0);
  }
}
