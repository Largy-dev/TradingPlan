import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ITrade } from '../../interfaces/ITrade';

interface Props {
  trades: ITrade[];
}

export function PnlChart({ trades }: Props) {
  const closed = trades
    .filter((t) => t.status === 'CLOSED' && t.closedAt && t.pnl != null)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

  if (closed.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-6 flex items-center justify-center h-48">
        <p className="text-gray-500 text-sm">No closed trades yet — chart will appear here</p>
      </div>
    );
  }

  let cumPnl = 0;
  const data = closed.map((t) => {
    cumPnl += t.pnl!;
    const date = new Date(t.closedAt!);
    return {
      date: `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`,
      pnl: parseFloat(cumPnl.toFixed(2)),
    };
  });

  const isPositive = data[data.length - 1].pnl >= 0;
  const color = isPositive ? '#4ade80' : '#f87171';

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Cumulative PnL (USDT)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d55" />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f1629', border: '1px solid #1e2d55', borderRadius: '8px' }}
            labelStyle={{ color: '#9ca3af' }}
            itemStyle={{ color }}
            formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)} USDT`, 'PnL']}
          />
          <Area type="monotone" dataKey="pnl" stroke={color} fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
