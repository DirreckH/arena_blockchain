import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/render-app'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="current-path">{location.pathname}</div>
}

describe('auth-guarded routes', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it.each([
    '/zh/adjudication',
    '/zh/challenges',
    '/zh/activity',
    '/zh/results',
  ])('opens the existing login modal for unauthenticated route %s', async (path) => {
    const { container } = renderApp([path], <LocationProbe />)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('0x...')).toBeInTheDocument()
    expect(container.querySelector('.auth-required-blank-gate')).not.toBeNull()
    expect(screen.getByTestId('current-path')).toHaveTextContent(path)
  })

  it('does not repeatedly reopen the login modal after the user closes it', async () => {
    const { container } = renderApp(['/zh/results'], <LocationProbe />)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const closeButton = container.querySelector('.rules-intro-close')
    expect(closeButton).not.toBeNull()

    fireEvent.click(closeButton as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('current-path')).toHaveTextContent('/zh/results')
  })

  it('returns to /zh/markets when the adjudication login modal is dismissed from the market page', async () => {
    const { container } = renderApp(['/zh/markets'], <LocationProbe />)

    const adjudicationLink = container.querySelector('a[href="/zh/adjudication"]')
    expect(adjudicationLink).not.toBeNull()

    fireEvent.click(adjudicationLink as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/zh/adjudication')
    })

    const dialog = await screen.findByRole('dialog')
    const overlay = dialog.parentElement
    expect(overlay).not.toBeNull()

    fireEvent.click(overlay as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/zh/markets')
    })
  })

  it.each([
    ['/zh/adjudication', '/zh/help'],
    ['/zh/activity', '/zh/help'],
    ['/zh/challenges', '/zh/help'],
    ['/zh/results', '/zh/help'],
  ])('returns to the previous route when %s is dismissed after navigating from %s', async (targetPath, sourcePath) => {
    const { container } = renderApp([sourcePath], <LocationProbe />)

    const protectedLink = container.querySelector(`a[href="${targetPath}"]`)
    expect(protectedLink).not.toBeNull()

    fireEvent.click(protectedLink as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent(targetPath)
    })

    const dialog = await screen.findByRole('dialog')
    const closeButton = container.querySelector('.rules-intro-close')

    expect(closeButton).not.toBeNull()

    fireEvent.click(closeButton as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent(sourcePath)
    })
  })
})
