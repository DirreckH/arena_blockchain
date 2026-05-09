import { CategoryCompactMarketCard } from './CategoryDirectoryCards'
import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'

export function MarketCardView({ market }: { market: PublicValidationMarketCard }) {
  return <CategoryCompactMarketCard market={market} />
}
