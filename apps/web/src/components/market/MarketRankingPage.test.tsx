import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MarketRankingPage } from './MarketRankingPage'
import { BREAKING_PAGE_CONFIG } from '../../mocks/breaking-page.mock'
import { HOT_PAGE_CONFIG } from '../../mocks/hot-page.mock'
import type { RankedMarketPageConfig } from '../../features/arena/ranked-market-page'

function renderRankingPage(config: RankedMarketPageConfig, showSearch = false) {
  return render(
    <MemoryRouter>
      <MarketRankingPage config={config} showSearch={showSearch} />
    </MemoryRouter>,
  )
}

function buildRankingConfig(itemCount: number): RankedMarketPageConfig {
  return {
    pageClassName: 'test-ranking-page',
    heroVariant: 'hot',
    dateLabel: '2026-06-06',
    title: 'Test ranking',
    description: 'Synthetic ranking fixture',
    categoryAriaLabel: 'Test ranking categories',
    listAriaLabel: 'Test ranking list',
    categories: [
      { id: 'all', label: 'All' },
      { id: 'sports', label: 'Sports' },
      { id: 'tech', label: 'Tech' },
    ],
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `ranking-item-${index + 1}`,
      href: `/zh/event/ranking-item-${index + 1}`,
      title: index < 4 ? `Sports ranking ${index + 1}` : `Tech ranking ${index + 1}`,
      score: 100 - index,
      change: 20 - index,
      sparkline: [30, 40, 50, 60, 70, 80],
      categoryIds: index < 4 ? ['sports'] : ['tech'],
    })),
  }
}

describe('MarketRankingPage', () => {
  it('renders the ranking list without the banner hero on breaking pages', () => {
    const { container } = renderRankingPage(BREAKING_PAGE_CONFIG)

    expect(screen.getByRole('tablist', { name: BREAKING_PAGE_CONFIG.categoryAriaLabel })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: BREAKING_PAGE_CONFIG.listAriaLabel })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: BREAKING_PAGE_CONFIG.items[0].title })).toBeInTheDocument()
    expect(container.querySelector('.breaking-hero')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: BREAKING_PAGE_CONFIG.title })).not.toBeInTheDocument()
  })

  it('renders the ranking list without the banner hero on hot pages', () => {
    const { container } = renderRankingPage(HOT_PAGE_CONFIG)

    expect(screen.getByRole('tablist', { name: HOT_PAGE_CONFIG.categoryAriaLabel })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: HOT_PAGE_CONFIG.listAriaLabel })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: HOT_PAGE_CONFIG.items[0].title })).toBeInTheDocument()
    expect(container.querySelector('.breaking-hero')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: HOT_PAGE_CONFIG.title })).not.toBeInTheDocument()
  })

  it('hides the search bar by default', () => {
    renderRankingPage(HOT_PAGE_CONFIG)

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('filters items by title when showSearch is enabled', () => {
    renderRankingPage(HOT_PAGE_CONFIG, true)

    const targetTitle = HOT_PAGE_CONFIG.items[0].title
    const otherTitle = HOT_PAGE_CONFIG.items.find((item) => item.title !== targetTitle)?.title

    expect(otherTitle, 'fixture should expose at least two distinct titles').toBeDefined()

    const searchBox = screen.getByRole('searchbox')
    fireEvent.change(searchBox, { target: { value: targetTitle } })

    expect(screen.getByRole('heading', { name: targetTitle })).toBeInTheDocument()
    if (otherTitle) {
      expect(screen.queryByRole('heading', { name: otherTitle })).not.toBeInTheDocument()
    }
  })

  it('shows an empty-state message when the search query has no matches', () => {
    renderRankingPage(HOT_PAGE_CONFIG, true)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '__no-such-market__' } })

    expect(screen.getByRole('status')).toHaveTextContent('没有匹配')
  })

  it('keeps the leaderboard capped at twelve items across topic tabs', () => {
    const rankingConfig = buildRankingConfig(14)
    renderRankingPage(rankingConfig)

    const rankingList = screen.getByRole('list', { name: rankingConfig.listAriaLabel })
    expect(within(rankingList).getAllByRole('listitem')).toHaveLength(12)

    fireEvent.click(screen.getByRole('tab', { name: 'Sports' }))

    const sportsRows = within(rankingList).getAllByRole('listitem')
    expect(sportsRows).toHaveLength(12)
    expect(sportsRows[0]).toHaveTextContent('Sports ranking 1')
    expect(sportsRows[3]).toHaveTextContent('Sports ranking 4')
    expect(sportsRows[4]).toHaveTextContent('Tech ranking 5')
  })
})
