import { describe, expect, it } from 'vitest'
import { getPublicValidationMarkets } from '../features/validation/validation-market.mock-adapter'
import { LATEST_TOPIC_ITEMS } from './latest-page.mock'

describe('latest page mock', () => {
  it('keeps latest topic labels ordered and unique', () => {
    expect(LATEST_TOPIC_ITEMS.length).toBeGreaterThanOrEqual(10)
    expect(LATEST_TOPIC_ITEMS[0]?.label).toBe('James Comey')
    expect(LATEST_TOPIC_ITEMS.at(-1)?.label).toBe('Tweet Markets')

    const ids = new Set(LATEST_TOPIC_ITEMS.map((item) => item.id))

    expect(ids.size).toBe(LATEST_TOPIC_ITEMS.length)
  })

  it('maps each topic to resolvable public market ids', () => {
    const knownMarketIds = new Set(getPublicValidationMarkets().map((market) => market.id))

    LATEST_TOPIC_ITEMS.forEach((item) => {
      expect(item.marketIds.length).toBeGreaterThanOrEqual(6)
      expect(new Set(item.marketIds).size).toBe(item.marketIds.length)

      item.marketIds.forEach((marketId) => {
        expect(knownMarketIds.has(marketId)).toBe(true)
      })
    })
  })
})
