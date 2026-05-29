import { describe, expect, it } from 'vitest'
import type { RequesterComparisonSetDeliveryPolicyHealthRecord } from '../features/api/arena-api'
import {
  formatDeliveryLatestExportAgreementDetail,
  formatDeliveryRowExportAgreementDetail,
} from './SubmissionsPage'

function buildHealth(
  overrides?: Partial<RequesterComparisonSetDeliveryPolicyHealthRecord['health']>,
): RequesterComparisonSetDeliveryPolicyHealthRecord['health'] {
  return {
    status: 'scheduled',
    checkedAt: '2026-05-08T09:34:00.000Z',
    isDue: false,
    lagSeconds: 0,
    consecutiveFailureCount: 0,
    lastCompletedRunAt: '2026-05-08T09:30:00.000Z',
    lastFailedRunAt: null,
    latestRun: {
      runId: 'delivery-run-demo-latest',
      userId: 'demo-user',
      comparisonSetId: 'comparison-set-demo-core',
      policyId: 'delivery-policy-demo-daily',
      status: 'completed',
      startedAt: '2026-05-08T09:25:00.000Z',
      completedAt: '2026-05-08T09:30:00.000Z',
      exportId: 'comparison-export-demo-core',
      retainedExportAvailable: true,
      origin: {
        type: 'delivery_policy_manual',
        policyId: 'delivery-policy-demo-daily',
        policyName: 'Daily settled delivery',
      },
      triggerType: 'manual',
      delivery: {
        deliveredAt: '2026-05-08T09:30:00.000Z',
        statusCode: 202,
        authentication: {
          kind: 'bearer',
          credentialKey: 'ARENA_REQUESTER_WEBHOOK_BEARER',
        },
      },
      retriedRunId: null,
      error: null,
    },
    runCounts: {
      totalCount: 1,
      completedCount: 1,
      failedCount: 0,
    },
    transport: {
      status: 'ready',
      blockingReason: null,
      credentialKey: 'ARENA_REQUESTER_WEBHOOK_BEARER',
    },
    ...overrides,
  }
}

describe('submissions delivery agreement formatters', () => {
  it('explains when the open health panel is fresher than the focused summary export evidence', () => {
    const focusedHealth = buildHealth({
      checkedAt: '2026-05-08T09:33:00.000Z',
      latestRun: {
        ...buildHealth().latestRun!,
        exportId: null,
        retainedExportAvailable: false,
      },
      runCounts: {
        totalCount: 0,
        completedCount: 0,
        failedCount: 0,
      },
      lastCompletedRunAt: null,
    })

    const selectedHealth = buildHealth({
      checkedAt: '2026-05-08T09:34:00.000Z',
      latestRun: {
        ...buildHealth().latestRun!,
        exportId: 'comparison-export-demo-core',
      retainedExportAvailable: true,
      },
    })

    expect(
      formatDeliveryLatestExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('Health panel has retained export comparison-export-demo-core, but the focused summary has not refreshed yet')
    expect(
      formatDeliveryLatestExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('this health panel is fresher than the focused summary snapshot from')
  })

  it('explains when the open health panel is fresher than the row-level export evidence', () => {
    const rowHealth = buildHealth({
      checkedAt: '2026-05-08T09:33:00.000Z',
      latestRun: {
        ...buildHealth().latestRun!,
        exportId: null,
        retainedExportAvailable: false,
      },
      runCounts: {
        totalCount: 0,
        completedCount: 0,
        failedCount: 0,
      },
      lastCompletedRunAt: null,
    })

    const selectedHealth = buildHealth({
      checkedAt: '2026-05-08T09:34:00.000Z',
      latestRun: {
        ...buildHealth().latestRun!,
        exportId: 'comparison-export-demo-core',
      retainedExportAvailable: true,
      },
    })

    expect(
      formatDeliveryRowExportAgreementDetail(rowHealth, selectedHealth),
    ).toContain('The open health panel has retained export comparison-export-demo-core, but this row has not refreshed yet')
    expect(
      formatDeliveryRowExportAgreementDetail(rowHealth, selectedHealth),
    ).toContain('this open health panel is fresher than the row snapshot from')
  })

  it('distinguishes shared historical export references from currently retained export availability', () => {
    const unavailableRun = {
      ...buildHealth().latestRun!,
      retainedExportAvailable: false,
    }

    const focusedHealth = buildHealth({
      latestRun: unavailableRun,
    })

    const selectedHealth = buildHealth({
      latestRun: unavailableRun,
    })

    expect(
      formatDeliveryLatestExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('both reference export comparison-export-demo-core, but it is no longer retained')
    expect(
      formatDeliveryRowExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('both reference export comparison-export-demo-core, but it is no longer retained')
  })
})
