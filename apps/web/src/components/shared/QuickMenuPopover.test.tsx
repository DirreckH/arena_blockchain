import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render-app'
import { QUICK_MENU_ITEMS, QUICK_MENU_LANGUAGE_HREF } from './quick-menu.config'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="current-path">{location.pathname}</div>
}

describe('quick menu popover', () => {
  it('toggles from the desktop menu trigger', async () => {
    renderApp(['/zh'])
    const user = userEvent.setup()
    const menuButton = screen.getByRole('button', { name: 'Menu and language' })

    await user.click(menuButton)
    expect(await screen.findByRole('dialog', { name: '快捷菜单' })).toBeInTheDocument()

    await user.click(menuButton)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '快捷菜单' })).not.toBeInTheDocument()
    })
  })

  it('closes when clicking outside the popover', async () => {
    renderApp(['/zh'])
    const user = userEvent.setup()
    const menuButton = screen.getByRole('button', { name: 'Menu and language' })

    await user.click(menuButton)
    expect(await screen.findByRole('dialog', { name: '快捷菜单' })).toBeInTheDocument()

    await user.click(screen.getByTestId('quick-menu-overlay'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '快捷菜单' })).not.toBeInTheDocument()
    })
  })

  it('renders the trimmed menu without the removed header block', async () => {
    renderApp(['/zh'])
    const user = userEvent.setup()
    const menuButton = screen.getByRole('button', { name: 'Menu and language' })

    await user.click(menuButton)
    const dialog = await screen.findByRole('dialog', { name: '快捷菜单' })

    expect(document.querySelector('.quick-menu-head')).toBeNull()
    expect(screen.queryByText('快捷菜单')).not.toBeInTheDocument()
    expect(screen.queryByText('Language')).not.toBeInTheDocument()

    const menuItems = document.querySelectorAll('.quick-menu-item')
    expect(menuItems).toHaveLength(QUICK_MENU_ITEMS.length)

    expect(within(dialog).getByRole('button', { name: '语言 中文' })).toBeInTheDocument()

    QUICK_MENU_ITEMS.filter((item) => item.href !== QUICK_MENU_LANGUAGE_HREF).forEach((item) => {
      expect(within(dialog).getByRole('button', { name: item.label })).toBeInTheDocument()
      expect(screen.queryByText(item.caption)).not.toBeInTheDocument()
    })
  })

  it('opens a nested language popover and switches language without navigating', async () => {
    renderApp(['/zh/watchlist'], <LocationProbe />)
    const user = userEvent.setup()
    const menuButton = screen.getByRole('button', { name: 'Menu and language' })

    await user.click(menuButton)
    const quickMenu = await screen.findByRole('dialog', { name: '快捷菜单' })
    const languageButton = within(quickMenu).getByRole('button', { name: '语言 中文' })

    await user.click(languageButton)

    const languageDialog = await screen.findByRole('dialog', { name: '语言选择' })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/zh/watchlist')
    expect(within(languageDialog).getByRole('button', { name: 'English' })).toBeInTheDocument()

    await user.click(within(languageDialog).getByRole('button', { name: 'English' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '语言选择' })).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('current-path')).toHaveTextContent('/zh/watchlist')
    expect(within(quickMenu).getByRole('button', { name: '语言 English' })).toBeInTheDocument()
  })
})
