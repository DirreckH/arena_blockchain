import { describe, expect, it } from 'vitest'
import {
  VALIDATION_PRE_REVEAL_ALLOWED_FIELDS,
  VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS,
} from '../../features/arena-information-boundary'
import { RULES_INTRO_STEPS } from './RulesIntroContent'

describe('rules intro content', () => {
  it('keeps the onboarding flow at four steps', () => {
    expect(RULES_INTRO_STEPS).toHaveLength(4)
    expect(RULES_INTRO_STEPS.slice(0, 3).every((step) => step.primaryButtonLabel === '下一页')).toBe(true)
    expect(RULES_INTRO_STEPS[3]?.primaryButtonLabel).toBe('我知道了')
  })

  it('keeps the pre-reveal step aligned with allowed and forbidden boundary fields', () => {
    const boundaryStep = RULES_INTRO_STEPS[2]

    expect(VALIDATION_PRE_REVEAL_ALLOWED_FIELDS).toContain('status')
    expect(VALIDATION_PRE_REVEAL_ALLOWED_FIELDS).toContain('timeProgressPercent')
    expect(VALIDATION_PRE_REVEAL_ALLOWED_FIELDS).toContain('effectiveSampleProgressPercent')
    expect(VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS).toContain('probability')
    expect(VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS).toContain('leadingOption')
    expect(VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS).toContain('responseRatio')

    expect(boundaryStep?.chips).toEqual(['公开状态', '时间进度', '有效样本进度'])
    expect(boundaryStep?.description).toContain('概率')
    expect(boundaryStep?.description).toContain('领先方向')
    expect(boundaryStep?.description).toContain('回答占比')
  })
})
