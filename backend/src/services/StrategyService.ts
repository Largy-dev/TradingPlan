import { EMA, RSI, Stochastic, ATR } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

/**
 * Strategy: Trend Pullback Scalping — 15m entries, 1h macro filter
 *
 * Philosophy: trade WITH the dominant 1h trend, enter AFTER a short pullback,
 * confirm momentum is recovering. Never chase breakouts.
 *
 * --- LONG entry (ALL conditions required) ---
 *  1. 1h EMA21 > EMA50              → macro trend is bullish (buy the dip, not the peak)
 *  2. 1h RSI14 ≤ 72                 → 1h not in extreme overbought (avoid tops)
 *  3. 15m EMA8 > EMA21              → short-term trend still up (pullback hasn't broken it)
 *  4. 15m RSI7 was ≤ 42 recently    → recent oversold dip (the pullback happened)
 *  5. 15m RSI7 now rising           → momentum recovering (the dip is over)
 *  6. 15m Stochastic K < 60         → not re-entering overbought territory yet
 *  7. 15m Stochastic K > D          → stoch cross up = momentum turning bullish
 *  8. ATR ≥ 0.10% of price          → enough volatility to profit after fees
 *  9. Volume ≥ 70% of 20-period avg → real move, not a ghost candle
 *
 * --- SHORT entry (ALL conditions required) ---
 *  1. 1h EMA21 < EMA50              → macro trend is bearish
 *  2. 1h RSI14 ≥ 28                 → 1h not in extreme oversold (avoid bottoms)
 *  3. 15m EMA8 < EMA21              → short-term trend still down
 *  4. 15m RSI7 was ≥ 58 recently    → recent overbought spike (the bounce happened)
 *  5. 15m RSI7 now falling          → momentum cracking
 *  6. 15m Stochastic K > 40         → not re-entering oversold territory yet
 *  7. 15m Stochastic K < D          → stoch cross down = momentum turning bearish
 *  8. ATR ≥ 0.10% of price
 *  9. Volume ≥ 70% of 20-period avg
 *
 * --- Recommended BotState settings for this strategy ---
 *  takeProfitPct : 0.8   (0.8% price move ≈ 16% on margin at 20x)
 *  stopLossPct   : 0.4   (0.4% price move ≈  8% on margin at 20x) → 2:1 R:R
 *  trailingStopPct: 0.2  (lock in profits as price moves)
 *  leverage      : 20
 *  riskPercent   : 3.0   (smaller size per trade, more concurrent positions)
 */
export class StrategyService implements IStrategyService {
  constructor(private readonly binanceService: IBinanceService) {}

  async analyzeSymbol(symbol: string): Promise<ISignal> {
    const empty: ISignal = {
      symbol, action: 'HOLD', confidence: 0,
      ema8: 0, ema21: 0, rsi7: 50, stochK: 50, stochD: 50,
      atrPct: 0, volumeOk: false, macroTrendBullish: false, rsi14_1h: 50,
    };

    // Fetch both timeframes in parallel: 15m for entries, 1h for macro filter
    const [klines15m, klines1h] = await Promise.all([
      this.binanceService.getKlines(symbol, '15m', 120),
      this.binanceService.getKlines(symbol, '1h', 80),
    ]);

    if (klines15m.length < 60 || klines1h.length < 55) return empty;

    // ── Extract OHLCV arrays ───────────────────────────────────────────────
    const closes15m  = klines15m.map((k) => k.close);
    const highs15m   = klines15m.map((k) => k.high);
    const lows15m    = klines15m.map((k) => k.low);
    const volumes15m = klines15m.map((k) => k.volume);
    const closes1h   = klines1h.map((k) => k.close);

    const currentPrice = closes15m.at(-1)!;

    // ── 1h macro indicators ───────────────────────────────────────────────
    const ema21_1h = EMA.calculate({ period: 21, values: closes1h }).at(-1)!;
    const ema50_1h = EMA.calculate({ period: 50, values: closes1h }).at(-1)!;
    const rsi14_1h = RSI.calculate({ period: 14, values: closes1h }).at(-1)!;
    const macroTrendBullish = ema21_1h > ema50_1h;

    // ── 15m short-term indicators ─────────────────────────────────────────
    const ema8Values  = EMA.calculate({ period: 8,  values: closes15m });
    const ema21Values = EMA.calculate({ period: 21, values: closes15m });
    const rsi7Values  = RSI.calculate({ period: 7,  values: closes15m });

    const stochValues = Stochastic.calculate({
      high: highs15m,
      low: lows15m,
      close: closes15m,
      period: 14,
      signalPeriod: 3,
    });

    const atrValues = ATR.calculate({
      high: highs15m,
      low: lows15m,
      close: closes15m,
      period: 14,
    });

    const ema8  = ema8Values.at(-1)!;
    const ema21 = ema21Values.at(-1)!;
    const rsi7  = rsi7Values.at(-1)!;
    const rsi7Prev = rsi7Values.at(-2)!;

    const stochCurrent = stochValues.at(-1)!;
    const stochPrev    = stochValues.at(-2)!;
    const stochK = stochCurrent?.k ?? 50;
    const stochD = stochCurrent?.d ?? 50;

    const atr    = atrValues.at(-1) ?? 0;
    const atrPct = (atr / currentPrice) * 100;

    // Volume: compare current candle to 20-period avg (excluding current)
    const avgVolume     = volumes15m.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes15m.at(-1)!;
    const volumeOk      = currentVolume >= avgVolume * 0.70;

    // ── Global filters ────────────────────────────────────────────────────
    // Skip if ATR too small: not enough volatility to profit after fees (0.10% fee round-trip)
    if (atrPct < 0.10) {
      return { ...empty, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h };
    }

    // ── RSI7 recent history check (last 3 candles) ────────────────────────
    const recentRsi7 = rsi7Values.slice(-4, -1); // 3 candles before current
    const recentlyOversold  = recentRsi7.some((v) => v <= 42);
    const recentlyOverbought = recentRsi7.some((v) => v >= 58);

    // ── Stochastic cross detection ────────────────────────────────────────
    // K crossed above D in the last 2 candles (turning bullish)
    const stochCrossUp   = stochK > stochD && (stochPrev?.k ?? stochK) <= (stochPrev?.d ?? stochD);
    // K crossed below D in the last 2 candles (turning bearish)
    const stochCrossDown = stochK < stochD && (stochPrev?.k ?? stochK) >= (stochPrev?.d ?? stochD);

    // ── Signal evaluation ─────────────────────────────────────────────────
    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    const longConditions = [
      macroTrendBullish,         // 1. 1h macro bullish
      rsi14_1h <= 72,            // 2. 1h not extreme overbought
      ema8 > ema21,              // 3. 15m short-term trend up
      recentlyOversold,          // 4. RSI7 dipped to oversold recently (pullback confirmed)
      rsi7 > rsi7Prev,           // 5. RSI7 now recovering (bounce started)
      stochK < 60,               // 6. stoch not re-entering overbought
      stochCrossUp,              // 7. stoch momentum cross up
      volumeOk,                  // 8. real volume
    ];

    const shortConditions = [
      !macroTrendBullish,        // 1. 1h macro bearish
      rsi14_1h >= 28,            // 2. 1h not extreme oversold
      ema8 < ema21,              // 3. 15m short-term trend down
      recentlyOverbought,        // 4. RSI7 spiked to overbought recently
      rsi7 < rsi7Prev,           // 5. RSI7 now falling (reversal started)
      stochK > 40,               // 6. stoch not re-entering oversold
      stochCrossDown,            // 7. stoch momentum cross down
      volumeOk,                  // 8. real volume
    ];

    const longScore  = longConditions.filter(Boolean).length;
    const shortScore = shortConditions.filter(Boolean).length;

    // All 8 conditions must be met for a high-conviction entry
    if (longConditions.every(Boolean)) {
      action = 'LONG';
      confidence = this.scoreToConfidence(longScore, rsi7, stochK, atrPct);
    } else if (shortConditions.every(Boolean)) {
      action = 'SHORT';
      confidence = this.scoreToConfidence(shortScore, 100 - rsi7, 100 - stochK, atrPct);
    }

    return { symbol, action, confidence, ema8, ema21, rsi7, stochK, stochD, atrPct, volumeOk, macroTrendBullish, rsi14_1h };
  }

  /**
   * Confidence score based on indicator quality at the time of entry.
   * Used for logging / future position sizing.
   */
  private scoreToConfidence(conditionsMet: number, rsi: number, stochK: number, atrPct: number): number {
    let score = conditionsMet / 8; // base: how many conditions triggered

    // Bonus: RSI in ideal "sweet spot" (30–45 for LONG, 55–70 for SHORT)
    if (rsi >= 30 && rsi <= 45) score = Math.min(score + 0.1, 1.0);

    // Bonus: stoch K in ideal range (20–45 for LONG entry)
    if (stochK >= 20 && stochK <= 45) score = Math.min(score + 0.1, 1.0);

    // Bonus: elevated volatility (more room to move)
    if (atrPct >= 0.25) score = Math.min(score + 0.05, 1.0);

    return Math.round(score * 100) / 100;
  }
}
