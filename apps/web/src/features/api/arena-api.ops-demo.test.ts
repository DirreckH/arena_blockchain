import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_SESSION_TOKEN } from '../demo/demo-auth'

describe('arenaApi operator demo mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('unexpected live fetch'))))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serves internal monitoring and audit reads from demo state without fetch', async () => {
    const [{ arenaApi }, { demoBackend }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
    ])
    demoBackend.reset()

    await expect(arenaApi.getOpsRuntimeContract(DEMO_SESSION_TOKEN)).resolves.toMatchObject({
      releaseReadiness: {
        status: 'ready',
      },
      operatorSummary: {
        status: 'ready',
      },
    })

    await expect(arenaApi.getOpsValidationChainHealth(DEMO_SESSION_TOKEN)).resolves.toMatchObject({
      operatorSummary: {
        focusArea: 'validation-chain',
      },
    })

    await expect(
      arenaApi.getOpsAuditEvents(DEMO_SESSION_TOKEN, { actorUserId: 'ops_user_1' }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'ops_user_1',
        }),
      ]),
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps response review and reward follow-through mutable in demo mode', async () => {
    const [{ arenaApi }, { demoBackend }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
    ])
    demoBackend.reset()

    await expect(
      arenaApi.getOpsResponseReviewState('response_ops_1', DEMO_SESSION_TOKEN),
    ).resolves.toMatchObject({
      workflowState: 'unclaimed',
    })

    await expect(
      arenaApi.claimOpsResponseReview(
        'response_ops_1',
        { claimedAt: '2026-06-01T10:25:00.000Z', note: 'demo claim' },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      workflowState: 'claimed',
      claimedAt: '2026-06-01T10:25:00.000Z',
    })

    await expect(
      arenaApi.releaseOpsResponseReview(
        'response_ops_1',
        { releasedAt: '2026-06-01T10:26:00.000Z', note: 'demo release' },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      workflowState: 'released',
      releasedAt: '2026-06-01T10:26:00.000Z',
    })

    await expect(
      arenaApi.retriggerOpsRewardResolution(
        'ledger_1',
        {
          resolvedAt: '2026-06-01T10:27:00.000Z',
          reason: 'manual_follow_up',
          note: 'demo reward retrigger',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      ledgerId: 'ledger_1',
      auditEvents: expect.arrayContaining([
        expect.objectContaining({
          action: 'reward_resolution_retriggered',
        }),
      ]),
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('records rehearsal checkpoints into proposition detail in demo mode', async () => {
    const [{ arenaApi }, { demoBackend }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
    ])
    demoBackend.reset()

    await expect(
      arenaApi.recordOpsRehearsalCheckpoint(
        'prop_list_1',
        {
          stepId: 'publish_and_open',
          status: 'complete',
          reason: 'checkpoint ok',
          note: 'demo checkpoint',
          evidence: ['tx=0xabc123', 'log=ready'],
          txHash: '0xabc123',
          blockNumber: 123,
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      propositionId: 'prop_list_1',
      stepId: 'publish_and_open',
      txHash: '0xabc123',
    })

    await expect(arenaApi.getOpsProposition('prop_list_1', DEMO_SESSION_TOKEN)).resolves.toMatchObject({
      validationRehearsalCheckpoints: expect.arrayContaining([
        expect.objectContaining({
          stepId: 'publish_and_open',
          txHash: '0xabc123',
        }),
      ]),
    })

    expect(fetch).not.toHaveBeenCalled()
  })
})
