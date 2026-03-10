import { IBotStatus } from '../../interfaces/IBotStatus';

interface Props {
  status: IBotStatus;
}

export function StatsGrid({ status }: Props) {
  const pnlPct = status.balance > 0 ? (status.totalPnl / status.balance) * 100 : 0;

  const stats = [
    {
      label: 'USDT Balance',
      value: `$${status.balance.toFixed(2)}`,
      sub: 'Available',
      color: 'text-blue-400',
      bg: 'bg-blue-900 bg-opacity-20 border-blue-800',
    },
    {
      label: 'Total PnL',
      value: `${status.totalPnl >= 0 ? '+' : ''}${status.totalPnl.toFixed(2)} USDT`,
      sub: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% portfolio`,
      color: status.totalPnl >= 0 ? 'text-green-400' : 'text-red-400',
      bg: status.totalPnl >= 0 ? 'bg-green-900 bg-opacity-20 border-green-800' : 'bg-red-900 bg-opacity-20 border-red-800',
    },
    {
      label: 'Open Positions',
      value: `${status.openPositions} / ${status.maxOpenTrades}`,
      sub: 'Slots used',
      color: 'text-yellow-400',
      bg: 'bg-yellow-900 bg-opacity-20 border-yellow-800',
    },
    {
      label: 'Active Pairs',
      value: `${status.activePairs.length}`,
      sub: status.autoSelectPairs ? 'Auto-selected' : 'Manual',
      color: 'text-purple-400',
      bg: 'bg-purple-900 bg-opacity-20 border-purple-800',
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
          <p className="text-xs text-gray-400 mb-2">{s.label}</p>
          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
