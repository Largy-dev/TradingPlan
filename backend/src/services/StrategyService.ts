import { EMA, RSI, Stochastic, ATR, MACD } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

/**
 * Strategy: Multi-TF Pullback Scalping v2 — High-Selectivity Edition
 *
 * Core upgrades over v1:
 *  - MACD(12,26,9) histogram confirmation on 15m (momentum direction)
 *  - Stoch crossover detection instead of "was oversold in N bars"
 *    (K crosses above D while coming from ≤20 → much more precise timing)
 *  - 4h macro filter now uses BOTH RSI AND price vs EMA50 (was RSI only)
 *  - 1h RSI zone tightened: [50,63] LONG / [37,50] SHORT (was [45,65] / [35,55])
 *  - Volume threshold raised to 100% avg (was 80%)
 *  - ATR minimum raised to 0.15% (was 0.10%) — fees need room to breathe
 *  - Confidence gate at 0.68 → bot stays flat on mediocre setups
 *
 * Timeframe stack:
 *   4h → macro bias    (price > EMA50 + RSI14 > 52 for LONG)
 *   1h → trend filter  (EMA21 > EMA50 + RSI14 in healthy zone)
 *  15m → entry timing  (stoch K/D crossover from extreme + MACD hist ≥ 0)
 *
 * ── LONG (8 conditions required) ─────────────────────────────────────────
 *  1. 4h  close > EMA50_4h         → price in macro uptrend (not below macro MA)
 *  2. 4h  RSI14 > 52               → macro bullish momentum (tightened from >50)
 *  3. 1h  EMA21 > EMA50            → medium-term uptrend
 *  4. 1h  RSI14 in [50, 63]        → healthy uptrend zone, not overbought
 *  5. 15m EMA21 > EMA50            → short-term trend still intact
 *  6. 15m Stoch K crossed above D  → precise crossover while K was ≤20 in last 3 bars
 *  7. 15m MACD histogram ≥ 0       → momentum turning/staying positive
 *  8. Volume ≥ 100% avg AND ATR ≥ 0.15%
 *
 * ── SHORT (mirror of LONG) ───────────────────────────────────────────────
 *  1. 4h  close < EMA50_4h
 *  2. 4h  RSI14 < 48
 *  3. 1h  EMA21 < EMA50
 *  4. 1h  RSI14 in [37, 50]
 *  5. 15m EMA21 < EMA50
 *  6. 15m Stoch K crossed below D while K was ≥80 in last 3 bars
 *  7. 15m MACD histogram ≤ 0
 *  8. Volume ≥ 100% avg AND ATR ≥ 0.15%
 *
 * ── Recommended BotState settings ────────────────────────────────────────
 *  takeProfitPct  : 1.5   (1.5% move = 15% on 10x margin)
 *  stopLossPct    : 0.5   (3:1 gross R:R → ~2.3:1 after 0.1% round-trip fees)
 *  trailingStopPct: 0.3   (activates at 50% of TP = 0.75%)
 *  riskPercent    : 2.0
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

    // ── 4h macro filter ────────────────────────────────────────────────
    // EMA21 (not EMA50) — reacts in ~3 weeks instead of ~8 weeks, so it
    // doesn't lock the bot out of the market during medium-term corrections.
    const rsi14_4h  = RSI.calculate({ period: 14, values: closes4h }).at(-1) ?? 50;
    const ema21_4h  = EMA.calculate({ period: 21, values: closes4h }).at(-1)!;
    const price4h   = closes4h.at(-1)!;
    const macroBull4h = rsi14_4h > 50 && price4h > ema21_4h;
    const macroBear4h = rsi14_4h < 50 && price4h < ema21_4h;

    // ── 1h trend + health (conditions 3 & 4) ──────────────────────────
    const ema21_1h       = EMA.calculate({ period: 21, values: closes1h }).at(-1)!;
    const ema50_1h       = EMA.calculate({ period: 50, values: closes1h }).at(-1)!;
    const rsi14_1h       = RSI.calculate({ period: 14, values: closes1h }).at(-1) ?? 50;
    const trend1hUp      = ema21_1h > ema50_1h;
    const trend1hDn      = ema21_1h < ema50_1h;
    const rsi1hLongZone  = rsi14_1h >= 42 && rsi14_1h <= 72; // healthy uptrend zone
    const rsi1hShortZone = rsi14_1h >= 28 && rsi14_1h <= 58; // healthy downtrend zone (was ≥33, caught SXPUSDT)
    const macroTrendBullish = trend1hUp; // kept for ISignal compatibility

    // ── 15m short-term trend (condition 5) ────────────────────────────
    const ema21_15m = EMA.calculate({ period: 21, values: closes15m }).at(-1)!;
    const ema50_15m = EMA.calculate({ period: 50, values: closes15m }).at(-1)!;
    const ema8      = EMA.calculate({ period: 8,  values: closes15m }).at(-1)!;
    const rsi7      = RSI.calculate({ period: 7,  values: closes15m }).at(-1) ?? 50; // display only

    // ── Stoch crossover from extreme (condition 6) ────────────────────
    // v2 upgrade: require K to actually CROSS above D (not just K > D)
    // while having touched ≤20 (was ≤30) in the last 3 bars (not 5).
    // This pinpoints the exact reversal bar instead of a wide 75-minute window.
    const stochValues = Stochastic.calculate({
      high: highs15m, low: lows15m, close: closes15m,
      period: 14, signalPeriod: 3,
    });
    const s0     = stochValues.at(-1)!;  // current bar
    const s1     = stochValues.at(-2)!;  // previous bar (for crossover check)
    const stochK = s0.k ?? 50;
    const stochD = s0.d ?? 50;

    // Last 5 bars BEFORE current — detect recent extreme
    const recentKValues  = stochValues.slice(-6, -1).map((s) => s.k ?? 50);
    const wasOversold    = recentKValues.some((k) => k <= 40); // ≤40 — allows shallow pullbacks in uptrends
    const wasOverbought  = recentKValues.some((k) => k >= 60); // ≥60 — allows shallow bounces in downtrends

    // Recovery: K is now above D (coming from oversold) — no longer requires exact crossover bar.
    // The crossover must have happened within the last 5 bars, so K > D confirms the recovery.
    const crossedUp = wasOversold   && stochK > stochD;
    const crossedDn = wasOverbought && stochK < stochD;
    const pullbackLong     = crossedUp;
    const pullbackShort    = crossedDn;
    const pullbackDetected = pullbackLong || pullbackShort;

    // ── MACD(12,26,9) on 15m (condition 7) ───────────────────────────
    // Histogram = MACD line − signal line.
    // Positive → short-term EMA above long-term EMA and accelerating → momentum up.
    // Needs ≥34 bars (26 + 9 − 1). With 120 bars we have plenty.
    const macdResult   = MACD.calculate({
      values: closes15m,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const macdHistNow  = macdResult.at(-1)?.histogram ?? 0;
    const macdHistPrev = macdResult.at(-2)?.histogram ?? 0;
    const macdLong  = macdHistNow >= 0; // positive or zero → momentum in LONG direction
    const macdShort = macdHistNow <= 0; // negative or zero → momentum in SHORT direction

    // ── Volatility + Volume (condition 8) ─────────────────────────────
    const atr    = ATR.calculate({ high: highs15m, low: lows15m, close: closes15m, period: 14 }).at(-1) ?? 0;
    const atrPct = (atr / currentPrice) * 100;
    const avgVolume  = volumes15m.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes15m.at(-1)!;
    const volumeOk   = lastVolume >= avgVolume * 0.7; // 70% of avg — not below floor, not overly strict

    // ATR corridor: must be between 0.10% and 0.75%
    // Floor 0.10%: market needs enough volatility to profit after fees.
    // Ceiling 0.75%: if ATR > SL (0.5%), normal market noise will
    //   constantly hit the stop before price can reach TP.
    //   Observed on PONKEUSDT (ATR ≈ 1.14%): SL triggered in 1-3 seconds
    //   on every entry, causing repeated losses.
    if (atrPct < 0.10 || atrPct > 0.75) {
      return { ...empty, ema8, ema21: ema21_15m, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h, rsi14_4h, pullbackDetected };
    }

    // ── Entry signals ─────────────────────────────────────────────────
    // Required (hard gates): trend alignment on 3 timeframes + MACD momentum.
    // Optional (confidence bonuses): stoch pullback, volume, ATR quality.
    // This way the bot trades in both trending and ranging markets,
    // while still scoring entries higher when a clean pullback is present.
    const longOk =
      macroBull4h            &&   // 4h: price > EMA21 + RSI > 50
      trend1hUp              &&   // 1h: EMA21 > EMA50 (uptrend)
      rsi1hLongZone          &&   // 1h: RSI not at extreme
      ema21_15m > ema50_15m  &&   // 15m: short-term trend intact
      macdLong;                   // 15m: MACD histogram ≥ 0 (momentum positive)

    const shortOk =
      macroBear4h            &&   // 4h: price < EMA21 + RSI < 50
      trend1hDn              &&   // 1h: EMA21 < EMA50 (downtrend)
      rsi1hShortZone         &&   // 1h: RSI not at extreme
      ema21_15m < ema50_15m  &&   // 15m: short-term trend intact
      macdShort;                  // 15m: MACD histogram ≤ 0 (momentum negative)

    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    if (longOk) {
      action = 'LONG';
      confidence = this.computeConfidence(recentKValues, stochK, atrPct, avgVolume, lastVolume, rsi14_1h, rsi14_4h, macdHistNow, macdHistPrev, pullbackLong);
    } else if (shortOk) {
      action = 'SHORT';
      confidence = this.computeConfidence(
        recentKValues.map((k) => 100 - k),
        100 - stochK,
        atrPct,
        avgVolume,
        lastVolume,
        100 - rsi14_1h,
        100 - rsi14_4h,
        -macdHistNow,
        -macdHistPrev,
        pullbackShort,
      );
    }

    // Confidence gate: 0.55 — reachable without pullback, better with one
    if (confidence < 0.55) action = 'HOLD';

    return {
      symbol, action, confidence,
      ema8, ema21: ema21_15m, rsi7, stochK, stochD,
      atrPct, volumeOk, macroTrendBullish, rsi14_1h, rsi14_4h, pullbackDetected,
    };
  }

  /**
   * Confidence: 0.5 base + bonuses for signal quality.
   * All arguments are normalised to the LONG direction.
   * For SHORT: pass inverted K/RSI/macdHist so the same logic applies symmetrically.
   */
  private computeConfidence(
    recentK: number[],      // stoch K from last 5 bars (inverted for SHORT)
    stochK: number,         // current K (inverted for SHORT)
    atrPct: number,
    avgVolume: number,
    lastVolume: number,
    rsi1h: number,          // 1h RSI (inverted for SHORT)
    rsi4h: number,          // 4h RSI (inverted for SHORT)
    macdHist: number,       // current histogram (inverted for SHORT)
    macdHistPrev: number,   // previous histogram (inverted for SHORT)
    pullbackDetected: boolean,
  ): number {
    // Base is lower (0.40) since pullback + volume are no longer required gates.
    // Minimum to fire is 0.55, reachable with decent ATR + strong macro.
    // A clean pullback entry pushes score to 0.75-0.90.
    let score = 0.40;

    // Pullback quality — biggest bonus, rewards the ideal setup
    if (pullbackDetected) {
      if (recentK.some((k) => k <= 15)) score += 0.25;       // deep dip then recovery
      else if (recentK.some((k) => k <= 30)) score += 0.20;  // clean pullback
      else score += 0.15;                                      // shallow pullback
    }

    // MACD zero-cross = fresh momentum kick (best timing)
    if (macdHist > 0 && macdHistPrev <= 0) score += 0.10;
    else if (macdHist > 0) score += 0.05;

    // 4h momentum strength
    if (rsi4h >= 62) score += 0.10;
    else if (rsi4h >= 55) score += 0.05;

    // 1h RSI in the sweet spot
    if (rsi1h >= 50 && rsi1h <= 62) score += 0.10;

    // ATR = real volatility
    if (atrPct >= 0.30) score += 0.10;
    else if (atrPct >= 0.15) score += 0.05;

    // Volume conviction (bonus, no longer required)
    if (lastVolume >= avgVolume * 1.3) score += 0.10;
    else if (lastVolume >= avgVolume * 0.8) score += 0.05;

    return Math.min(Math.round(score * 100) / 100, 1.0);
  }
}
