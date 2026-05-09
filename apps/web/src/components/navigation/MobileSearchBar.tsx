import { Bookmark, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

export function MobileSearchBar() {
  return (
    <div className="mobile-search-row">
      <Link className="mobile-search" to="/zh/search" role="search" aria-label="搜索">
        <Search size={18} />
        <span className="search-placeholder">搜索命题</span>
      </Link>
      <Link className="mobile-icon" to="/zh/markets?panel=filters" aria-label="筛选">
        <SlidersHorizontal size={20} />
      </Link>
      <Link className="mobile-icon" to="/zh/watchlist" aria-label="收藏">
        <Bookmark size={20} />
      </Link>
    </div>
  )
}
