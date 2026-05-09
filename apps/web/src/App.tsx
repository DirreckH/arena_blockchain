import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './app/HomePage'
import { MarketPage } from './app/MarketPage'
import { ResultsPage } from './app/ResultsPage'
import { SmartRoutePage } from './app/SmartRoutePage'
import { AppLayout } from './components/layout/AppLayout'
import { MarketDetailPage } from './components/market/MarketDetailPage'
import { NotFoundPage } from './components/shared/NotFoundPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/zh" replace />} />
        <Route path="/zh" element={<AppLayout><HomePage /></AppLayout>} />
        <Route path="/zh/markets" element={<AppLayout><MarketPage /></AppLayout>} />
        <Route path="/zh/results" element={<AppLayout><ResultsPage /></AppLayout>} />
        <Route path="/zh/event/:marketId" element={<AppLayout><MarketDetailPage /></AppLayout>} />
        <Route path="/zh/*" element={<AppLayout><SmartRoutePage /></AppLayout>} />
        <Route path="*" element={<AppLayout><NotFoundPage /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
