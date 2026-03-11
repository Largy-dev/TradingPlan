import { EMA, RSI, Stochastic, ATR } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

/**
 * Strategy: Trend Continuation Scalping — 15m entries, 1h macro filter
 *
 * Root cause of previous "0 signals" bug:
 *   RSI(7) with a rising trend (EMA8 > EMA21) races to 70–85.
 *   Combining "EMA8 > EMA21" + "RSI7 ≤ 58" + "RSI7 rising" was
 *   mathematically impossible to satisfy simultaneously.
 *
 * Fix:
 *   - Switch to RSI(14): far more stable in trending markets (stays 45–65)
 *   - Use RSI as a ceiling only (not overbought): RSI14 ≤ 62 for LONG
 *   - Stochastic K > D handles the momentum direction (no need for RSI rising)
 *   - 5 clear, naturally compatible conditions
 *
 * ── LONG (all 5 required) ───────────────────────────────────────────────
 *  1. 1h  EMA21 > EMA50           → macro trend bullish
 *  2. 15m EMA8  > EMA21           → short-term trend bullish
 *  3. 15m RSI14 ≤ 62              → not overbought (room to run upward)
 *  4. 15m Stoch K ≤ 70 AND K > D → bullish momentum, not at overbought extreme
 *  5. Volume ≥ 65% avg            → real participation, not dead tape
 *     ATR  ≥ 0.08% of price       → enough volatility to profit after fees
 *
 * ── SHORT (all 5 required) ──────────────────────────────────────────────
 *  1. 1h  EMA21 < EMA50           → macro trend bearish
 *  2. 15m EMA8  < EMA21           → short-term trend bearish
 *  3. 15m RSI14 ≥ 38              → not oversold (room to run downward)
 *  4. 15m Stoch K ≥ 30 AND K < D → bearish momentum, not at oversold extreme
 *  5. Volume ≥ 65% avg AND ATR ok
 *
 * ── Recommended BotState settings ───────────────────────────────────────
 *  takeProfitPct  : 0.8   (0.8% price move = 16% on margin at 20x)
 *  stopLossPct    : 0.4   (2:1 risk-reward)
 *  trailingStopPct: 0.2
 *  riskPercent    : 3.0   (smaller size, more concurrent trades)
 *  leverage       : 20
 */
export class StrategyService implements IStrategyService {
  constructor(private readonly binanceService: IBinanceService) {}

  async analyzeSymbol(symbol: string): Promise<ISignal> {
    const empty: ISignal = {
      symbol, action: 'HOLD', confidence: 0,
      ema8: 0, ema21: 0, rsi7: 50, stochK: 50, stochD: 50,
      atrPct: 0, volumeOk: false, macroTrendBullish: false, rsi14_1h: 50,
    };

    const [klines15m, klines1h] = await Promise.all([
      this.binanceService.getKlines(symbol, '15m', 120),
      this.binanceService.getKlines(symbol, '1h', 80),
    ]);

    if (klines15m.length < 60 || klines1h.length < 55) return empty;

    // ── Arrays ────────────────────────────────────────────────────────────
    const closes15m  = klines15m.map((k) => k.close);
    const highs15m   = klines15m.map((k) => k.high);
    const lows15m    = klines15m.map((k) => k.low);
    const volumes15m = klines15m.map((k) => k.volume);
    const closes1h   = klines1h.map((k) => k.close);
    const currentPrice = closes15m.at(-1)!;

    // ── 1h macro ──────────────────────────────────────────────────────────
    const ema21_1h = EMA.calculate({ period: 21, values: closes1h }).at(-1)!;
    const ema50_1h = EMA.calculate({ period: 50, values: closes1h }).at(-1)!;
    const rsi14_1h = RSI.calculate({ period: 14, values: closes1h }).at(-1)!;
    const macroTrendBullish = ema21_1h > ema50_1h;

    // ── 15m indicators ────────────────────────────────────────────────────
    const ema8  = EMA.calculate({ period: 8,  values: closes15m }).at(-1)!;
    const ema21 = EMA.calculate({ period: 21, values: closes15m }).at(-1)!;

    // RSI(14): stable in trending markets, stays in 45–65 range during trends
    const rsi14Values = RSI.calculate({ period: 14, values: closes15m });
    const rsi14 = rsi14Values.at(-1)!;

    // Keep rsi7 in ISignal for display/debugging, compute separately
    const rsi7 = RSI.calculate({ period: 7, values: closes15m }).at(-1)!;

    const stochValues = Stochastic.calculate({
      high: highs15m, low: lows15m, close: closes15m,
      period: 14, signalPeriod: 3,
    });
    const stochK = stochValues.at(-1)?.k ?? 50;
    const stochD = stochValues.at(-1)?.d ?? 50;

    const atr    = ATR.calculate({ high: highs15m, low: lows15m, close: closes15m, period: 14 }).at(-1) ?? 0;
    const atrPct = (atr / currentPrice) * 100;

    const avgVolume = volumes15m.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const volumeOk  = volumes15m.at(-1)! >= avgVolume * 0.65;

    // ── Volatility guard: skip if ATR too small to profit after fees ───────
    if (atrPct < 0.08) {
      return { ...empty, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h };
    }

    // ── Entry signals ─────────────────────────────────────────────────────
    const longOk =
      macroTrendBullish   &&   // 1. 1h macro bullish
      ema8 > ema21        &&   // 2. 15m short-term trend up
      rsi14 <= 62         &&   // 3. RSI14 not overbought (room to move up)
      stochK <= 70        &&   // 4a. stoch not in overbought zone
      stochK > stochD     &&   // 4b. stoch momentum bullish (K above signal line)
      volumeOk;                // 5. volume confirms

    const shortOk =
      !macroTrendBullish  &&   // 1. 1h macro bearish
      ema8 < ema21        &&   // 2. 15m short-term trend down
      rsi14 >= 38         &&   // 3. RSI14 not oversold (room to move down)
      stochK >= 30        &&   // 4a. stoch not in oversold zone
      stochK < stochD     &&   // 4b. stoch momentum bearish (K below signal line)
      volumeOk;                // 5. volume confirms

    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    if (longOk) {
      action = 'LONG';
      confidence = this.computeConfidence(rsi14, stochK, atrPct);
    } else if (shortOk) {
      action = 'SHORT';
      confidence = this.computeConfidence(100 - rsi14, 100 - stochK, atrPct);
    }

    return { symbol, action, confidence, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h };
  }

  private computeConfidence(rsi: number, stochK: number, atrPct: number): number {
    let score = 0.5;
    if (rsi >= 40 && rsi <= 55) score += 0.2;  // ideal entry RSI zone
    if (stochK >= 20 && stochK <= 50) score += 0.15; // ideal stoch zone
    if (atrPct >= 0.20) score += 0.15;           // elevated volatility
    return Math.min(Math.round(score * 100) / 100, 1.0);
  }
}
