import { describe, expect, it } from 'vitest'
import { getPublicValidationMarkets } from '../features/validation/validation-market.mock-adapter'
import { LATEST_TOPIC_ITEMS } from './latest-page.mock'

describe('latest page mock', () => {
  it('keeps latest topic labels ordered, lively, and unique', () => {
    expect(LATEST_TOPIC_ITEMS.length).toBeGreaterThanOrEqual(10)
    expect(LATEST_TOPIC_ITEMS[0]?.label).toBe('梅西 vs C 罗 GOAT')
    expect(LATEST_TOPIC_ITEMS.at(-1)?.label).toBe('县城消费升级')
    expect(LATEST_TOPIC_ITEMS.some((item) => item.label === 'James Comey')).toBe(false)
    expect(LATEST_TOPIC_ITEMS.some((item) => item.label === 'Tweet Markets')).toBe(false)

    const ids = new Set(LATEST_TOPIC_ITEMS.map((item) => item.id))

    expect(ids.size).toBe(LATEST_TOPIC_ITEMS.length)
  })

  it('maps each topic to resolvable public market ids from the new higher-energy pool', () => {
    const knownMarketIds = new Set(getPublicValidationMarkets().map((market) => market.id))
    const expectedLeadIds = new Set([
      'sports-messi-ronaldo-goat',
      'culture-concert-ticket-chaos',
      'tech-ai-search-habit',
      'crypto-meme-vs-ai-coins',
      'finance-fed-one-liner',
      'sports-hamilton-ferrari-spotlight',
      'politics-short-video-turnout',
      'geo-summit-photo-signal',
      'culture-red-carpet-over-awards',
      'tech-robot-videos-viral',
      'rolling-one-episode-viral',
      'economy-county-consumption-upgrade',
    ])

    LATEST_TOPIC_ITEMS.forEach((item) => {
      expect(item.marketIds.length).toBeGreaterThanOrEqual(6)
      expect(new Set(item.marketIds).size).toBe(item.marketIds.length)
      expect(expectedLeadIds.has(item.marketIds[0] ?? '')).toBe(true)

      item.marketIds.forEach((marketId) => {
        expect(knownMarketIds.has(marketId)).toBe(true)
      })
    })
  })
})
