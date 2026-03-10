import { useState } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { GET_TRADES, SUB_NEW_TRADE } from '../graphql/queries';
import { PnlChart } from '../components/Dashboard/PnlChart';
import { RecentTradesTable } from '../components/Dashboard/RecentTradesTable';
import { OpenTradesTable } from '../components/Dashboard/OpenTradesTable';
import { ITrade } from '../interfaces/ITrade';

type Filter = 'ALL' | 'OPEN' | 'CLOSED';

export function TradesPage() {
  const [filter, setFilter] = useState<Filter>('ALL');

  const { data } = useQuery(GET_TRADES, { variables: { limit: 100 } });

  useSubscription(SUB_NEW_TRADE, {
    onData: ({ client }) => {
      client.refetchQueries({ include: [GET_TRADES] });
    },
  });

  const allTrades: ITrade[] = data?.trades ?? [];
  const closedTrades = allTrades.filter((t) => t.status === 'CLOSED');
  const openTrades = allTrades.filter((t) => t.status === 'OPEN');

  const winningTrades = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
  const winRate = closedTrades.length > 0
    ? ((winningTrades.length / closedTrades.length) * 100).toFixed(1)
    : '0';
  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const bestPnl = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl ?? 0)) : 0;
  const worstPnl = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl ?? 0)) : 0;

  const filteredTrades = filter === 'OPEN' ? openTrades : filter === 'CLOSED' ? closedTrades : allTrades;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Trades', value: allTrades.length.toString(), color: 'text-white' },
          { label: 'Win Rate', value: `${winRate}%`, color: winRate >= '50' ? 'text-green-400' : 'text-red-400' },
          { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`, color: totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Best Trade', value: `+${bestPnl.toFixed(2)} USDT`, color: 'text-green-400' },
        ].map((s) => (
          <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <PnlChart trades={allTrades} />

      {/* Filter tabs */}
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-lg p-1 w-fit">
        {(['ALL', 'OPEN', 'CLOSED'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {f} {f === 'OPEN' ? `(${openTrades.length})` : f === 'CLOSED' ? `(${closedTrades.length})` : `(${allTrades.length})`}
          </button>
        ))}
      </div>

      {filter === 'OPEN' ? (
        <OpenTradesTable trades={openTrades} />
      ) : (
        <RecentTradesTable
          trades={filter === 'ALL' ? closedTrades : filteredTrades.filter((t) => t.status === 'CLOSED')}
          title={filter === 'ALL' ? 'All Closed Trades' : 'Closed Trades'}
        />
      )}
    </div>
  );
}
