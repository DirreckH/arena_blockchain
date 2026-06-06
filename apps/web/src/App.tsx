import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './app/HomePage'
import { MarketPage } from './app/MarketPage'
import { ResultsPage } from './app/ResultsPage'
import { SmartRoutePage } from './app/SmartRoutePage'
import { AdjudicationDetailPage } from './components/adjudication/AdjudicationDetailPage'
import { AppLayout } from './components/layout/AppLayout'
import { MarketDetailPage } from './components/market/MarketDetailPage'
import { NotFoundPage } from './components/shared/NotFoundPage'
import { QuickMenuProvider } from './components/shared/QuickMenuContext'
import { RulesIntroProvider } from './components/shared/RulesIntroContext'
import { ShellLanguageProvider } from './components/shared/ShellLanguageContext'

// UI layer: router and UI-state providers (auth modal, language, quick-menu) live here.
// Data providers (server state, session) are in main.tsx and wrap this entire tree.
function App() {
  return (
    <BrowserRouter>
      <RulesIntroProvider>
        <ShellLanguageProvider>
          <QuickMenuProvider>
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
    </BrowserRouter>
  )
}

export default App
