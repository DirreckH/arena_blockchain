import { describe, expect, it } from 'vitest'
import { getPublicValidationMarkets } from '../features/validation/validation-market.mock-adapter'
import {
  DISCOVER_PAGE_SECTION_CONFIGS,
  DISCOVER_PAGE_SECTION_PATHS,
} from './discover-page.mock'

describe('discover page section configs', () => {
  it('covers the discover filter strip category paths', () => {
    expect(DISCOVER_PAGE_SECTION_PATHS).toEqual([
      '/zh',
      '/zh/breaking',
      '/zh/new',
      '/zh/politics',
      '/zh/sports/live',
      '/zh/crypto',
      '/zh/tech',
      '/zh/geopolitics',
      '/zh/finance',
      '/zh/pop-culture',
      '/zh/economy',
      '/zh/dao',
      '/zh/surveys',
      '/zh/rolling',
    ])
  })

  it('keeps discover preview markets resolvable and category-mapped', () => {
    const knownMarketIds = new Set(getPublicValidationMarkets().map((market) => market.id))

    Object.entries(DISCOVER_PAGE_SECTION_CONFIGS).forEach(([pathname, config]) => {
      expect(config.moreHref).toBe(pathname === '/zh' ? '/zh/markets' : pathname)
      expect(config.marketIds.length).toBeGreaterThanOrEqual(4)
      expect(new Set(config.marketIds).size).toBe(config.marketIds.length)

      config.marketIds.forEach((marketId) => {
        expect(knownMarketIds.has(marketId)).toBe(true)
      })
    })
  })
})
