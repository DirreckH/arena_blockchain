import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ArenaAccountDataProvider } from './features/arena/account-data'
import { DiscoveryDataProvider } from './features/arena/discovery-data'
import { ResultOverviewDataProvider } from './features/arena/result-overview-data'
import { WatchlistDataProvider } from './features/arena/watchlist-data'
import { AuthSessionProvider } from './features/auth/auth-session'
import { WalletEnvironmentProvider } from './features/auth/wallet-environment'
import { ValidationMarketDataProvider } from './features/validation/validation-market-data'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletEnvironmentProvider>
      <AuthSessionProvider>
        <ArenaAccountDataProvider>
          <ResultOverviewDataProvider>
            <WatchlistDataProvider>
              <ValidationMarketDataProvider>
                <DiscoveryDataProvider>
                  <App />
                </DiscoveryDataProvider>
              </ValidationMarketDataProvider>
            </WatchlistDataProvider>
          </ResultOverviewDataProvider>
        </ArenaAccountDataProvider>
      </AuthSessionProvider>
    </WalletEnvironmentProvider>
  </StrictMode>,
)
