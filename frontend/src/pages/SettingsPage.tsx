import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_CONFIG_STATUS, GET_BOT_STATUS } from '../graphql/queries';
import { SAVE_API_KEYS, UPDATE_STRATEGY } from '../graphql/mutations';
import { ApiKeyForm } from '../components/Settings/ApiKeyForm';
import { StrategyConfig } from '../components/Settings/StrategyConfig';
import { IBotStatus } from '../interfaces/IBotStatus';

export function SettingsPage() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: configData } = useQuery(GET_CONFIG_STATUS);
  const { data: statusData } = useQuery(GET_BOT_STATUS);

  const [saveApiKeys, { loading: keysLoading }] = useMutation(SAVE_API_KEYS, {
    refetchQueries: [{ query: GET_CONFIG_STATUS }],
    onCompleted: () => showToast('API keys saved successfully', 'success'),
    onError: (err) => showToast(err.message, 'error'),
  });

  const [updateStrategy, { loading: stratLoading }] = useMutation(UPDATE_STRATEGY, {
    refetchQueries: [{ query: GET_BOT_STATUS }],
    onCompleted: () => showToast('Strategy updated', 'success'),
    onError: (err) => showToast(err.message, 'error'),
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const status: IBotStatus | undefined = statusData?.botStatus;
  const hasApiKey = configData?.configStatus?.hasApiKey ?? false;

  return (
    <div className="max-w-4xl space-y-5">
      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-green-900 bg-opacity-40 text-green-400 border border-green-800'
            : 'bg-red-900 bg-opacity-40 text-red-400 border border-red-800'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ApiKeyForm
          hasApiKey={hasApiKey}
          onSave={(apiKey, secretKey) => saveApiKeys({ variables: { apiKey, secretKey } })}
          loading={keysLoading}
        />

        {status && (
          <StrategyConfig
            status={status}
            onUpdate={(params) => updateStrategy({ variables: { params } })}
            loading={stratLoading}
          />
        )}
      </div>
    </div>
  );
}
