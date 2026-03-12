import { EMA, RSI, Stochastic, ATR } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

/**
 * Strategy: Multi-Timeframe Pullback Scalping
 *
 * Core insight: Don't enter in the MIDDLE of a move — enter on PULLBACKS
 * within an established trend, then ride the continuation.
 *
 * Timeframe stack:
 *   4h → macro bias    (RSI14 direction — bullish > 50, bearish < 50)
 *   1h → trend filter  (EMA21 > EMA50 + RSI14 in healthy zone)
 *  15m → entry timing  (stochastic pullback recovery from extreme)
 *
 * Why pullback entries win more:
 *   - You enter AFTER a dip, so the stop is tight (just below the recent low)
 *   - You're still in trend direction → high-probability continuation
 *   - Stoch recovering from oversold is a precise, non-lagging timing tool
 *
 * ── LONG (ALL 6 conditions required) ────────────────────────────────────
 *  1. 4h  RSI14 > 50             → macro bullish bias
 *  2. 1h  EMA21 > EMA50          → medium-term uptrend
 *  3. 1h  RSI14 in [45, 65]      → healthy uptrend, not overbought
 *  4. 15m EMA21 > EMA50          → short-term trend still intact
 *  5. 15m Stoch K was ≤ 30 in last 5 bars AND current K > D
 *                                 → pullback recovery (buy the dip)
 *  6. Volume ≥ 80% avg AND ATR ≥ 0.10% → real participation + volatility
 *
 * ── SHORT (mirror of LONG) ───────────────────────────────────────────────
 *  1. 4h  RSI14 < 50             → macro bearish bias
 *  2. 1h  EMA21 < EMA50          → medium-term downtrend
 *  3. 1h  RSI14 in [35, 55]      → healthy downtrend, not oversold
 *  4. 15m EMA21 < EMA50          → short-term trend still intact
 *  5. 15m Stoch K was ≥ 70 in last 5 bars AND current K < D
 *                                 → pullback recovery (sell the bounce)
 *  6. Volume ≥ 80% avg AND ATR ≥ 0.10%
 *
 * ── Recommended BotState settings ───────────────────────────────────────
 *  takeProfitPct  : 0.8   (0.8% price move = 8% on margin at 10x)
 *  stopLossPct    : 0.4   (2:1 risk-reward)
 *  trailingStopPct: 0.2   (activates at 50% of TP = 0.4%)
 *  riskPercent    : 2.0   (conservative sizing, survive drawdowns)
 *  leverage       : 10
 *  maxOpenTrades  : 3
 */
export class StrategyService implements IStrategyService {
  constructor(private readonly binanceService: IBinanceService) {}

  async analyzeSymbol(symbol: string): Promise<ISignal> {
    const empty: ISignal = {
      symbol, action: 'HOLD', confidence: 0,
      ema8: 0, ema21: 0, rsi7: 50, stochK: 50, stochD: 50,
      atrPct: 0, volumeOk: false, macroTrendBullish: false,
      rsi14_1h: 50, rsi14_4h: 50, pullbackDetected: false,
    };

    const [klines15m, klines1h, klines4h] = await Promise.all([
      this.binanceService.getKlines(symbol, '15m', 120),
      this.binanceService.getKlines(symbol, '1h', 80),
      this.binanceService.getKlines(symbol, '4h', 60),
    ]);

    if (klines15m.length < 60 || klines1h.length < 55 || klines4h.length < 20) return empty;

    // ── Arrays ────────────────────────────────────────────────────────────
    const closes15m  = klines15m.map((k) => k.close);
    const highs15m   = klines15m.map((k) => k.high);
    const lows15m    = klines15m.map((k) => k.low);
    const volumes15m = klines15m.map((k) => k.volume);
    const closes1h   = klines1h.map((k) => k.close);
    const closes4h   = klines4h.map((k) => k.close);
    const currentPrice = closes15m.at(-1)!;

    // ── 4h macro bias (condition 1) ───────────────────────────────────────
    const rsi14_4h     = RSI.calculate({ period: 14, values: closes4h }).at(-1) ?? 50;
    const macroBull4h  = rsi14_4h > 50;

    // ── 1h trend + health (conditions 2 & 3) ──────────────────────────────
    const ema21_1h         = EMA.calculate({ period: 21, values: closes1h }).at(-1)!;
    const ema50_1h         = EMA.calculate({ period: 50, values: closes1h }).at(-1)!;
    const rsi14_1h         = RSI.calculate({ period: 14, values: closes1h }).at(-1) ?? 50;
    const trend1hUp        = ema21_1h > ema50_1h;
    const trend1hDn        = ema21_1h < ema50_1h;
    const rsi1hLongZone    = rsi14_1h >= 45 && rsi14_1h <= 65; // healthy uptrend RSI zone
    const rsi1hShortZone   = rsi14_1h >= 35 && rsi14_1h <= 55; // healthy downtrend RSI zone
    const macroTrendBullish = trend1hUp; // kept for ISignal compatibility

    // ── 15m trend + entry indicators (conditions 4 & 5) ───────────────────
    const ema21_15m = EMA.calculate({ period: 21, values: closes15m }).at(-1)!;
    const ema50_15m = EMA.calculate({ period: 50, values: closes15m }).at(-1)!;
    // ema8 kept for display on frontend only
    const ema8  = EMA.calculate({ period: 8,  values: closes15m }).at(-1)!;
    const ema21 = ema21_15m;

    // rsi7 kept for display/debugging (not used in signal logic)
    const rsi7 = RSI.calculate({ period: 7, values: closes15m }).at(-1) ?? 50;

    const stochValues = Stochastic.calculate({
      high: highs15m, low: lows15m, close: closes15m,
      period: 14, signalPeriod: 3,
    });
    const stochK = stochValues.at(-1)?.k ?? 50;
    const stochD = stochValues.at(-1)?.d ?? 50;

    // Pullback detection: was stoch at an extreme in the last 5 bars?
    const recentKValues   = stochValues.slice(-5).map((s) => s.k ?? 50);
    const wasOversold     = recentKValues.some((k) => k <= 30);  // ≤30 = dip
    const wasOverbought   = recentKValues.some((k) => k >= 70);  // ≥70 = spike
    const pullbackLong    = wasOversold   && stochK > stochD;    // recovering from dip
    const pullbackShort   = wasOverbought && stochK < stochD;    // recovering from spike
    const pullbackDetected = pullbackLong || pullbackShort;

    // ── Volatility + Volume (condition 6) ─────────────────────────────────
    const atr    = ATR.calculate({ high: highs15m, low: lows15m, close: closes15m, period: 14 }).at(-1) ?? 0;
    const atrPct = (atr / currentPrice) * 100;
    const avgVolume = volumes15m.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes15m.at(-1)!;
    const volumeOk  = lastVolume >= avgVolume * 0.80; // 80% threshold (was 65%)

    // Skip if market is too quiet to profit after fees
    if (atrPct < 0.10) {
      return { ...empty, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h, rsi14_4h, pullbackDetected };
    }

    // ── Entry signals ─────────────────────────────────────────────────────
    const longOk =
      macroBull4h            &&   // 1. 4h macro bullish bias
      trend1hUp              &&   // 2. 1h medium-term uptrend
      rsi1hLongZone          &&   // 3. 1h RSI in healthy zone (not overbought)
      ema21_15m > ema50_15m  &&   // 4. 15m short-term trend intact
      pullbackLong           &&   // 5. stoch was oversold, now recovering (buy the dip)
      volumeOk;                   // 6. real volume participation

    const shortOk =
      !macroBull4h           &&   // 1. 4h macro bearish bias
      trend1hDn              &&   // 2. 1h medium-term downtrend
      rsi1hShortZone         &&   // 3. 1h RSI in healthy zone (not oversold)
      ema21_15m < ema50_15m  &&   // 4. 15m short-term trend intact
      pullbackShort          &&   // 5. stoch was overbought, now falling (sell the bounce)
      volumeOk;                   // 6. real volume participation

    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    if (longOk) {
      action = 'LONG';
      confidence = this.computeConfidence(recentKValues, stochK, atrPct, avgVolume, lastVolume, rsi14_1h, rsi14_4h);
    } else if (shortOk) {
      action = 'SHORT';
      // Mirror all values for SHORT (invert K, RSI) so confidence logic is symmetric
      confidence = this.computeConfidence(
        recentKValues.map((k) => 100 - k),
        100 - stochK,
        atrPct,
        avgVolume,
        lastVolume,
        100 - rsi14_1h,
        100 - rsi14_4h,
      );
    }

    return { symbol, action, confidence, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h, rsi14_4h, pullbackDetected };
  }

  /**
   * Confidence: 0.5 base + bonuses for signal quality.
   * All arguments are in "LONG direction" (SHORT mirrors by inverting K/RSI before calling).
   */
  private computeConfidence(
    recentK: number[],    // stoch K values for last 5 bars (inverted for SHORT)
    stochK: number,       // current K (inverted for SHORT)
    atrPct: number,
    avgVolume: number,
    lastVolume: number,
    rsi1h: number,        // 1h RSI (inverted for SHORT)
    rsi4h: number,        // 4h RSI (inverted for SHORT)
  ): number {
    let score = 0.5;

    // Deep pullback = higher quality entry
    if (recentK.some((k) => k <= 15)) score += 0.15;        // extremely deep dip
    else if (recentK.some((k) => k <= 25)) score += 0.10;   // standard dip
    else score += 0.05;                                      // shallow dip

    // K still low = momentum just starting to recover, not chasing
    if (stochK <= 35) score += 0.10;

    // 1h RSI in sweet spot: uptrend with room to run
    if (rsi1h >= 50 && rsi1h <= 60) score += 0.10;

    // 4h momentum strong
    if (rsi4h >= 58) score += 0.05;

    // Volume surge = institutional participation
    if (lastVolume >= avgVolume * 1.3) score += 0.10;
    else if (lastVolume >= avgVolume * 1.0) score += 0.05;

    // High ATR = real volatility, easier to profit
    if (atrPct >= 0.25) score += 0.10;
    else if (atrPct >= 0.15) score += 0.05;

    return Math.min(Math.round(score * 100) / 100, 1.0);
  }
}
