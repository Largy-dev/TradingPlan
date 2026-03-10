import { IBotStatus } from '../../interfaces/IBotStatus';

interface Props {
  status: IBotStatus;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
}

export function BotControlCard({ status, onStart, onStop, loading }: Props) {
  const pnlColor = status.totalPnl >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status.isRunning ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <div>
            <p className="text-sm text-gray-400">Bot Status</p>
            <p className={`text-lg font-bold ${status.isRunning ? 'text-green-400' : 'text-red-400'}`}>
              {status.isRunning ? 'RUNNING' : 'STOPPED'}
            </p>
          </div>
        </div>

        <button
          onClick={status.isRunning ? onStop : onStart}
          disabled={loading}
          className={`px-8 py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            status.isRunning
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {loading ? 'Loading...' : status.isRunning ? 'Stop Bot' : 'Start Bot'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Balance</p>
          <p className="text-base font-semibold text-white">${status.balance.toFixed(2)}</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Open Positions</p>
          <p className="text-base font-semibold text-white">{status.openPositions}</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Total PnL</p>
          <p className={`text-base font-semibold ${pnlColor}`}>
            {status.totalPnl >= 0 ? '+' : ''}{status.totalPnl.toFixed(2)} USDT
          </p>
        </div>
      </div>

      {status.activePairs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Active Pairs</p>
          <div className="flex flex-wrap gap-2">
            {status.activePairs.map((pair) => (
              <span key={pair} className="px-2 py-1 bg-blue-900 bg-opacity-50 text-blue-300 text-xs rounded-md border border-blue-800">
                {pair}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
