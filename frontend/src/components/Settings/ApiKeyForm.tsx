import { useState } from 'react';

interface Props {
  hasApiKey: boolean;
  onSave: (apiKey: string, secretKey: string) => void;
  loading: boolean;
}

export function ApiKeyForm({ hasApiKey, onSave, loading }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showApi, setShowApi] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.length < 10 || secretKey.length < 10) return;
    onSave(apiKey, secretKey);
    setApiKey('');
    setSecretKey('');
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 p-6">
      <h2 className="text-base font-semibold text-white mb-1">Binance Futures Demo — API Keys</h2>
      <p className="text-xs text-gray-500 mb-4">Clés chiffrées AES-256 avant stockage</p>

      <div className="bg-blue-900 bg-opacity-30 border border-blue-800 rounded-lg p-4 mb-5 space-y-2">
        <p className="text-blue-300 text-sm font-medium">Comment obtenir tes clés</p>
        <ol className="text-blue-400 text-xs space-y-1 list-decimal list-inside">
          <li>Va sur <span className="font-mono text-blue-300">testnet.binancefuture.com</span></li>
          <li>Connecte-toi avec ton compte Binance (ou crée-en un)</li>
          <li>Dans le menu, clique sur <strong>API Key</strong></li>
          <li>Génère une paire de clés et copie-les ici</li>
        </ol>
        <p className="text-xs text-gray-500 mt-2">
          Le demo.binance.com utilise le même backend que testnet.binancefuture.com.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-green-400' : 'bg-gray-600'}`} />
        <span className={`text-sm ${hasApiKey ? 'text-green-400' : 'text-gray-400'}`}>
          {hasApiKey ? 'Clés API configurées' : 'Non configuré'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">API Key</label>
          <div className="relative">
            <input
              type={showApi ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasApiKey ? '••••••••••••••••••••••' : 'Futures Testnet API key'}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 pr-12 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button type="button" onClick={() => setShowApi(!showApi)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">
              {showApi ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Secret Key</label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={hasApiKey ? '••••••••••••••••••••••' : 'Futures Testnet secret key'}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 pr-12 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button type="button" onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">
              {showSecret ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || apiKey.length < 10 || secretKey.length < 10}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
          {loading ? 'Saving...' : hasApiKey ? 'Mettre à jour les clés' : 'Sauvegarder les clés'}
        </button>
      </form>
    </div>
  );
}
