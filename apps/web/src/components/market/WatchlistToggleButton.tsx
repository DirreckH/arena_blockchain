import { Bookmark } from 'lucide-react'
import { useWatchlistData } from '../../features/arena/watchlist-data'
import { useRulesIntro } from '../shared/RulesIntroContext'

export function WatchlistToggleButton({ marketId }: { marketId: string }) {
  const { isAuthenticated, openAuthModal } = useRulesIntro()
  const { isSaving, isSaved, saveMarket, removeMarket } = useWatchlistData()
  const saved = isSaved(marketId)

  const handleToggle = () => {
    if (!isAuthenticated) {
      openAuthModal('login')
      return
    }

    if (saved) {
      void removeMarket(marketId)
      return
    }

    void saveMarket(marketId)
  }

  return (
    <button
      type="button"
      aria-label={saved ? 'Remove saved proposition' : 'Save proposition'}
      aria-pressed={saved}
      className={saved ? 'watchlist-toggle-button saved' : 'watchlist-toggle-button'}
      disabled={isSaving}
      onClick={handleToggle}
    >
      <Bookmark size={17} />
    </button>
  )
}
