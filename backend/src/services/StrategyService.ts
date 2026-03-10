import { EMA, RSI } from 'technicalindicators';
import { ISignal, IStrategyService } from '../interfaces/IStrategyService';
import { IBinanceService } from '../interfaces/IBinanceService';

export class StrategyService implements IStrategyService {
  constructor(private readonly binanceService: IBinanceService) {}

  async analyzeSymbol(symbol: string): Promise<ISignal> {
    const klines = await this.binanceService.getKlines(symbol, '1h', 100);

    const empty: ISignal = {
      symbol, action: 'HOLD', confidence: 0,
      ema9: 0, ema21: 0, rsi: 50, volumeOk: false,
    };

    if (klines.length < 30) return empty;

    const closes = klines.map((k) => k.close);
    const volumes = klines.map((k) => k.volume);

    const ema9Values = EMA.calculate({ period: 9, values: closes });
    const ema21Values = EMA.calculate({ period: 21, values: closes });
    const rsiValues = RSI.calculate({ period: 14, values: closes });

    const ema9 = ema9Values[ema9Values.length - 1];
    const ema9Prev = ema9Values[ema9Values.length - 2];
    const ema21 = ema21Values[ema21Values.length - 1];
    const ema21Prev = ema21Values[ema21Values.length - 2];
    const rsi = rsiValues[rsiValues.length - 1];

    const avgVolume = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[volumes.length - 1];
    const volumeOk = currentVolume > avgVolume * 1.2;

    const crossedAbove = ema9Prev < ema21Prev && ema9 > ema21;
    const crossedBelow = ema9Prev > ema21Prev && ema9 < ema21;

    let action: ISignal['action'] = 'HOLD';
    let confidence = 0;

    if (crossedAbove && rsi >= 45 && rsi <= 65 && volumeOk) {
      action = 'LONG';
      confidence = this.computeConfidence(rsi, volumeOk);
    } else if (crossedBelow && rsi >= 35 && rsi <= 55 && volumeOk) {
      action = 'SHORT';
      confidence = this.computeConfidence(100 - rsi, volumeOk);
    } else if (ema9 > ema21 && rsi > 75) {
      action = 'CLOSE_LONG';
      confidence = 0.8;
    } else if (ema9 < ema21 && rsi < 25) {
      action = 'CLOSE_SHORT';
      confidence = 0.8;
    }

    return { symbol, action, confidence, ema9, ema21, rsi, volumeOk };
  }

  private computeConfidence(rsi: number, volumeOk: boolean): number {
    let score = 0.4;
    if (rsi >= 50 && rsi <= 60) score += 0.4;
    else if (rsi >= 45) score += 0.2;
    if (volumeOk) score += 0.2;
    return Math.min(score, 1.0);
  }
}
