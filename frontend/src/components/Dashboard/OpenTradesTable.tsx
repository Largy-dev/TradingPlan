import { ITrade } from '../../interfaces/ITrade';

interface Props {
  trades: ITrade[];
}

export function OpenTradesTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Open Positions</h3>
        <p className="text-gray-500 text-sm text-center py-6">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Open Positions ({trades.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-dark-600">
              <th className="pb-3 font-medium">Symbol</th>
              <th className="pb-3 font-medium">Direction</th>
              <th className="pb-3 font-medium">Entry</th>
              <th className="pb-3 font-medium">Qty</th>
              <th className="pb-3 font-medium">Leverage</th>
              <th className="pb-3 font-medium">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700">
            {trades.map((t) => (
              <tr key={t.id} className="hover:bg-dark-700 transition-colors">
                <td className="py-3 font-semibold text-white">{t.symbol}</td>
                <td className="py-3">
                  <span className={`px-2 py-1 text-xs rounded-md border font-semibold ${
                    t.positionSide === 'LONG'
                      ? 'bg-green-900 bg-opacity-50 text-green-400 border-green-800'
                      : 'bg-red-900 bg-opacity-50 text-red-400 border-red-800'
                  }`}>
                    {t.positionSide}
                  </span>
                </td>
                <td className="py-3 text-gray-300">${t.entryPrice.toFixed(4)}</td>
                <td className="py-3 text-gray-300">{t.quantity}</td>
                <td className="py-3 text-yellow-400 font-medium">{t.leverage}x</td>
                <td className="py-3 text-gray-500 text-xs">{new Date(t.openedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
