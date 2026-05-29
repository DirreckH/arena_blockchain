import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_MENU_PRIMARY_LINKS,
  ACCOUNT_MENU_SUPPORT_LINKS,
} from '../../mocks/account-shell.mock'
import {
  buildQuickMenuItems,
  QUICK_MENU_ALIAS_PATH,
} from './quick-menu.config'

describe('quick menu config', () => {
  it('removes the red-boxed entries and keeps the remaining support links in order', () => {
    const items = buildQuickMenuItems()
    const removedHrefs = new Set([
      ...ACCOUNT_MENU_PRIMARY_LINKS.map((item) => item.href),
      '/zh/activity',
    ])
    const expected = ACCOUNT_MENU_SUPPORT_LINKS.filter((item) => (
      item.href !== QUICK_MENU_ALIAS_PATH && !removedHrefs.has(item.href)
    ))

    expect(items).toEqual(expected)
    expect(items.some((item) => item.href === QUICK_MENU_ALIAS_PATH)).toBe(false)
    expect(items.some((item) => removedHrefs.has(item.href))).toBe(false)
  })
})
