import { ITrade } from '../../interfaces/ITrade';

interface Props {
  trades: ITrade[];
  title?: string;
}

export function RecentTradesTable({ trades, title = 'Recent Closed Trades' }: Props) {
  if (trades.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>
        <p className="text-gray-500 text-sm text-center py-6">No closed trades yet</p>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">{title} ({trades.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-dark-600">
              <th className="pb-3 font-medium">Symbol</th>
              <th className="pb-3 font-medium">Direction</th>
              <th className="pb-3 font-medium">Entry</th>
              <th className="pb-3 font-medium">Exit</th>
              <th className="pb-3 font-medium">PnL USDT</th>
              <th className="pb-3 font-medium">PnL %</th>
              <th className="pb-3 font-medium">Lev.</th>
              <th className="pb-3 font-medium">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700">
            {trades.map((t) => {
              const pnl = t.pnl ?? 0;
              const pnlPct = t.pnlPercent ?? 0;
              const positive = pnl >= 0;
              return (
                <tr key={t.id} className="hover:bg-dark-700 transition-colors">
                  <td className="py-3 font-semibold text-white">{t.symbol}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-md border font-semibold ${
                      t.positionSide === 'LONG'
                        ? 'bg-green-900 bg-opacity-50 text-green-400 border-green-800'
                        : 'bg-red-900 bg-opacity-50 text-red-400 border-red-800'
                    }`}>
                      {t.positionSide}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300">${t.entryPrice.toFixed(4)}</td>
                  <td className="py-3 text-gray-300">${(t.exitPrice ?? 0).toFixed(4)}</td>
                  <td className={`py-3 font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
                    {positive ? '+' : ''}{pnl.toFixed(2)}
                  </td>
                  <td className={`py-3 font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
                    {positive ? '+' : ''}{pnlPct.toFixed(2)}%
                  </td>
                  <td className="py-3 text-yellow-400 text-xs">{t.leverage}x</td>
                  <td className="py-3 text-gray-500 text-xs">
                    {t.closedAt ? new Date(t.closedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
