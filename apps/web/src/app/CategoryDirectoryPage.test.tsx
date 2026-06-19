import { describe, expect, it } from 'vitest'
import { filterMarketsByActiveSidebar } from './CategoryDirectoryPage'

const markets = [
  { id: 'mkt-1', title: 'Market 1' },
  { id: 'mkt-2', title: 'Market 2' },
  { id: 'mkt-3', title: 'Market 3' },
]

describe('filterMarketsByActiveSidebar', () => {
  it('returns the full list when no sidebar entry is selected', () => {
    expect(filterMarketsByActiveSidebar(markets, null)).toEqual(markets)
  })

  it('returns the full list when the active entry has no marketIds', () => {
    expect(
      filterMarketsByActiveSidebar(markets, { label: '全部', count: '3' }),
    ).toEqual(markets)
  })

  it('returns the full list when the active entry has an empty marketIds whitelist', () => {
    expect(
      filterMarketsByActiveSidebar(markets, { label: '全部', count: '3', marketIds: [] }),
    ).toEqual(markets)
  })

  it('filters the list to the whitelisted ids when present', () => {
    const filtered = filterMarketsByActiveSidebar(markets, {
      label: '焦点',
      count: '2',
      marketIds: ['mkt-1', 'mkt-3'],
    })
    expect(filtered.map((item) => item.id)).toEqual(['mkt-1', 'mkt-3'])
  })

  it('keeps result order matching the input list', () => {
    const filtered = filterMarketsByActiveSidebar(markets, {
      label: '焦点',
      count: '2',
      // Whitelist intentionally in reverse order. The output must follow the
      // input markets order, not the whitelist order.
      marketIds: ['mkt-3', 'mkt-1'],
    })
    expect(filtered.map((item) => item.id)).toEqual(['mkt-1', 'mkt-3'])
  })
})
