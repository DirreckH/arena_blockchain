import { Bookmark, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router-dom'

export function MobileSearchBar() {
  return (
    <div className="mobile-search-row">
      <Link className="mobile-icon" to="/zh/categories" aria-label="分类浏览">
        <LayoutGrid size={20} />
      </Link>
      <Link className="mobile-icon" to="/zh/watchlist" aria-label="收藏">
        <Bookmark size={20} />
      </Link>
    </div>
  )
}
