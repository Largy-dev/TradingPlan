import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '◈' },
  { path: '/pairs', label: 'Trading Pairs', icon: '⊞' },
  { path: '/trades', label: 'Trades', icon: '↕' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pairs': 'Trading Pairs',
  '/trades': 'Trade History',
  '/settings': 'Settings',
};

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const pageTitle = pageTitles[location.pathname] ?? 'TradingBot';

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col">
        <div className="px-6 py-5 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <span className="text-xl text-green-400">▲</span>
            <span className="text-lg font-bold text-white tracking-wide">TradingBot</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Binance Testnet</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 bg-opacity-20 text-blue-400 border-l-2 border-blue-400'
                    : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-dark-600">
          <p className="text-xs text-gray-600">Strategy: EMA 9/21 + RSI</p>
          <p className="text-xs text-gray-600">Timeframe: 1h</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-dark-800 border-b border-dark-600 flex items-center px-6">
          <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
