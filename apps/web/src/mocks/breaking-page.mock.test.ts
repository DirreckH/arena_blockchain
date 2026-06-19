import { describe, expect, it } from 'vitest'
import { VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS } from '../features/arena-information-boundary'
import {
  BREAKING_PAGE_CONFIG,
  getBreakingItemsForCategory,
} from './breaking-page.mock'

describe('breaking page mock', () => {
  it('exposes the expected category navigation', () => {
    expect(BREAKING_PAGE_CONFIG.categories.map((item) => item.id)).toEqual([
      'all',
      'politics',
      'global',
      'sports',
      'crypto',
      'finance',
      'tech',
      'culture',
    ])

    const coveredCategoryIds = new Set(
      BREAKING_PAGE_CONFIG.items.flatMap((item) => item.categoryIds),
    )

    BREAKING_PAGE_CONFIG.categories
      .filter((item) => item.id !== 'all')
      .forEach((item) => {
        expect(coveredCategoryIds.has(item.id)).toBe(true)
      })
  })

  it('filters items by the selected category', () => {
    const sportsItems = getBreakingItemsForCategory('sports')
    const techItems = getBreakingItemsForCategory('tech')

    expect(getBreakingItemsForCategory('all')).toHaveLength(BREAKING_PAGE_CONFIG.items.length)
    expect(sportsItems.length).toBeGreaterThan(0)
    expect(techItems.length).toBeGreaterThan(0)

    sportsItems.forEach((item) => {
      expect(item.categoryIds).toContain('sports')
    })

    techItems.forEach((item) => {
      expect(item.categoryIds).toContain('tech')
    })
  })

  it('keeps breaking items outside the forbidden market field boundary', () => {
    BREAKING_PAGE_CONFIG.items.forEach((item) => {
      VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS.forEach((field) => {
        expect(item).not.toHaveProperty(field)
      })

      expect(item.score).toBeGreaterThan(0)
      expect(item.sparkline.length).toBeGreaterThanOrEqual(4)
    })
  })
})
