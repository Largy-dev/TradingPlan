import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { GET_BOT_STATUS, GET_TRADES, SUB_BOT_STATUS, SUB_NEW_TRADE, GET_CONFIG_STATUS } from '../graphql/queries';
import { START_BOT, STOP_BOT } from '../graphql/mutations';
import { BotControlCard } from '../components/Dashboard/BotControlCard';
import { StatsGrid } from '../components/Dashboard/StatsGrid';
import { PnlChart } from '../components/Dashboard/PnlChart';
import { OpenTradesTable } from '../components/Dashboard/OpenTradesTable';
import { RecentTradesTable } from '../components/Dashboard/RecentTradesTable';
import { IBotStatus } from '../interfaces/IBotStatus';
import { ITrade } from '../interfaces/ITrade';

export function DashboardPage() {
  const { data: statusData, loading: statusLoading } = useQuery(GET_BOT_STATUS, { pollInterval: 30_000 });
  const { data: tradesData } = useQuery(GET_TRADES, { variables: { limit: 50 } });
  const { data: configData } = useQuery(GET_CONFIG_STATUS);

  const [startBot, { loading: startLoading }] = useMutation(START_BOT, {
    refetchQueries: [{ query: GET_BOT_STATUS }],
  });
  const [stopBot, { loading: stopLoading }] = useMutation(STOP_BOT, {
    refetchQueries: [{ query: GET_BOT_STATUS }],
  });

  useSubscription(SUB_BOT_STATUS, {
    onData: ({ client, data }) => {
      if (data.data?.botStatusUpdated) {
        client.writeQuery({
          query: GET_BOT_STATUS,
          data: { botStatus: data.data.botStatusUpdated },
        });
      }
    },
  });

  useSubscription(SUB_NEW_TRADE, {
    onData: ({ client }) => {
      client.refetchQueries({ include: [GET_TRADES] });
    },
  });

  if (statusLoading) {
    return <div className="text-gray-400 text-sm">Loading...</div>;
  }

  const status: IBotStatus = statusData?.botStatus;
  const trades: ITrade[] = tradesData?.trades ?? [];
  const hasApiKey = configData?.configStatus?.hasApiKey ?? false;

  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status === 'CLOSED').slice(0, 10);

  return (
    <div className="space-y-5">
      {!hasApiKey && (
        <div className="bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-xl p-4">
          <p className="text-yellow-400 text-sm font-medium">
            API keys not configured — go to Settings to connect your Binance Testnet account before starting the bot.
          </p>
        </div>
      )}

      {status && (
        <>
          <BotControlCard
            status={status}
            onStart={() => startBot()}
            onStop={() => stopBot()}
            loading={startLoading || stopLoading}
          />
          <StatsGrid status={status} />
          <PnlChart trades={trades} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <OpenTradesTable trades={openTrades} />
            <RecentTradesTable trades={closedTrades} />
          </div>
        </>
      )}
    </div>
  );
}
