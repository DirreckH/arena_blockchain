import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const displayEntrypoints = [
  'components/market/MarketCardView.tsx',
  'components/market/MarketDetailPage.tsx',
  'components/market/MarketWorkspace.tsx',
  'components/market/FeaturedCarousel.tsx',
  'components/market/RightRail.tsx',
  'app/HomePage.tsx',
]

const forbiddenSnippets = [
  '../mocks/arena-market.mock',
  '../../mocks/arena-market.mock',
  'marketCards',
  'featuredMarkets',
]

describe('validation market import boundary', () => {
  it('keeps market display entrypoints behind the public adapter', () => {
    displayEntrypoints.forEach((relativePath) => {
      const source = readFileSync(resolve(sourceRoot, relativePath), 'utf8')

      forbiddenSnippets.forEach((snippet) => {
        expect(source, `${relativePath} must not contain ${snippet}`).not.toContain(snippet)
      })
    })
  })
})
