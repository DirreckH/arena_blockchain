import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '../app/HomePage'
import { MarketPage } from '../app/MarketPage'
import { ResultsPage } from '../app/ResultsPage'
import { SmartRoutePage } from '../app/SmartRoutePage'
import { AdjudicationDetailPage } from '../components/adjudication/AdjudicationDetailPage'
import { AppLayout } from '../components/layout/AppLayout'
import { MarketDetailPage } from '../components/market/MarketDetailPage'
import { NotFoundPage } from '../components/shared/NotFoundPage'
import { QuickMenuProvider } from '../components/shared/QuickMenuContext'
import { RulesIntroProvider } from '../components/shared/RulesIntroContext'
import { ShellLanguageProvider } from '../components/shared/ShellLanguageContext'
import { ArenaAccountDataProvider } from '../features/arena/account-data'
import { DiscoveryDataProvider } from '../features/arena/discovery-data'
import { ResultOverviewDataProvider } from '../features/arena/result-overview-data'
import { WatchlistDataProvider } from '../features/arena/watchlist-data'
import { AuthSessionProvider } from '../features/auth/auth-session'
import { WalletEnvironmentProvider } from '../features/auth/wallet-environment'
import { ValidationMarketDataProvider } from '../features/validation/validation-market-data'

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WalletEnvironmentProvider>
      <AuthSessionProvider>
        <ArenaAccountDataProvider>
          <ResultOverviewDataProvider>
            <WatchlistDataProvider>
              <ValidationMarketDataProvider>
                <DiscoveryDataProvider>
                  {children}
                </DiscoveryDataProvider>
              </ValidationMarketDataProvider>
            </WatchlistDataProvider>
          </ResultOverviewDataProvider>
        </ArenaAccountDataProvider>
      </AuthSessionProvider>
    </WalletEnvironmentProvider>
  )
}

export function renderApp(initialEntries: string[] = ['/zh'], extraNode?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppProviders>
        <RulesIntroProvider>
          <ShellLanguageProvider>
            <QuickMenuProvider>
              {extraNode}
              <Routes>
                <Route path="/" element={<Navigate to="/zh" replace />} />
                <Route path="/zh" element={<AppLayout><HomePage /></AppLayout>} />
                <Route path="/zh/markets" element={<AppLayout><MarketPage /></AppLayout>} />
                <Route path="/zh/results" element={<AppLayout><ResultsPage /></AppLayout>} />
                <Route path="/zh/event/:marketId" element={<AppLayout><MarketDetailPage /></AppLayout>} />
                <Route path="/zh/adjudicate/:taskId" element={<AppLayout><AdjudicationDetailPage /></AppLayout>} />
                <Route path="/zh/*" element={<AppLayout><SmartRoutePage /></AppLayout>} />
                <Route path="*" element={<AppLayout><NotFoundPage /></AppLayout>} />
              </Routes>
            </QuickMenuProvider>
          </ShellLanguageProvider>
        </RulesIntroProvider>
      </AppProviders>
    </MemoryRouter>,
  )
}
