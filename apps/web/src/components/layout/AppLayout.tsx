import type { ReactNode } from 'react'
import { TopNavigation } from '../navigation/TopNavigation'
import { QuickMenuPopover } from '../shared/QuickMenuPopover'
import { InfoToast } from './InfoToast'
import { MobileTabBar } from './MobileTabBar'
import { SiteFooter } from './SiteFooter'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="arena-shell">
      <TopNavigation />
      <main className="workspace layout-container">
        {children}
      </main>
      <SiteFooter />
      <InfoToast />
      <MobileTabBar />
      <QuickMenuPopover />
    </div>
  )
}
