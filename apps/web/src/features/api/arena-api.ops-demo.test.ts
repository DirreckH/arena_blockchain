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

  it('uses the hot all-top-ten topics as the home featured carousel in demo mode', async () => {
    const [{ arenaApi }, { demoBackend }, { HOT_PAGE_CONFIG }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
      import('../../mocks/hot-page.mock'),
    ])
    demoBackend.reset()

    const expectedFeaturedMarketIds = HOT_PAGE_CONFIG.items
      .map((item) => item.href.replace('/zh/event/', ''))
      .slice(0, 10)

    await expect(arenaApi.getDiscoveryHomeFeed()).resolves.toMatchObject({
      data: {
        featuredMarketIds: expectedFeaturedMarketIds,
      },
    })
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
  }, 15000)

  it('advances reward payout lifecycle in demo mode without live fetch', async () => {
    const [{ arenaApi }, { demoBackend }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
    ])
    demoBackend.reset()

    await expect(
      arenaApi.approveOpsRewardPayout(
        'ledger_1',
        {
          approvedAt: '2026-06-01T10:28:00.000Z',
          reason: 'approve_reward_payout',
          note: 'demo approve',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      ledgerId: 'ledger_1',
      payout: {
        status: 'approved',
        approvedAt: '2026-06-01T10:28:00.000Z',
      },
      auditEvents: expect.arrayContaining([
        expect.objectContaining({
          action: 'reward_payout_approved',
        }),
      ]),
    })

    await expect(
      arenaApi.startOpsRewardPayoutExecution(
        'ledger_1',
        {
          startedAt: '2026-06-01T10:29:00.000Z',
          reason: 'start_reward_payout_execution',
          note: 'demo start',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      payout: {
        status: 'executing',
        executionStartedAt: '2026-06-01T10:29:00.000Z',
        retryCount: 0,
      },
    })

    await expect(
      arenaApi.failOpsRewardPayout(
        'ledger_1',
        {
          failedAt: '2026-06-01T10:30:00.000Z',
          reason: 'reward_payout_failed',
          note: 'demo fail',
          errorCode: 'transfer_reverted',
          errorMessage: 'Transfer reverted by token contract.',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      payout: {
        status: 'failed',
        failedAt: '2026-06-01T10:30:00.000Z',
        lastErrorCode: 'transfer_reverted',
        lastErrorMessage: 'Transfer reverted by token contract.',
      },
    })

    await expect(
      arenaApi.approveOpsRewardPayout(
        'ledger_1',
        {
          approvedAt: '2026-06-01T10:31:00.000Z',
          reason: 'approve_reward_payout_retry',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      payout: {
        status: 'approved',
        approvedAt: '2026-06-01T10:31:00.000Z',
      },
    })

    await expect(
      arenaApi.startOpsRewardPayoutExecution(
        'ledger_1',
        {
          startedAt: '2026-06-01T10:32:00.000Z',
          reason: 'start_reward_payout_execution_retry',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      payout: {
        status: 'executing',
        executionStartedAt: '2026-06-01T10:32:00.000Z',
        retryCount: 1,
      },
    })

    await expect(
      arenaApi.confirmOpsRewardPayoutExecution(
        'ledger_1',
        {
          confirmedAt: '2026-06-01T10:33:00.000Z',
          reason: 'confirm_reward_payout_execution',
          note: 'demo confirm',
          externalReference: 'batch-001',
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      payout: {
        status: 'completed',
        completedAt: '2026-06-01T10:33:00.000Z',
        executionTxHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
        externalReference: 'batch-001',
        retryCount: 1,
      },
      auditEvents: expect.arrayContaining([
        expect.objectContaining({
          action: 'reward_payout_completed',
        }),
      ]),
    })

    expect(fetch).not.toHaveBeenCalled()
  }, 20000)

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

  it('keeps discovery-config mutations local and reflects them in public demo feeds', async () => {
    const [{ arenaApi }, { demoBackend }] = await Promise.all([
      import('./arena-api'),
      import('../demo/demo-backend'),
    ])
    demoBackend.reset()

    await expect(
      arenaApi.updateOpsDiscoveryGlobalConfig(
        {
          categories: [
        {
          slug: 'politics',
          pathname: '/zh/politics',
          label: '政策雷达',
          title: '政策',
          directoryLabel: '政策目录',
          description: '政策议题与公共治理追踪',
          displayOrder: -9,
        },
        {
          slug: 'sports-live',
          pathname: '/zh/sports/live',
          title: '体育',
          description: '赛事结果与运动员表现',
          displayOrder: -8,
          pageState: 'hidden',
        },
        {
          slug: 'finance',
          pathname: '/zh/finance',
          title: '金融',
          description: '资产价格与宏观经济',
          displayOrder: -7,
          pageState: 'deleted',
        },
      ],
      rankingCategoryLabels: {
        all: '全部赛道',
        general: '综合',
        dao: 'DAO',
            politics: '政策轨道',
            sports: '竞技赛道',
            tech: '科技',
            research: '研究',
            culture: '文化',
          },
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({
          slug: 'politics',
          label: '政策雷达',
        }),
      ]),
      rankingCategoryLabels: expect.objectContaining({
        politics: '政策轨道',
      }),
    })

    await expect(
      arenaApi.updateOpsDiscoveryCategoryConfig(
        'politics',
        {
          sidebarItems: [
            {
              id: 'policy-focus',
              label: '政策焦点',
              linkedMarketIds: ['public-trust', 'missing_market'],
            },
          ],
        },
        DEMO_SESSION_TOKEN,
      ),
    ).resolves.toMatchObject({
      sidebarItems: expect.arrayContaining([
        expect.objectContaining({
          id: 'policy-focus',
          resolvedLinkedMarketCount: 1,
          invalidLinkedMarketIds: ['missing_market'],
        }),
      ]),
    })

    await expect(arenaApi.getCategoryDirectoryIndexFeed()).resolves.toMatchObject({
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            slug: 'politics',
            label: '政策雷达',
          }),
        ]),
      },
    })
    await expect(arenaApi.getCategoryDirectoryIndexFeed()).resolves.toSatisfy((feed) => (
      feed.data.items.every((item) => item.slug !== 'sports-live' && item.slug !== 'finance')
    ))

    await expect(arenaApi.getCategoryDirectoryFeed('politics')).resolves.toMatchObject({
      data: {
        title: '政策',
        sidebarItems: [
          {
            label: '政策焦点',
            count: '1',
          },
        ],
      },
    })
    await expect(arenaApi.getCategoryDirectoryFeed('sports-live')).resolves.toMatchObject({
      data: null,
    })
    await expect(arenaApi.getCategoryDirectoryFeed('finance')).resolves.toMatchObject({
      data: null,
    })

    await expect(arenaApi.getDiscoveryRankingFeed('hot')).resolves.toMatchObject({
      data: {
        categories: expect.arrayContaining([
          expect.objectContaining({
            id: 'politics',
            label: '政策轨道',
          }),
        ]),
      },
    })

    expect(fetch).not.toHaveBeenCalled()
  })
})
