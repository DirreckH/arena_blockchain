import { useValidationMarketData } from '../../features/validation/validation-market-data'
import { MarketWorkspace } from '../market/MarketWorkspace'

export function DirectoryPage({ title }: { title: string }) {
  const { markets } = useValidationMarketData()

  return (
    <section className="route-page">
      <div className="route-header compact">
        <span>Arena</span>
        <h1>{title}</h1>
        <p>由 Arena 验证层市场数据驱动的公开命题目录。</p>
      </div>
      <MarketWorkspace compact markets={markets} title={title} />
    </section>
  )
}
