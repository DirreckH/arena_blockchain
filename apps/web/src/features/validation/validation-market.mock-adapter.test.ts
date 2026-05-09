import { describe, expect, it } from 'vitest'
import { VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS } from '../arena-information-boundary'
import {
  getPublicValidationMarketById,
  getPublicValidationMarkets,
} from './validation-market.mock-adapter'

const allowedMarketKeys = new Set([
  'id',
  'title',
  'category',
  'status',
  'options',
  'progress',
  'revealTargetAt',
  'closesAt',
  'imageSrc',
  'isSettled',
  'publicResult',
])

const allowedProgressKeys = new Set([
  'timeProgressPercent',
  'effectiveSampleProgressPercent',
  'effectiveSampleCount',
  'minEffectiveSample',
  'statusLabel',
])

const allowedOptionKeys = new Set(['id', 'label', 'displayOrder'])

const asRecord = (value: object): Record<string, unknown> =>
  value as Record<string, unknown>

const expectOnlyAllowedKeys = (value: object, allowedKeys: Set<string>) => {
  Object.keys(value).forEach((key) => {
    expect(allowedKeys.has(key)).toBe(true)
  })
}

const expectNoForbiddenFields = (value: object) => {
  const record = asRecord(value)

  VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS.forEach((field) => {
    expect(record).not.toHaveProperty(field)
  })
}

describe('validation market public mock adapter', () => {
  it('returns public validation market cards', () => {
    const markets = getPublicValidationMarkets()

    expect(Array.isArray(markets)).toBe(true)
    expect(markets.length).toBeGreaterThan(0)

    markets.forEach((market) => {
      expect(market.id).toEqual(expect.any(String))
      expect(market.title).toEqual(expect.any(String))
      expect(market.category).toEqual(expect.any(String))
      expect(market.status).toEqual(expect.any(String))
      expect(Array.isArray(market.options)).toBe(true)
      expect(market.progress).toEqual(expect.any(Object))

      expectOnlyAllowedKeys(market, allowedMarketKeys)
      expectOnlyAllowedKeys(market.progress, allowedProgressKeys)
      expectNoForbiddenFields(market)
      expectNoForbiddenFields(market.progress)
    })
  })

  it('maps each option to the public option shape only', () => {
    getPublicValidationMarkets().forEach((market) => {
      market.options.forEach((option) => {
        expect(option.id).toEqual(expect.any(String))
        expect(option.label).toEqual(expect.any(String))
        expect(option.displayOrder).toEqual(expect.any(Number))
        expectOnlyAllowedKeys(option, allowedOptionKeys)
        expectNoForbiddenFields(option)
      })
    })
  })

  it('finds known public market details and returns undefined for unknown ids', () => {
    const [firstMarket] = getPublicValidationMarkets()

    expect(firstMarket).toBeDefined()
    expect(getPublicValidationMarketById(firstMarket.id)).toEqual(firstMarket)
    expect(getPublicValidationMarketById('unknown-market-id')).toBeUndefined()
  })
})
