import { useState } from 'react';
import { ITradingPair } from '../../interfaces/ITradingPair';

interface Props {
  pairs: ITradingPair[];
  autoSelectEnabled: boolean;
  onAdd: (symbol: string) => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
  onToggleAuto: (enabled: boolean) => void;
  loading: boolean;
}

export function PairsManager({ pairs, autoSelectEnabled, onAdd, onRemove, onRefresh, onToggleAuto, loading }: Props) {
  const [newSymbol, setNewSymbol] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    onAdd(newSymbol.trim().toUpperCase());
    setNewSymbol('');
  };

  const activePairs = pairs.filter((p) => p.isActive);

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Pair Selection Mode</h3>
            <p className="text-xs text-gray-500 mt-1">
              {autoSelectEnabled
                ? 'Top 10 USDT pairs by 24h volume (>$10M, >2% change)'
                : 'You control which pairs to trade'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${!autoSelectEnabled ? 'text-white' : 'text-gray-500'}`}>Manual</span>
            <button
              onClick={() => onToggleAuto(!autoSelectEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${autoSelectEnabled ? 'bg-blue-600' : 'bg-dark-600'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoSelectEnabled ? 'left-7' : 'left-1'}`} />
            </button>
            <span className={`text-sm ${autoSelectEnabled ? 'text-white' : 'text-gray-500'}`}>Auto</span>
          </div>
        </div>

        {autoSelectEnabled && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm rounded-lg border border-dark-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Auto Pairs'}
          </button>
        )}
      </div>

      {/* Add manual pair */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Add Manual Pair</h3>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. BTCUSDT"
            className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
          />
          <button
            type="submit"
            disabled={loading || !newSymbol.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </form>
      </div>

      {/* Pairs list */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Active Pairs ({activePairs.length})
        </h3>

        {activePairs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">No active pairs yet</p>
        ) : (
          <div className="space-y-2">
            {activePairs.map((pair) => (
              <div key={pair.id} className="flex items-center justify-between bg-dark-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-white text-sm">{pair.symbol}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-md border ${
                    pair.isManual
                      ? 'bg-purple-900 bg-opacity-50 text-purple-300 border-purple-800'
                      : 'bg-blue-900 bg-opacity-50 text-blue-300 border-blue-800'
                  }`}>
                    {pair.isManual ? 'Manual' : 'Auto'}
                  </span>
                </div>
                <button
                  onClick={() => onRemove(pair.id)}
                  disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-900 hover:bg-opacity-20 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
