import { describe, expect, it } from 'vitest'
import {
  filterRankedMarketItems,
  type RankedMarketPageConfig,
} from './ranked-market-page'

const baseConfig: RankedMarketPageConfig = {
  pageClassName: 'hot-page',
  heroVariant: 'hot',
  dateLabel: '',
  title: 'Hot',
  description: '',
  categoryAriaLabel: '',
  listAriaLabel: '',
  categories: [],
  items: [
    {
      id: 'mkt-politics',
      href: '/zh/event/mkt-politics',
      title: 'Politics market',
      score: 80,
      change: 0,
      sparkline: [],
      categoryIds: ['politics'],
    },
    {
      id: 'mkt-tech',
      href: '/zh/event/mkt-tech',
      title: 'Tech market',
      score: 60,
      change: 0,
      sparkline: [],
      categoryIds: ['tech'],
    },
    {
      id: 'mkt-elections',
      href: '/zh/event/mkt-elections',
      title: 'Elections market',
      score: 70,
      change: 0,
      sparkline: [],
      categoryIds: ['politics'],
    },
  ],
}

describe('filterRankedMarketItems', () => {
  it('returns every item for the "all" capsule', () => {
    const result = filterRankedMarketItems(baseConfig, 'all')
    expect(result).toHaveLength(3)
  })

  it('filters by categoryIds tag membership for system capsules', () => {
    const config: RankedMarketPageConfig = {
      ...baseConfig,
      categories: [
        { id: 'politics', label: '政策' },
        { id: 'tech', label: '科技' },
      ],
    }

    const politics = filterRankedMarketItems(config, 'politics')
    expect(politics.map((item) => item.id)).toEqual(['mkt-politics', 'mkt-elections'])

    const tech = filterRankedMarketItems(config, 'tech')
    expect(tech.map((item) => item.id)).toEqual(['mkt-tech'])
  })

  it('uses explicit marketIds whitelist for custom capsules', () => {
    const config: RankedMarketPageConfig = {
      ...baseConfig,
      categories: [
        {
          id: 'cap-elections',
          label: '大选',
          marketIds: ['mkt-elections'],
        },
      ],
    }

    const elections = filterRankedMarketItems(config, 'cap-elections')
    expect(elections.map((item) => item.id)).toEqual(['mkt-elections'])
  })

  it('returns an empty list when a custom capsule whitelist matches nothing', () => {
    const config: RankedMarketPageConfig = {
      ...baseConfig,
      categories: [
        {
          id: 'cap-empty',
          label: '空',
          marketIds: ['mkt-not-on-page'],
        },
      ],
    }

    expect(filterRankedMarketItems(config, 'cap-empty')).toEqual([])
  })
})
