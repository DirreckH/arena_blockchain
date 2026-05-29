import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CategoryCompactMarketCard } from '../components/market/CategoryDirectoryCards'
import { marketCards } from '../mocks/arena-market.mock'
import type { PublicValidationMarketCard } from '../features/validation/validation-market.types'

const sampleMarket: PublicValidationMarketCard = {
  id: marketCards[0].id,
  title: marketCards[0].title,
  category: marketCards[0].category,
  status: 'collecting',
  options: marketCards[0].options.map((option, index) => ({
    id: `${marketCards[0].id}-${index}`,
    label: option.label,
    displayOrder: index + 1,
  })),
  progress: {
    timeProgressPercent: marketCards[0].timeProgressPercent,
    effectiveSampleProgressPercent: marketCards[0].sampleProgressPercent,
    effectiveSampleCount: 420,
    minEffectiveSample: 600,
    statusLabel: marketCards[0].statusLabel,
  },
  revealTargetAt: marketCards[0].timeProgressLabel,
  imageSrc: marketCards[0].image,
}

describe('front-end copy regression', () => {
  it('renders compact card title beside the thumbnail', () => {
    render(
      <MemoryRouter>
        <CategoryCompactMarketCard market={sampleMarket} />
      </MemoryRouter>,
    )

    const titleLink = screen.getByRole('link', { name: sampleMarket.title })
    expect(titleLink.closest('.category-compact-title-shell')).toBeInTheDocument()
    expect(document.querySelector('.category-compact-top > .category-compact-media + .category-compact-title-shell')).toBeInTheDocument()
  })

  it('does not render a compact footer result badge even when a public result exists', () => {
    render(
      <MemoryRouter>
        <CategoryCompactMarketCard
          market={{
            ...sampleMarket,
            publicResult: 'Resolved badge should stay hidden',
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByText('Resolved badge should stay hidden')).not.toBeInTheDocument()
    expect(document.querySelector('.category-compact-footer')).not.toBeInTheDocument()
  })

  it('uses different option card tones instead of rendering option code pills', () => {
    render(
      <MemoryRouter>
        <CategoryCompactMarketCard market={sampleMarket} />
      </MemoryRouter>,
    )

    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
    expect(screen.queryByText('Option B')).not.toBeInTheDocument()

    const optionCards = document.querySelectorAll('.category-compact-option')
    expect(optionCards).toHaveLength(2)
    expect(optionCards[0]?.classList.contains('option-tone-a')).toBe(true)
    expect(optionCards[1]?.classList.contains('option-tone-b')).toBe(true)
    expect(document.querySelector('.category-compact-option-code')).not.toBeInTheDocument()
  })
})
