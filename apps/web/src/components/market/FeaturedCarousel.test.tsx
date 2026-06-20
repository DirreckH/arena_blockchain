import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { FeaturedCarousel } from './FeaturedCarousel'

const sampleMarket: PublicValidationMarketCard = {
  id: 'sports-messi-ronaldo-goat',
  title: '球迷是否会普遍认为，梅西比 C 罗更配得上现代足球 GOAT 的标签？',
  category: 'sports',
  status: 'collecting',
  options: [
    { id: 'opt-1', label: '梅西更配得上 GOAT', displayOrder: 1 },
    { id: 'opt-2', label: 'C 罗更配得上 GOAT', displayOrder: 2 },
  ],
  progress: {
    timeProgressPercent: 64,
    effectiveSampleProgressPercent: 58,
    effectiveSampleCount: 186,
    minEffectiveSample: 320,
    statusLabel: 'Collecting',
  },
  revealTargetAt: '2026-05-13T09:30:00.000Z',
  featuredComments: [
    {
      id: 'comment-1',
      handle: '@northstand',
      body: '梅西的比赛观感太像把难题写成标准答案了。',
      tone: 'support',
      lane: 0,
      delayMs: -1200,
      durationMs: 18000,
    },
    {
      id: 'comment-2',
      handle: '@ucl_nights',
      body: 'C 罗的巅峰压迫感和关键战故事线真的没法忽视。',
      tone: 'oppose',
      lane: 2,
      delayMs: -4200,
      durationMs: 21000,
    },
  ],
}

describe('FeaturedCarousel', () => {
  it('renders a featured comment danmaku area when comments are available', () => {
    render(
      <MemoryRouter>
        <FeaturedCarousel market={sampleMarket} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('用户评论弹幕')).toBeInTheDocument()
    expect(screen.getByText('@northstand')).toBeInTheDocument()
    expect(screen.getByText('梅西的比赛观感太像把难题写成标准答案了。')).toBeInTheDocument()
    expect(screen.getByText('@ucl_nights')).toBeInTheDocument()
  })

  it('omits the danmaku area when no comments are provided', () => {
    render(
      <MemoryRouter>
        <FeaturedCarousel
          market={{
            ...sampleMarket,
            featuredComments: undefined,
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByLabelText('用户评论弹幕')).not.toBeInTheDocument()
  })
})
