import type { PublicValidationMarketCard } from '../../features/validation/validation-market.types'
import { CategoryCompactMarketCard } from './CategoryDirectoryCards'

export function FeaturedCarousel({ market }: { market: PublicValidationMarketCard }) {
  return <CategoryCompactMarketCard market={market} />
}
