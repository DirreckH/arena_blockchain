import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchlistPage } from './WatchlistPage'
import { useRulesIntro } from '../components/shared/RulesIntroContext'
import { useWatchlistData } from '../features/arena/watchlist-data'
import { useAuthSession } from '../features/auth/auth-session'
import { useValidationMarketData } from '../features/validation/validation-market-data'

vi.mock('../components/shared/RulesIntroContext', async () => {
  const actual = await vi.importActual('../components/shared/RulesIntroContext')

  return {
    ...actual,
    useRulesIntro: vi.fn(),
  }
})

vi.mock('../features/auth/auth-session', async () => {
  const actual = await vi.importActual('../features/auth/auth-session')

  return {
    ...actual,
    useAuthSession: vi.fn(),
  }
})

vi.mock('../features/arena/watchlist-data', async () => {
  const actual = await vi.importActual('../features/arena/watchlist-data')

  return {
    ...actual,
    useWatchlistData: vi.fn(),
  }
})

vi.mock('../features/validation/validation-market-data', async () => {
  const actual = await vi.importActual('../features/validation/validation-market-data')

  return {
    ...actual,
    useValidationMarketData: vi.fn(),
  }
})

const mockedUseRulesIntro = vi.mocked(useRulesIntro)
const mockedUseAuthSession = vi.mocked(useAuthSession)
const mockedUseWatchlistData = vi.mocked(useWatchlistData)
const mockedUseValidationMarketData = vi.mocked(useValidationMarketData)

function renderWatchlistPage(initialEntry = '/zh/watchlist') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WatchlistPage />
    </MemoryRouter>,
  )
}

describe('watchlist page', () => {
  beforeEach(() => {
    mockedUseRulesIntro.mockReturnValue({
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    } as never)

    mockedUseAuthSession.mockReturnValue({
      sessionMode: 'real',
    } as never)

    mockedUseValidationMarketData.mockReturnValue({
      markets: [],
    } as never)

    mockedUseWatchlistData.mockReturnValue({
      watchlist: {
        userId: 'user-live-1',
        totalCount: 0,
        items: [],
      },
      isLoading: false,
      isSaving: false,
      errorMessage: null,
      refresh: vi.fn(),
      saveMarket: vi.fn(),
      removeMarket: vi.fn(),
      isSaved: vi.fn(),
    })
  })

  it('keeps account-saved watchlist items visible even when the public market feed no longer returns their cards', () => {
    mockedUseWatchlistData.mockReturnValue({
      watchlist: {
        userId: 'user-live-1',
        totalCount: 1,
        items: [
          {
            marketId: 'hidden-market-1',
            propositionId: 'hidden-proposition-1',
            propositionTitle: 'Persisted watchlist proposition',
            category: 'ai',
            savedAt: '2026-06-01T08:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      isSaving: false,
      errorMessage: null,
      refresh: vi.fn(),
      saveMarket: vi.fn(),
      removeMarket: vi.fn(),
      isSaved: vi.fn(),
    })

    renderWatchlistPage()

    expect(screen.getByTestId('watchlist-hidden-state')).toBeInTheDocument()
    expect(screen.getByTestId('watchlist-hidden-item-hidden-market-1')).toBeInTheDocument()
    expect(screen.getByText('Persisted watchlist proposition')).toBeInTheDocument()
    expect(screen.queryByTestId('watchlist-empty-state')).not.toBeInTheDocument()
  })

  it('surfaces authenticated load failures as unavailable instead of presenting the page as ordinary live state', () => {
    mockedUseWatchlistData.mockReturnValue({
      watchlist: null,
      isLoading: false,
      isSaving: false,
      errorMessage: 'Watchlist service unavailable',
      refresh: vi.fn(),
      saveMarket: vi.fn(),
      removeMarket: vi.fn(),
      isSaved: vi.fn(),
    })

    renderWatchlistPage()

    expect(screen.getByText('Watchlist service unavailable')).toBeInTheDocument()
    expect(screen.getByText('暂不可用')).toBeInTheDocument()
    expect(screen.queryByTestId('watchlist-empty-state')).not.toBeInTheDocument()
  })
})
