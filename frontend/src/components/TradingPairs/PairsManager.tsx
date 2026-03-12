import { useState } from 'react';
import { ITradingPair } from '../../interfaces/ITradingPair';

interface Props {
  pairs: ITradingPair[];
  onAdd: (symbol: string) => void;
  onRemove: (id: string) => void;
  loading: boolean;
}

export function PairsManager({ pairs, onAdd, onRemove, loading }: Props) {
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
      {/* Add pair */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Add Pair</h3>
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
                <span className="font-mono font-semibold text-white text-sm">{pair.symbol}</span>
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
