import { describe, expect, it } from 'vitest'

import { demoBackend } from './demo-backend'

describe('demo requester contract', () => {
  it('keeps self-facing requester demo payloads aligned with the slimmer API contract', () => {
    demoBackend.reset()

    const overview = demoBackend.getRequesterOverview()
    const createdExport = demoBackend.createOwnedPropositionExport({})
    const exportList = demoBackend.listOwnedPropositionExports()
    const presetList = demoBackend.listRequesterReportPresets()
    const comparisonSets = demoBackend.listRequesterComparisonSets()
    const comparisonSetId = comparisonSets.items[0]?.comparisonSetId

    expect(comparisonSetId).toBeTruthy()

    const deliveryPolicies = demoBackend.listRequesterComparisonSetDeliveryPolicies(
      comparisonSetId as string,
    )
    const comparisonExports = demoBackend.listRequesterComparisonSetExports(
      comparisonSetId as string,
    )
    const policyId = deliveryPolicies.items[0]?.policyId

    expect(policyId).toBeTruthy()

    const deliveryRuns = demoBackend.listRequesterComparisonSetDeliveryRuns(
      comparisonSetId as string,
      policyId as string,
    )

    expect(overview).not.toHaveProperty('userId')
    expect(exportList).not.toHaveProperty('userId')
    expect(createdExport).not.toHaveProperty('userId')
    expect(createdExport.analytics).not.toHaveProperty('userId')
    expect(exportList.items[0]).not.toHaveProperty('userId')

    expect(presetList).not.toHaveProperty('userId')
    expect(presetList.items[0]).not.toHaveProperty('userId')

    expect(comparisonSets).not.toHaveProperty('userId')
    expect(comparisonSets.items[0]).not.toHaveProperty('userId')

    expect(deliveryPolicies).not.toHaveProperty('userId')
    expect(deliveryPolicies.items[0]).not.toHaveProperty('userId')

    expect(comparisonExports).not.toHaveProperty('userId')
    expect(comparisonExports.items[0]).not.toHaveProperty('userId')

    expect(deliveryRuns).not.toHaveProperty('userId')
    expect(deliveryRuns.items[0]).not.toHaveProperty('userId')

    const comparisonExport = demoBackend.getRequesterComparisonSetExport(
      comparisonSetId as string,
      comparisonExports.items[0]!.exportId,
    )
    expect(comparisonExport).not.toHaveProperty('userId')
  })

})
