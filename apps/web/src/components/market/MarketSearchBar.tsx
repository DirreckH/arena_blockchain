import { Search } from 'lucide-react'

interface MarketSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function MarketSearchBar({
  value,
  onChange,
  placeholder = '搜索市场标题',
  className = '',
}: MarketSearchBarProps) {
  return (
    <div className={`market-page-search-shell ${className}`.trim()}>
      <div className="route-search market-page-search">
        <Search size={22} aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
    </div>
  )
}
