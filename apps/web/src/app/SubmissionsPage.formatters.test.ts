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
    ).toContain('健康面板已有保留导出 comparison-export-demo-core，但聚焦摘要尚未刷新到该记录')
    expect(
      formatDeliveryLatestExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('当前健康面板比')
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
    ).toContain('已打开的健康面板已有保留导出 comparison-export-demo-core，但当前这一行尚未刷新到该记录')
    expect(
      formatDeliveryRowExportAgreementDetail(rowHealth, selectedHealth),
    ).toContain('已打开的健康面板比')
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
    ).toContain('聚焦摘要与健康面板都引用了导出 comparison-export-demo-core，但该导出已不再保留')
    expect(
      formatDeliveryRowExportAgreementDetail(focusedHealth, selectedHealth),
    ).toContain('当前这一行与已打开的健康面板都引用了导出 comparison-export-demo-core，但该导出已不再保留')
  })
})
