import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { OPEN_MANUAL_TRADE, CLOSE_MANUAL_TRADE, FORCE_CLOSE_TRADE } from '../../graphql/mutations';
import { GET_TRADES } from '../../graphql/queries';
import { ITrade } from '../../interfaces/ITrade';

interface Props {
  openTrades: ITrade[];
}

export function ManualTradeCard({ openTrades }: Props) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [quoteQty, setQuoteQty] = useState(100);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [failedCloseIds, setFailedCloseIds] = useState<Set<string>>(new Set());

  const refetch = { refetchQueries: [{ query: GET_TRADES }] };

  const [openLong, { loading: longLoading }] = useMutation(OPEN_MANUAL_TRADE, {
    ...refetch,
    onCompleted: (d) => showFeedback(`LONG ouvert sur ${d.openManualTrade.symbol} @ $${d.openManualTrade.entryPrice}`, true),
    onError: (e) => showFeedback(e.message, false),
  });

  const [openShort, { loading: shortLoading }] = useMutation(OPEN_MANUAL_TRADE, {
    ...refetch,
    onCompleted: (d) => showFeedback(`SHORT ouvert sur ${d.openManualTrade.symbol} @ $${d.openManualTrade.entryPrice}`, true),
    onError: (e) => showFeedback(e.message, false),
  });

  const [closeTrade, { loading: closeLoading }] = useMutation(CLOSE_MANUAL_TRADE, {
    ...refetch,
    onCompleted: (d) => {
      const pnl = d.closeManualTrade.pnl ?? 0;
      const pct = d.closeManualTrade.pnlPercent ?? 0;
      showFeedback(`Trade fermé — PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pct.toFixed(2)}%)`, pnl >= 0);
    },
    onError: (e, ctx) => {
      const tradeId = (ctx?.variables as any)?.tradeId as string;
      if (tradeId) setFailedCloseIds((prev) => new Set(prev).add(tradeId));
      showFeedback(`Binance: ${e.message} — utilise "Forcer" pour nettoyer la DB`, false);
    },
  });

  const [forceClose, { loading: forceLoading }] = useMutation(FORCE_CLOSE_TRADE, {
    ...refetch,
    onCompleted: (d) => {
      const tradeId = d.forceCloseTrade.id;
      setFailedCloseIds((prev) => { const s = new Set(prev); s.delete(tradeId); return s; });
      showFeedback(`Position supprimée de la DB (sans ordre Binance)`, true);
    },
    onError: (e) => showFeedback(e.message, false),
  });

  const showFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleOpen = (side: 'LONG' | 'SHORT') => {
    const mutation = side === 'LONG' ? openLong : openShort;
    mutation({ variables: { symbol: symbol.toUpperCase(), quoteQty, positionSide: side } });
  };

  const loading = longLoading || shortLoading || closeLoading || forceLoading;

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Trade Manuel</h3>

      {feedback && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          feedback.ok
            ? 'bg-green-900 bg-opacity-30 text-green-400 border-green-800'
            : 'bg-red-900 bg-opacity-30 text-red-400 border-red-800'
        }`}>
          {feedback.msg}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Paire</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs text-gray-500 mb-1">Montant (USDT)</label>
          <input
            type="number"
            value={quoteQty}
            min={5}
            onChange={(e) => setQuoteQty(parseFloat(e.target.value))}
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleOpen('LONG')}
          disabled={loading}
          className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {longLoading ? '...' : '▲ LONG'}
        </button>
        <button
          onClick={() => handleOpen('SHORT')}
          disabled={loading}
          className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {shortLoading ? '...' : '▼ SHORT'}
        </button>
      </div>

      {openTrades.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-gray-500 mb-2">Positions ouvertes — cliquer pour fermer</p>
          <div className="space-y-2">
            {openTrades.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-dark-700 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-white font-mono text-sm font-semibold">{t.symbol}</span>
                  <span className={`px-2 py-0.5 text-xs rounded font-bold ${
                    t.positionSide === 'LONG'
                      ? 'bg-green-900 bg-opacity-60 text-green-400'
                      : 'bg-red-900 bg-opacity-60 text-red-400'
                  }`}>
                    {t.positionSide}
                  </span>
                  <span className="text-gray-400 text-xs">${t.entryPrice.toFixed(2)} · {t.leverage}x</span>
                </div>
                <div className="flex gap-2">
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
