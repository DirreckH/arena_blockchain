import {
  ACCOUNT_MENU_PRIMARY_LINKS,
  ACCOUNT_MENU_SUPPORT_LINKS,
  type AccountShortcutLink,
} from '../../mocks/account-shell.mock'

export const QUICK_MENU_POPOVER_ID = 'arena-quick-menu-popover'
export const QUICK_MENU_ALIAS_PATH = '/zh/menu'
export const QUICK_MENU_LANGUAGE_HREF = '/zh/language'
const REMOVED_QUICK_MENU_HREFS = new Set<string>([
  ...ACCOUNT_MENU_PRIMARY_LINKS.map((item) => item.href),
  '/zh/activity',
])

export type QuickMenuItem = AccountShortcutLink

export function buildQuickMenuItems(): QuickMenuItem[] {
  return ACCOUNT_MENU_SUPPORT_LINKS.filter((item) => (
    item.href !== QUICK_MENU_ALIAS_PATH && !REMOVED_QUICK_MENU_HREFS.has(item.href)
  ))
}

export const QUICK_MENU_ITEMS = buildQuickMenuItems()
