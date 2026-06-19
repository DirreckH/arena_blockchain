import type { ReactNode } from 'react'
import { TopNavigation } from '../navigation/TopNavigation'
import { QuickMenuPopover } from '../shared/QuickMenuPopover'
import { InfoToast } from './InfoToast'
import { MobileTabBar } from './MobileTabBar'
import { SiteFooter } from './SiteFooter'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="arena-shell">
      <a className="skip-to-content" href="#main-content">
        跳到主要内容
      </a>
      <TopNavigation />
      <main id="main-content" className="workspace layout-container">
        {children}
      </main>
      <SiteFooter />
      <InfoToast />
      <MobileTabBar />
      <QuickMenuPopover />
    </div>
  )
}
