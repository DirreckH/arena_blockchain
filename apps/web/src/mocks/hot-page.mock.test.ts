import { describe, expect, it } from 'vitest'
import { VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS } from '../features/arena-information-boundary'
import { HOT_PAGE_CONFIG, getHotItemsForCategory } from './hot-page.mock'

describe('hot page mock', () => {
  it('expands the hot ranking to twelve more entertainment-driven topics', () => {
    expect(HOT_PAGE_CONFIG.items).toHaveLength(12)
    expect(HOT_PAGE_CONFIG.items.some((item) => item.title.includes('梅西比 C 罗更配得上现代足球 GOAT'))).toBe(true)
    expect(HOT_PAGE_CONFIG.items.some((item) => item.title.includes('比特币网络手续费是否会在本月维持高拥堵状态'))).toBe(false)
  })

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

    const coveredCategoryIds = new Set<string>(
      HOT_PAGE_CONFIG.items.flatMap((item) => item.categoryIds),
    )

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
