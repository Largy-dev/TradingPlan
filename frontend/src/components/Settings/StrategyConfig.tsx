import { useState, useEffect } from 'react';
import { IBotStatus } from '../../interfaces/IBotStatus';

interface Props {
  status: IBotStatus;
  onUpdate: (params: Record<string, number | boolean>) => void;
  loading: boolean;
}

function SliderField({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm text-gray-300">{label}</label>
        <span className="text-sm font-semibold text-white">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

export function StrategyConfig({ status, onUpdate, loading }: Props) {
  const [form, setForm] = useState({
    riskPercent: status.riskPercent,
    takeProfitPct: status.takeProfitPct,
    stopLossPct: status.stopLossPct,
    trailingStopPct: status.trailingStopPct,
    maxOpenTrades: status.maxOpenTrades,
    leverage: status.leverage,
  });

  useEffect(() => {
    setForm({
      riskPercent: status.riskPercent,
      takeProfitPct: status.takeProfitPct,
      stopLossPct: status.stopLossPct,
      trailingStopPct: status.trailingStopPct,
      maxOpenTrades: status.maxOpenTrades,
      leverage: status.leverage,
    });
  }, [status]);

  const rrRatio = (form.takeProfitPct / form.stopLossPct).toFixed(2);

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-white">Strategy Configuration</h2>
        <span className="text-xs text-gray-400">EMA 9/21 + RSI + Volume — Futures</span>
      </div>
      <p className="text-xs text-gray-500 mb-5">Changes take effect on the next bot tick</p>

      <div className="bg-dark-700 rounded-lg p-3 mb-5 flex items-center justify-between">
        <span className="text-sm text-gray-400">Risk / Reward</span>
        <span className={`text-sm font-bold ${parseFloat(rrRatio) >= 2 ? 'text-green-400' : 'text-yellow-400'}`}>
          1 : {rrRatio}
        </span>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onUpdate(form); }} className="space-y-5">
        <SliderField label="Leverage" value={form.leverage} min={1} max={20} step={1} unit="x"
          onChange={(v) => setForm((f) => ({ ...f, leverage: v }))} />
        <SliderField label="Risk per Trade (% of balance)" value={form.riskPercent} min={0.5} max={10} step={0.5} unit="%"
          onChange={(v) => setForm((f) => ({ ...f, riskPercent: v }))} />
        <SliderField label="Take Profit" value={form.takeProfitPct} min={1} max={20} step={0.5} unit="%"
          onChange={(v) => setForm((f) => ({ ...f, takeProfitPct: v }))} />
        <SliderField label="Stop Loss" value={form.stopLossPct} min={0.5} max={10} step={0.5} unit="%"
          onChange={(v) => setForm((f) => ({ ...f, stopLossPct: v }))} />
        <SliderField label="Trailing Stop" value={form.trailingStopPct} min={0.5} max={5} step={0.5} unit="%"
          onChange={(v) => setForm((f) => ({ ...f, trailingStopPct: v }))} />
        <SliderField label="Max Open Trades" value={form.maxOpenTrades} min={1} max={20} step={1} unit=" trades"
          onChange={(v) => setForm((f) => ({ ...f, maxOpenTrades: v }))} />

        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 rounded-lg p-3">
          <p className="text-yellow-400 text-xs">
            Avec un levier de {form.leverage}x, un TP de {form.takeProfitPct}% = <strong>+{(form.takeProfitPct * form.leverage).toFixed(1)}%</strong> sur le capital engagé.
            Un SL de {form.stopLossPct}% = <strong>-{(form.stopLossPct * form.leverage).toFixed(1)}%</strong>.
          </p>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {loading ? 'Saving...' : 'Save Strategy'}
        </button>
      </form>
    </div>
  );
}
