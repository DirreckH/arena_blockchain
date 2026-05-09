import type { ReactNode } from 'react'
import { TopNavigation } from '../navigation/TopNavigation'
import { RulesIntroProvider } from '../shared/RulesIntroContext'
import { InfoToast } from './InfoToast'
import { MobileTabBar } from './MobileTabBar'
import { SiteFooter } from './SiteFooter'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RulesIntroProvider>
      <div className="arena-shell">
        <TopNavigation />
        <main className="workspace layout-container">
          {children}
        </main>
        <SiteFooter />
        <InfoToast />
        <MobileTabBar />
      </div>
    </RulesIntroProvider>
  )
}
