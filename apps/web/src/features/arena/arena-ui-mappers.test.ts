import { describe, expect, it } from 'vitest'
import type { PropositionDraftRecord } from '../api/arena-api'
import { buildDraftTags, formatCategoryLabel, formatSampleConstraintLabel } from './arena-ui-mappers'

function buildDraft(sampleConstraints: string[]): PropositionDraftRecord {
  return {
    propositionId: 'draft-test',
    title: 'Draft title long enough',
    summary:
      'This is a sufficiently long summary to satisfy the completion requirements for the draft record.',
    optionA: 'Option A',
    optionB: 'Option B',
    category: 'ai',
    sampleConstraints,
    minEffectiveSample: 6,
    minBetAmount: '10',
    minDurationSeconds: 3600,
    maxDurationSeconds: 7200,
    rewardBudget: '100',
    baseResponseReward: '5',
    marketEnabled: true,
    status: 'draft',
    submissionStatus: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    submittedAt: null,
  }
}

describe('arena ui mappers', () => {
  it('keeps all sample constraints available for downstream list rendering', () => {
    const draft = buildDraft([
      'experienced_user',
      'wallet_signed',
      'high_quality',
      'interested_in_ai',
    ])

    expect(buildDraftTags(draft)).toEqual([
      'experienced_user',
      'wallet_signed',
      'high_quality',
      'interested_in_ai',
    ])
  })

  it('formats supported sample-constraint keys into readable labels', () => {
    expect(formatSampleConstraintLabel('experienced_user')).toBe('资深答题人')
    expect(formatSampleConstraintLabel('interested_in_dao')).toBe('DAO 兴趣')
    expect(formatSampleConstraintLabel('interested_in_brand_research')).toBe(
      '品牌调研兴趣',
    )
    expect(formatSampleConstraintLabel('custom_constraint')).toBe('custom_constraint')
  })

  it('formats the dao proposition category into a readable label', () => {
    expect(formatCategoryLabel('dao')).toBe('DAO')
  })
})
