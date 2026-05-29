import { describe, expect, it } from 'vitest'
import { computeAnchoredDropdownLayout } from './anchored-dropdown-position'

describe('computeAnchoredDropdownLayout', () => {
  it('left-aligns below the trigger when there is enough space', () => {
    expect(computeAnchoredDropdownLayout({
      triggerRect: { bottom: 100, left: 240 },
      dropdownWidth: 180,
      viewportWidth: 1280,
      viewportHeight: 900,
      viewportPadding: 12,
      triggerGap: 6,
    })).toEqual({
      top: 106,
      left: 240,
      maxHeight: 782,
    })
  })

  it('shifts left only enough to stay inside the viewport', () => {
    expect(computeAnchoredDropdownLayout({
      triggerRect: { bottom: 72, left: 1120 },
      dropdownWidth: 220,
      viewportWidth: 1280,
      viewportHeight: 900,
      viewportPadding: 12,
      triggerGap: 6,
    })).toEqual({
      top: 78,
      left: 1048,
      maxHeight: 810,
    })
  })

  it('keeps the dropdown below the trigger and reduces maxHeight near the bottom', () => {
    expect(computeAnchoredDropdownLayout({
      triggerRect: { bottom: 760, left: 320 },
      dropdownWidth: 180,
      viewportWidth: 1280,
      viewportHeight: 860,
      viewportPadding: 12,
      triggerGap: 6,
    })).toEqual({
      top: 766,
      left: 320,
      maxHeight: 120,
    })
  })
})
