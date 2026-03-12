import { useQuery, useMutation } from '@apollo/client';
import { GET_TRADING_PAIRS } from '../graphql/queries';
import { ADD_TRADING_PAIR, REMOVE_TRADING_PAIR } from '../graphql/mutations';
import { PairsManager } from '../components/TradingPairs/PairsManager';

export function TradingPairsPage() {
  const { data: pairsData } = useQuery(GET_TRADING_PAIRS);

  const refetchQueries = [{ query: GET_TRADING_PAIRS }];

  const [addPair, { loading: addLoading }] = useMutation(ADD_TRADING_PAIR, { refetchQueries });
  const [removePair, { loading: removeLoading }] = useMutation(REMOVE_TRADING_PAIR, { refetchQueries });

  const pairs = pairsData?.tradingPairs ?? [];
  const loading = addLoading || removeLoading;

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-5">
        Focus on 3–4 high-volatility pairs for best results. Default pairs: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT.
      </p>
      <PairsManager
        pairs={pairs}
        onAdd={(symbol) => addPair({ variables: { symbol } })}
        onRemove={(id) => removePair({ variables: { id } })}
        loading={loading}
      />
    </div>
  );
}
