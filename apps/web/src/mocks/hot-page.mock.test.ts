import { describe, expect, it } from 'vitest'
import { VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS } from '../features/arena-information-boundary'
import { HOT_PAGE_CONFIG, getHotItemsForCategory } from './hot-page.mock'

describe('hot page mock', () => {
  it('exposes the expected category navigation', () => {
    expect(HOT_PAGE_CONFIG.categories.map((item) => item.id)).toEqual([
      'all',
      'politics',
      'global',
      'sports',
      'crypto',
      'finance',
      'tech',
      'culture',
    ])

    const coveredCategoryIds = new Set(HOT_PAGE_CONFIG.items.flatMap((item) => item.categoryIds))

    HOT_PAGE_CONFIG.categories
      .filter((item) => item.id !== 'all')
      .forEach((item) => {
        expect(coveredCategoryIds.has(item.id)).toBe(true)
      })
  })

  it('filters items by the selected category', () => {
    const sportsItems = getHotItemsForCategory('sports')
    const financeItems = getHotItemsForCategory('finance')

    expect(getHotItemsForCategory('all')).toHaveLength(HOT_PAGE_CONFIG.items.length)
    expect(sportsItems.length).toBeGreaterThan(0)
    expect(financeItems.length).toBeGreaterThan(0)

    sportsItems.forEach((item) => {
      expect(item.categoryIds).toContain('sports')
    })

    financeItems.forEach((item) => {
      expect(item.categoryIds).toContain('finance')
    })
  })

  it('keeps hot items outside the forbidden market field boundary', () => {
    HOT_PAGE_CONFIG.items.forEach((item) => {
      VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS.forEach((field) => {
        expect(item).not.toHaveProperty(field)
      })

      expect(item.score).toBeGreaterThan(0)
      expect(item.sparkline.length).toBeGreaterThanOrEqual(4)
    })
  })
})
