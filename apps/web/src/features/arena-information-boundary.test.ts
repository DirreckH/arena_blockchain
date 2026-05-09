import { describe, expect, it } from 'vitest'
import {
  ADJUDICATION_FORBIDDEN_MARKET_FIELDS,
  VALIDATION_PRE_REVEAL_ALLOWED_FIELDS,
  VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS,
} from './arena-information-boundary'

describe('Arena information boundary constants', () => {
  it('covers core validation pre-reveal forbidden fields', () => {
    const requiredForbiddenFields = [
      'probability',
      'odds',
      'currentDirection',
      'leadingOption',
      'responseRatio',
      'voteCountByOption',
      'rawVoteCount',
      'trend',
      'marketPrice',
    ]

    requiredForbiddenFields.forEach((field) => {
      expect(VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS).toContain(field)
    })
  })

  it('keeps validation allowed fields disjoint from forbidden fields', () => {
    const forbiddenFields = new Set<string>(VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS)
    const overlap = VALIDATION_PRE_REVEAL_ALLOWED_FIELDS.filter((field) =>
      forbiddenFields.has(field),
    )

    expect(overlap).toEqual([])
  })

  it('covers adjudication page forbidden market fields', () => {
    const requiredAdjudicationFields = [
      'odds',
      'optionVolume',
      'traderSentiment',
      'currentDirection',
    ]

    requiredAdjudicationFields.forEach((field) => {
      expect(ADJUDICATION_FORBIDDEN_MARKET_FIELDS).toContain(field)
    })
  })
})
