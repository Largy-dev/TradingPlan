import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { CLOSE_MANUAL_TRADE, FORCE_CLOSE_TRADE, CLOSE_ALL_TRADES } from '../../graphql/mutations';
import { GET_TRADES, GET_BOT_STATUS } from '../../graphql/queries';
import { ITrade } from '../../interfaces/ITrade';

interface Props {
  trades: ITrade[];
}

export function OpenTradesTable({ trades }: Props) {
  const [failedCloseIds, setFailedCloseIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  const refetch = { refetchQueries: [{ query: GET_TRADES }, { query: GET_BOT_STATUS }] };

  const [closeTrade, { loading: closeLoading }] = useMutation(CLOSE_MANUAL_TRADE, {
    ...refetch,
    onError: (e, ctx) => {
      const tradeId = (ctx?.variables as any)?.tradeId as string;
      if (tradeId) setFailedCloseIds((prev) => new Set(prev).add(tradeId));
      setError(`Binance: ${e.message}`);
      setTimeout(() => setError(null), 6000);
    },
  });

  const [forceClose, { loading: forceLoading }] = useMutation(FORCE_CLOSE_TRADE, {
    ...refetch,
    onCompleted: (d) => {
      setFailedCloseIds((prev) => { const s = new Set(prev); s.delete(d.forceCloseTrade.id); return s; });
    },
    onError: (e) => {
      setError(e.message);
      setTimeout(() => setError(null), 6000);
    },
  });

  const [closeAll, { loading: closeAllLoading }] = useMutation(CLOSE_ALL_TRADES, {
    ...refetch,
    onCompleted: () => setConfirmCloseAll(false),
    onError: (e) => {
      setError(`Close All: ${e.message}`);
      setConfirmCloseAll(false);
      setTimeout(() => setError(null), 6000);
    },
  });

  const loading = closeLoading || forceLoading || closeAllLoading;

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Open Positions ({trades.length})</h3>
        {!confirmCloseAll ? (
          <button
            onClick={() => setConfirmCloseAll(true)}
            disabled={loading || trades.length === 0}
            className="px-3 py-1 bg-red-900 hover:bg-red-800 disabled:opacity-40 text-red-300 text-xs rounded-lg transition-colors"
          >
            Tout fermer
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Fermer toutes les positions ?</span>
            <button
              onClick={() => closeAll()}
              disabled={closeAllLoading}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
            >
              {closeAllLoading ? '...' : 'Confirmer'}
            </button>
            <button
              onClick={() => setConfirmCloseAll(false)}
              disabled={closeAllLoading}
              className="px-3 py-1 bg-dark-600 hover:bg-dark-500 disabled:opacity-50 text-gray-400 text-xs rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm border bg-red-900 bg-opacity-30 text-red-400 border-red-800">
          {error}
        </div>
      )}

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
              <th className="pb-3 font-medium"></th>
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
                <td className="py-3">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => closeTrade({ variables: { tradeId: t.id } })}
                      disabled={loading}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
                    >
                      {closeLoading ? '...' : 'Fermer'}
                    </button>
                    {failedCloseIds.has(t.id) && (
                      <button
                        onClick={() => forceClose({ variables: { tradeId: t.id } })}
                        disabled={loading}
                        title="Fermer uniquement dans la DB (si la position n'existe plus sur Binance)"
                        className="px-3 py-1 bg-orange-800 hover:bg-orange-700 disabled:opacity-50 text-orange-300 text-xs rounded-lg transition-colors"
                      >
                        {forceLoading ? '...' : 'Forcer'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
