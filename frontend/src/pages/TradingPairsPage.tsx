import { useQuery, useMutation } from '@apollo/client';
import { GET_TRADING_PAIRS, GET_BOT_STATUS } from '../graphql/queries';
import { ADD_TRADING_PAIR, REMOVE_TRADING_PAIR, UPDATE_STRATEGY, REFRESH_AUTO_PAIRS } from '../graphql/mutations';
import { PairsManager } from '../components/TradingPairs/PairsManager';

export function TradingPairsPage() {
  const { data: pairsData } = useQuery(GET_TRADING_PAIRS);
  const { data: statusData } = useQuery(GET_BOT_STATUS);

  const refetchQueries = [{ query: GET_TRADING_PAIRS }];

  const [addPair, { loading: addLoading }] = useMutation(ADD_TRADING_PAIR, { refetchQueries });
  const [removePair, { loading: removeLoading }] = useMutation(REMOVE_TRADING_PAIR, { refetchQueries });
  const [updateStrategy, { loading: updateLoading }] = useMutation(UPDATE_STRATEGY, {
    refetchQueries: [{ query: GET_BOT_STATUS }],
  });
  const [refreshAuto, { loading: refreshLoading }] = useMutation(REFRESH_AUTO_PAIRS, { refetchQueries });

  const pairs = pairsData?.tradingPairs ?? [];
  const autoSelectEnabled = statusData?.botStatus?.autoSelectPairs ?? true;
  const loading = addLoading || removeLoading || updateLoading || refreshLoading;

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-5">
        In auto mode, the bot picks the top 10 USDT pairs by 24h volume. You can always add manual pairs on top.
      </p>
      <PairsManager
        pairs={pairs}
        autoSelectEnabled={autoSelectEnabled}
        onAdd={(symbol) => addPair({ variables: { symbol } })}
        onRemove={(id) => removePair({ variables: { id } })}
        onRefresh={() => refreshAuto()}
        onToggleAuto={(enabled) => updateStrategy({ variables: { params: { autoSelectPairs: enabled } } })}
        loading={loading}
      />
    </div>
  );
}
