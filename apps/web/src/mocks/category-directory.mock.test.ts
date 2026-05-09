import { describe, expect, it } from 'vitest'
import { getPublicValidationMarkets } from '../features/validation/validation-market.mock-adapter'
import {
  CATEGORY_DIRECTORY_CONFIGS,
  CATEGORY_DIRECTORY_PATHS,
  isCategoryDirectoryPath,
} from './category-directory.mock'

describe('category directory configs', () => {
  it('covers the planned non-top category routes', () => {
    const expectedPaths = [
      '/zh/politics',
      '/zh/sports/live',
      '/zh/crypto',
      '/zh/tech',
      '/zh/geopolitics',
      '/zh/finance',
      '/zh/pop-culture',
      '/zh/economy',
      '/zh/weather',
      '/zh/surveys',
      '/zh/rolling',
    ]

    expect(CATEGORY_DIRECTORY_PATHS).toEqual(expectedPaths)
    expect(isCategoryDirectoryPath('/zh/politics')).toBe(true)
    expect(isCategoryDirectoryPath('/zh/breaking')).toBe(false)
    expect(isCategoryDirectoryPath('/zh/new')).toBe(false)
  })

  it('uses sidebar items and resolvable featured market ids', () => {
    const knownMarketIds = new Set(getPublicValidationMarkets().map((market) => market.id))

    Object.values(CATEGORY_DIRECTORY_CONFIGS).forEach((config) => {
      expect(config.sidebarItems.length).toBeGreaterThan(0)
      expect(config.marketIds.length).toBeGreaterThanOrEqual(4)
      expect(config.marketIds).toContain(config.featuredMarketId)
      expect(knownMarketIds.has(config.featuredMarketId)).toBe(true)

      config.marketIds.forEach((marketId) => {
        expect(knownMarketIds.has(marketId)).toBe(true)
      })
    })
  })
})
