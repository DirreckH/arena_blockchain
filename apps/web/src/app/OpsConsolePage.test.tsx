import { SystemRole } from '@arena/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArenaApiError, arenaApi } from '../features/api/arena-api'
import { opsCopy } from '../features/arena/ops-copy'
import { statusLabel } from '../features/arena/ops-status-labels'
import { renderApp } from '../test/render-app'

vi.mock('../features/api/arena-api', async () => {
  const actual = await vi.importActual<typeof import('../features/api/arena-api')>('../features/api/arena-api')
  const sharedAudit = {
    id: 'audit_1',
    entityType: 'proposition',
    entityId: 'prop_list_1',
    action: 'validation_rehearsal_checkpoint',
    actorUserId: 'ops_user_1',
    reason: 'Operator recorded rehearsal checkpoint.',
    note: null,
    metadata: {},
    createdAt: '2026-06-01T10:12:00.000Z',
  }
  const validationReadiness = {
    status: 'ok',
    checkedAt: '2026-06-01T10:10:00.000Z',
    validationEnvironment: 'local',
    chainId: 31337,
    rpcUrl: 'http://localhost:8545',
    arenaContractAddress: '0x1',
    validationContractAddress: '0x2',
    dependencies: [],
    requiredEnvKeys: ['ARENA_RPC_URL'],
    optionalEnvKeys: ['ARENA_OPERATOR_NOTE'],
    preflightCommands: ['pnpm validation:preflight'],
    runbookPath: 'docs/runbook.md',
    operatorActions: [
      {
        dependency: 'rpc',
        summary: 'Verify the RPC endpoint is reachable before replaying chain commands.',
        envKeys: ['ARENA_RPC_URL'],
        commands: ['pnpm validation:preflight'],
      },
    ],
  }
  const validationHealth = {
    streamKey: 'arena.validation.local',
    chainId: 31337,
    contractAddress: '0x2',
    syncStatus: 'idle',
    lastProcessedBlock: 101,
    lastProcessedTxHash: '0xfeed',
    lastProcessedLogIndex: 2,
    lastFinalizedBlock: 100,
    cursorUpdatedAt: '2026-06-01T10:11:00.000Z',
    pollIntervalMs: 5000,
    cursorStaleThresholdMs: 30000,
    isCursorStalled: false,
    schedulerWorker: {
      status: 'up',
      checkedAt: '2026-06-01T10:11:00.000Z',
      startedAt: '2026-06-01T09:59:00.000Z',
      lastSeenAt: '2026-06-01T10:11:00.000Z',
      lastJobProcessedAt: '2026-06-01T10:10:30.000Z',
      lastJobName: 'validation-chain-sync',
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
      operatorActions: ['Keep the worker online while the backlog is reconciled.'],
    },
    recentAlerts: [
      {
        action: 'stale_payout_market',
        entityType: 'market',
        entityId: 'market_1',
        reason: 'A resolved market still has unclaimed payout rows.',
        metadata: {},
        createdAt: '2026-06-01T10:09:00.000Z',
      },
    ],
    metrics: {
      recentRetryExhaustedCount: 0,
      recentTerminalCommandCount: 1,
      recentSyncFailureCount: 0,
      recentProjectorEntityMissingCount: 0,
      stalePayoutMarketCount: 1,
      unsyncedBetBacklogCount: 1,
    },
    eventLedger: {
      totalEventCount: 12,
      duplicateRows: [
        {
          chainId: 31337,
          transactionHash: '0xdup',
          logIndex: 7,
          count: 2,
        },
      ],
      recentEvents: [
        {
          eventName: 'MarketOpened',
          blockNumber: 101,
          transactionHash: '0xevt',
          transactionIndex: 0,
          logIndex: 1,
          marketChainId: 'chain_market_1',
          propositionChainId: 'chain_prop_1',
          processedAt: '2026-06-01T10:10:15.000Z',
        },
      ],
    },
    projection: {
      latestMarket: {
        marketId: 'market_1',
        propositionId: 'prop_list_1',
        chainMarketId: 'chain_market_1',
        chainStatus: 'live',
        chainResultKind: null,
        chainWinningOption: null,
        resolutionTxHash: null,
        cancelTxHash: null,
        chainSyncedAt: '2026-06-01T10:10:15.000Z',
      },
      latestBet: {
        betId: 'bet_1',
        marketId: 'market_1',
        propositionId: 'prop_list_1',
        userId: 'respondent_1',
        status: 'open',
        settlementOutcome: null,
        grossPayout: null,
        refundAmount: null,
        chainSyncedAt: '2026-06-01T10:10:15.000Z',
      },
      unsyncedBetBacklog: [
        {
          betId: 'bet_1',
          marketId: 'market_1',
          propositionId: 'prop_list_1',
          userId: 'respondent_1',
          status: 'open',
          stakeAmount: '10',
          placedAt: '2026-06-01T10:05:10.000Z',
          chainMarketId: 'chain_market_1',
          chainStatus: 'live',
          oldestUnsyncedAgeMs: 42000,
          operatorActions: ['Reconcile the single bet before replaying the projection.'],
        },
      ],
    },
    failures: {
      projectorFailuresCount: 1,
      syncFailuresCount: 0,
      recentFailures: [
        {
          action: 'projector_retry',
          entityType: 'market',
          entityId: 'market_1',
          reason: 'Projection retry is queued.',
          metadata: {},
          createdAt: '2026-06-01T10:08:00.000Z',
        },
      ],
    },
    stalePayoutMarkets: [
      {
        marketId: 'market_1',
        propositionId: 'prop_list_1',
        chainStatus: 'resolved',
        terminalAt: '2026-06-01T10:07:00.000Z',
        unclaimedBetCount: 2,
        operatorActions: ['Review payout settlement and trigger reconcile if needed.'],
      },
    ],
    operatorSummary: {
      status: 'action_required',
      requiresActionNow: true,
      focusArea: 'validation-chain',
      summary: 'One stale payout market needs attention.',
      operatorActions: ['Open the stale payout market and reconcile the affected bet.'],
      blockers: ['stale payout market'],
      latestRelevantEvidence: {
        action: 'stale_payout_market',
        entityType: 'market',
        entityId: 'market_1',
        reason: 'Unclaimed payout entries are still pending.',
        createdAt: '2026-06-01T10:09:00.000Z',
      },
    },
  }
  const runtimeContract = {
    status: 'ok',
    generatedAt: '2026-06-01T10:12:00.000Z',
    environment: {
      nodeEnv: 'test',
      validationEnvironment: 'local',
      port: 3000,
    },
    health: {
      live: { status: 'ok', timestamp: '2026-06-01T10:12:00.000Z' },
      readiness: { status: 'ok', timestamp: '2026-06-01T10:12:00.000Z' },
      queues: { generatedAt: '2026-06-01T10:10:00.000Z', queues: [] },
    },
    validationChain: validationReadiness,
    validationRehearsal: {
      status: 'ready',
      targetOutcome: 'dry run',
      runbookPath: 'docs/runbook.md',
      blockingDependencies: [],
      steps: [
        {
          id: 'preflight',
          summary: 'Validate runtime dependencies before touching live chain controls.',
          commands: ['pnpm validation:preflight'],
          evidence: ['Preflight output recorded in the operator log.'],
        },
      ],
    },
    commands: {
      install: ['pnpm install'],
      dev: ['pnpm dev'],
      typecheck: ['pnpm --filter @arena/web check'],
      unitTest: ['pnpm --filter @arena/web test'],
      integrationTest: ['pnpm --filter @arena/api test:arena'],
      e2eOrSmoke: ['pnpm smoke'],
      productionBuild: ['pnpm build'],
      validationLocalPrepare: ['pnpm validation:prepare'],
      databaseMigrate: ['pnpm db:migrate'],
      preflight: ['pnpm validation:preflight'],
    },
    releaseReadiness: {
      status: 'ready',
      blockingDependencies: [],
      completedGateCount: 4,
      totalGateCount: 4,
    },
    releaseChecklist: [
      {
        id: 'runtime-contract',
        status: 'ready',
        summary: 'Runtime contract commands are available for operators.',
        blockingDependencies: [],
        commands: ['pnpm validation:preflight'],
        operatorActions: ['Run the preflight before manual takeover.'],
      },
    ],
    recentAlerts: [sharedAudit],
    operatorSummary: {
      status: 'ready',
      requiresActionNow: false,
      focusArea: 'runtime',
      summary: 'No immediate operator action is required.',
      operatorActions: ['Keep the validation rehearsal commands visible to operators.'],
      blockers: [],
      latestRelevantEvidence: null,
    },
  }
  const propositionDetail = {
    proposition: {
      id: 'prop_list_1',
      title: 'Ops proposition list item',
      description: 'A live proposition used by the operator workspace tests.',
      category: 'general',
      status: 'live',
      marketEnabled: true,
      minEffectiveSample: 5,
      minDurationSeconds: 300,
      maxDurationSeconds: 3600,
      rewardBudget: '100',
      baseResponseReward: '20',
      createdByUserId: 'requester_1',
      updatedByUserId: null,
      createdAt: '2026-06-01T09:00:00.000Z',
      publishedAt: '2026-06-01T09:30:00.000Z',
      liveAt: '2026-06-01T10:00:00.000Z',
      frozenAt: null,
      revealStartedAt: null,
      resultComputedAt: null,
      settledAt: null,
      closedAt: null,
      archivedAt: null,
    },
    submission: {
      status: 'approved',
      submittedAt: '2026-06-01T09:15:00.000Z',
      submittedByUserId: 'requester_1',
      submissionReason: 'Initial review',
      submissionNote: 'Ready for live operator review.',
    },
    market: {
      id: 'market_1',
      status: 'live',
      liveAt: '2026-06-01T10:00:00.000Z',
      frozenAt: null,
      settlingAt: null,
      settledAt: null,
      chainMarketId: 'chain_market_1',
      chainPropositionId: 'chain_prop_1',
      chainStatus: 'live',
      chainOpenedAt: '2026-06-01T10:00:30.000Z',
      chainFrozenAt: null,
      chainResolvedAt: null,
      chainCancelledAt: null,
      chainResultKind: null,
      chainWinningOption: null,
      chainVoidReason: null,
      resolutionTxHash: null,
      cancelTxHash: null,
      chainSyncedAt: '2026-06-01T10:10:15.000Z',
      currentPublicProgress: { effectiveSample: 4 },
      lastPublicResult: null,
    },
    validationLifecycle: {
      propositionStatus: 'live',
      marketId: 'market_1',
      marketStatus: 'live',
      chainMarketId: 'chain_market_1',
      chainStatus: 'live',
      chainSyncedAt: '2026-06-01T10:10:15.000Z',
      driftReason: null,
      onChainState: 'live',
      operatorGuidance: {
        kind: 'healthy',
        summary: 'The proposition is on the happy path.',
        recoveryReason: null,
        plannedCommands: ['open-market'],
        operatorActions: ['Monitor validation rehearsal checkpoints.'],
      },
    },
    validationChainActivity: {
      timeline: [sharedAudit],
      marketAuditEvents: [sharedAudit],
      commandAuditEvents: [sharedAudit],
      eventAuditEvents: [sharedAudit],
      driftAuditEvents: [],
      recoveryAuditEvents: [],
    },
    validationOperatorSummary: {
      status: 'ready',
      requiresActionNow: false,
      summary: 'Validation lifecycle is stable.',
      plannedCommands: ['open-market'],
      operatorActions: ['Monitor the remaining response review queue.'],
      latestRelevantAudit: sharedAudit,
    },
    validationRehearsal: {
      status: 'ready',
      targetOutcome: 'dry run',
      runbookPath: 'docs/runbook.md',
      blockingDependencies: [],
      summary: {
        completedStepCount: 1,
        remainingStepCount: 0,
        currentStepId: 'preflight',
        currentStepStatus: 'complete',
        nextCommands: ['pnpm validation:preflight'],
        blockingReasons: [],
        latestCheckpointAt: '2026-06-01T10:12:00.000Z',
        latestCheckpointStepId: 'preflight',
        latestCheckpointStatus: 'complete',
      },
      environmentReadiness: {
        status: 'ok',
        validationEnvironment: 'local',
        blockingDependencies: [],
      },
      steps: [
        {
          id: 'preflight',
          status: 'complete',
          summary: 'Preflight finished cleanly.',
          commands: ['pnpm validation:preflight'],
          evidence: ['Operator log captured.'],
          blockingReasons: [],
          manualCheckpoint: {
            propositionId: 'prop_list_1',
            environment: 'local',
            chainId: 31337,
            stepId: 'preflight',
            status: 'complete',
            reason: 'Preflight completed',
            note: null,
            evidence: ['Operator log captured.'],
            txHash: null,
            blockNumber: null,
            recordedByUserId: 'ops_user_1',
            recordedAt: '2026-06-01T10:12:00.000Z',
          },
        },
      ],
    },
    validationRehearsalCheckpoints: [],
    sampleCounter: {
      propositionId: 'prop_list_1',
      totalResponses: 5,
      reviewedResponses: 4,
      validCount: 4,
      partialValidCount: 0,
      invalidCount: 0,
      effectiveSampleCount: 4,
      currentProgress: 0.8,
      hasReachedMinEffectiveSample: false,
      updatedAt: '2026-06-01T10:10:00.000Z',
    },
    closureReadiness: {
      propositionId: 'prop_list_1',
      propositionStatus: 'live',
      counterSnapshot: {
        propositionId: 'prop_list_1',
        totalResponses: 5,
        reviewedResponses: 4,
        validCount: 4,
        partialValidCount: 0,
        invalidCount: 0,
        effectiveSampleCount: 4,
        currentProgress: 0.8,
        hasReachedMinEffectiveSample: false,
        updatedAt: '2026-06-01T10:10:00.000Z',
      },
      liveAt: '2026-06-01T10:00:00.000Z',
      minFreezeAt: '2026-06-01T10:05:00.000Z',
      maxFreezeAt: '2026-06-01T11:00:00.000Z',
      minDurationReached: true,
      maxDurationReached: false,
      hasReachedMinEffectiveSample: false,
      isReadyToFreeze: false,
      triggerReason: 'not_ready',
    },
    dispatchSummary: {
      totalTasks: 5,
      assignedCount: 5,
      startedCount: 5,
      submittedCount: 4,
      skippedCount: 0,
      expiredCount: 0,
      cancelledCount: 0,
      lastAssignedAt: '2026-06-01T10:00:00.000Z',
      lastSubmittedAt: '2026-06-01T10:05:00.000Z',
      uniqueAssignedUsers: 5,
    },
    reviewSummary: {
      totalReviews: 4,
      pendingCount: 1,
      finalizedCount: 4,
      validCount: 4,
      partialValidCount: 0,
      invalidCount: 0,
      fraudSuspectedCount: 0,
      flaggedCount: 0,
      invalidRate: 0,
      anomalyRate: 0,
      topFlags: [],
    },
    rewardSummary: {
      totalEntries: 1,
      pendingCount: 1,
      finalizedCount: 0,
      voidedCount: 0,
      reversedCount: 0,
      totalPendingAmount: '20',
      totalFinalAmount: '0',
      rewardEntries: [],
    },
    revealSettlement: {
      propositionStatus: 'live',
      resultKind: null,
      winningOption: null,
      voidReason: null,
      frozenAt: null,
      revealStartedAt: null,
      resultComputedAt: null,
      settledAt: null,
      marketStatus: 'live',
      currentPublicProgress: { effectiveSample: 4 },
      lastPublicResult: null,
    },
    auditEvents: [sharedAudit],
    rewardAuditEvents: [
      {
        ...sharedAudit,
        id: 'reward_audit_1',
        entityType: 'reward',
        entityId: 'ledger_1',
        action: 'reward_resolution_triggered',
        reason: 'Reward resolution is pending review.',
      },
    ],
  }
  const dispatchPreview = {
    propositionId: 'prop_list_1',
    propositionCategory: 'general',
    ruleVersion: 'dispatch-tags-v1',
    maxAssignments: 2,
    generalReserveCount: 1,
    selectedUserIds: ['respondent_1'],
    candidates: [
      {
        userId: 'respondent_1',
        eligible: true,
        selected: true,
        blockReason: null,
        priorityBucket: 'priority',
        baseScore: 18,
        qualityAdjustment: 4,
        interestAdjustment: 2,
        finalScore: 24,
        matchedInterestTag: 'interest_ai',
        reasons: ['recent valid answers', 'interest match'],
      },
      {
        userId: 'respondent_2',
        eligible: false,
        selected: false,
        blockReason: 'existing_submitted_task',
        priorityBucket: 'blocked',
        baseScore: 8,
        qualityAdjustment: 0,
        interestAdjustment: 0,
        finalScore: null,
        matchedInterestTag: null,
        reasons: ['already submitted a response'],
      },
    ],
  }
  const createdDispatchTasks = [
    {
      id: 'dispatch_task_1',
      propositionId: 'prop_list_1',
      userId: 'respondent_1',
      status: 'assigned',
      assignedAt: '2026-06-01T10:20:00.000Z',
      startedAt: null,
      submittedAt: null,
      expiresAt: '2026-06-02T10:20:00.000Z',
      skipReason: null,
      expiryReason: null,
      cooldownUntil: null,
      createdAt: '2026-06-01T10:20:00.000Z',
      updatedAt: '2026-06-01T10:20:00.000Z',
    },
  ]
  const recordedCheckpoint = {
    propositionId: 'prop_list_1',
    environment: 'local',
    chainId: 31337,
    stepId: 'publish_and_open',
    status: 'complete',
    reason: 'Operator completed publish and open verification.',
    note: 'Manual checkpoint from the ops console.',
    evidence: ['txHash=0xabc123', 'operator-note'],
    txHash: '0xabc123',
    blockNumber: 123,
    recordedByUserId: 'ops_user_1',
    recordedAt: '2026-06-01T10:25:00.000Z',
  }
  const respondentReputation = {
    userId: 'respondent_1',
    reputationScore: 94,
    reputationLevel: 'trusted',
    ruleVersion: 'quality-v1',
    metrics: {
      completionRate: 0.96,
      validRate: 0.9,
      partialValidRate: 0.05,
      invalidRate: 0.03,
      anomalyRate: 0.02,
      fraudFlagCount: 0,
      reviewedResponseCount: 48,
    },
    computedAt: '2026-06-01T10:24:00.000Z',
  }
  const respondentTags = {
    userId: 'respondent_1',
    tags: [
      {
        tagKey: 'interest_ai',
        tagType: 'interest',
        tagValue: 'active',
        confidenceScore: 0.93,
        sourceType: 'participation',
        ruleVersion: 'tag-v1',
        metadata: { category: 'ai' },
        activatedAt: '2026-05-29T10:00:00.000Z',
        expiresAt: null,
        updatedAt: '2026-06-01T10:24:00.000Z',
      },
      {
        tagKey: 'quality_trusted',
        tagType: 'quality_reputation',
        tagValue: 'trusted',
        confidenceScore: 0.9,
        sourceType: 'reputation',
        ruleVersion: 'tag-v1',
        metadata: { level: 'trusted' },
        activatedAt: '2026-05-30T09:00:00.000Z',
        expiresAt: null,
        updatedAt: '2026-06-01T10:24:00.000Z',
      },
    ],
  }
  return {
    ...actual,
    arenaApi: {
      ...actual.arenaApi,
      getOpsReviewQueue: vi.fn().mockResolvedValue({
        items: [
          {
            propositionId: 'prop_review_1',
            title: 'Review queue proposition',
            category: 'general',
            status: 'live',
            submissionStatus: 'submitted',
            submittedAt: '2026-06-01T10:00:00.000Z',
            marketEnabled: true,
            createdAt: '2026-06-01T09:00:00.000Z',
            publishedAt: '2026-06-01T09:30:00.000Z',
            liveAt: '2026-06-01T10:00:00.000Z',
            frozenAt: null,
            settledAt: null,
            minEffectiveSample: 5,
            effectiveSampleCount: 2,
            reviewedResponseCount: 1,
            pendingReviewCount: 3,
            sampleShortageCount: 3,
          },
        ],
        totalCount: 1,
        limit: 25,
        offset: 0,
      }),
      getOpsPropositions: vi.fn().mockResolvedValue({
        items: [
          {
            propositionId: 'prop_list_1',
            title: 'Ops proposition list item',
            category: 'general',
            status: 'live',
            submissionStatus: 'approved',
            submittedAt: '2026-06-01T10:00:00.000Z',
            marketEnabled: true,
            createdAt: '2026-06-01T09:00:00.000Z',
            publishedAt: '2026-06-01T09:30:00.000Z',
            liveAt: '2026-06-01T10:00:00.000Z',
            frozenAt: null,
            settledAt: null,
            minEffectiveSample: 5,
            effectiveSampleCount: 4,
            reviewedResponseCount: 4,
            pendingReviewCount: 1,
            sampleShortageCount: 1,
          },
        ],
        totalCount: 1,
        limit: 25,
        offset: 0,
      }),
      getOpsProposition: vi.fn().mockResolvedValue(propositionDetail),
      approveOpsProposition: vi.fn().mockResolvedValue({
        propositionId: 'prop_review_1',
        status: 'live',
        submissionStatus: 'approved',
      }),
      rejectOpsProposition: vi.fn().mockResolvedValue({
        propositionId: 'prop_review_1',
        status: 'closed',
        submissionStatus: 'rejected',
      }),
      emergencyFreezeOpsProposition: vi.fn().mockResolvedValue({
        propositionId: 'prop_review_1',
        status: 'frozen',
        submissionStatus: 'approved',
      }),
      getOpsPropositionExport: vi.fn().mockResolvedValue({
        ...propositionDetail,
        exportedAt: '2026-06-01T10:30:00.000Z',
      }),
      getOpsPropositionEvidenceBundle: vi.fn().mockResolvedValue({
        propositionId: 'prop_list_1',
        exportedAt: '2026-06-01T10:30:00.000Z',
        propositionExport: {
          ...propositionDetail,
          exportedAt: '2026-06-01T10:30:00.000Z',
        },
        runtimeContract,
        validationChainHealth: validationHealth,
      }),
      getOpsPropositionRehearsalCheckpoints: vi.fn().mockResolvedValue([
        {
          propositionId: 'prop_list_1',
          environment: 'local',
          chainId: 31337,
          stepId: 'preflight',
          status: 'complete',
          reason: 'Preflight completed',
          note: null,
          evidence: ['Operator log captured.'],
          txHash: null,
          blockNumber: null,
          recordedByUserId: 'ops_user_1',
          recordedAt: '2026-06-01T10:12:00.000Z',
        },
      ]),
      getOpsResponseQueue: vi.fn().mockResolvedValue({
        items: [
          {
            responseId: 'response_ops_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            userId: 'respondent_1',
            submittedAt: '2026-06-01T10:05:00.000Z',
            reviewStatus: 'pending_review',
            workflowState: 'unclaimed',
            claimedByUserId: null,
            claimedAt: null,
            isClaimStale: false,
            claimStaleAfterSeconds: 900,
          },
        ],
        totalCount: 1,
        limit: 25,
        offset: 0,
      }),
      getOpsResponseDetail: vi.fn().mockResolvedValue({
        response: {
          id: 'response_ops_1',
          propositionId: 'prop_list_1',
          taskId: 'task_1',
          userId: 'respondent_1',
          responseVersion: 1,
          isLatest: true,
          selectedOption: 0,
          confirmationOption: 0,
          responsePayload: { confidence: 0.8 },
          understandingAck: true,
          clientStartedAt: '2026-06-01T10:04:00.000Z',
          clientSubmittedAt: '2026-06-01T10:04:30.000Z',
          submittedAt: '2026-06-01T10:05:00.000Z',
        },
        proposition: {
          id: 'prop_list_1',
          title: 'Ops proposition list item',
          category: 'general',
          status: 'live',
        },
        task: {
          id: 'task_1',
          status: 'submitted',
          assignedAt: '2026-06-01T10:00:00.000Z',
          startedAt: '2026-06-01T10:01:00.000Z',
          submittedAt: '2026-06-01T10:05:00.000Z',
          expiresAt: '2026-06-01T10:20:00.000Z',
        },
        workflow: {
          responseId: 'response_ops_1',
          reviewStatus: 'pending_review',
          workflowState: 'unclaimed',
          claimedByUserId: null,
          claimedAt: null,
          releasedByUserId: null,
          releasedAt: null,
          expiredAt: null,
          reviewedByUserId: null,
          reviewedAt: null,
          finalizedReviewStatus: null,
          claimStaleAfterSeconds: 900,
          isClaimStale: false,
        },
        currentReview: null,
      }),
      claimOpsResponseReview: vi.fn().mockResolvedValue({
        responseId: 'response_ops_1',
        reviewStatus: 'pending_review',
        workflowState: 'claimed',
        claimedByUserId: 'ops_user_1',
        claimedAt: '2026-06-01T10:25:00.000Z',
        releasedByUserId: null,
        releasedAt: null,
        expiredAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        finalizedReviewStatus: null,
        claimStaleAfterSeconds: 900,
        isClaimStale: false,
      }),
      releaseOpsResponseReview: vi.fn().mockResolvedValue({
        responseId: 'response_ops_1',
        reviewStatus: 'pending_review',
        workflowState: 'released',
        claimedByUserId: null,
        claimedAt: null,
        releasedByUserId: 'ops_user_1',
        releasedAt: '2026-06-01T10:26:00.000Z',
        expiredAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        finalizedReviewStatus: null,
        claimStaleAfterSeconds: 900,
        isClaimStale: false,
      }),
      reviewOpsResponse: vi.fn().mockResolvedValue({
        responseId: 'response_ops_1',
        reviewStatus: 'valid',
        workflowState: 'finalized',
        claimedByUserId: null,
        claimedAt: null,
        releasedByUserId: null,
        releasedAt: null,
        expiredAt: null,
        reviewedByUserId: 'ops_user_1',
        reviewedAt: '2026-06-01T10:27:00.000Z',
        finalizedReviewStatus: 'valid',
        claimStaleAfterSeconds: 900,
        isClaimStale: false,
      }),
      getOpsRewards: vi.fn().mockResolvedValue({
        items: [
          {
            ledgerId: 'ledger_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            responseId: 'response_ops_1',
            userId: 'respondent_1',
            sourceType: 'response',
            status: 'pending',
            reviewStatus: 'pending_review',
            pendingAmount: '20',
            finalAmount: null,
            ledgerVersion: 1,
            reasonCode: null,
            reversalOfLedgerId: null,
            createdAt: '2026-06-01T10:05:05.000Z',
            finalizedAt: null,
            voidedAt: null,
            reversedAt: null,
          },
        ],
        totalCount: 1,
        limit: 25,
        offset: 0,
      }),
      getOpsRewardDetail: vi.fn().mockResolvedValue({
        ledgerId: 'ledger_1',
        proposition: {
          id: 'prop_list_1',
          title: 'Ops proposition list item',
          status: 'live',
        },
        response: {
          id: 'response_ops_1',
          userId: 'respondent_1',
          isLatest: true,
          submittedAt: '2026-06-01T10:05:00.000Z',
        },
        currentReview: {
          status: 'pending_review',
          qualityScore: 0.8,
          flags: [],
          reasonCodes: [],
          reviewedByUserId: null,
          reviewedAt: null,
        },
        chain: [
          {
            ledgerId: 'ledger_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            responseId: 'response_ops_1',
            userId: 'respondent_1',
            sourceType: 'response',
            status: 'pending',
            reviewStatus: 'pending_review',
            pendingAmount: '20',
            finalAmount: null,
            ledgerVersion: 1,
            reasonCode: null,
            reversalOfLedgerId: null,
            createdAt: '2026-06-01T10:05:05.000Z',
            finalizedAt: null,
            voidedAt: null,
            reversedAt: null,
          },
        ],
        auditEvents: [
          {
            ...sharedAudit,
            id: 'reward_detail_1',
            entityType: 'reward',
            entityId: 'ledger_1',
            action: 'reward_resolution_triggered',
            reason: 'Reward resolution was queued for follow-up.',
          },
        ],
      }),
      retriggerOpsRewardResolution: vi.fn().mockResolvedValue({
        ledgerId: 'ledger_1',
        proposition: {
          id: 'prop_list_1',
          title: 'Ops proposition list item',
          status: 'live',
        },
        response: {
          id: 'response_ops_1',
          userId: 'respondent_1',
          isLatest: true,
          submittedAt: '2026-06-01T10:05:00.000Z',
        },
        currentReview: {
          status: 'pending_review',
          qualityScore: 0.8,
          flags: [],
          reasonCodes: [],
          reviewedByUserId: null,
          reviewedAt: null,
        },
        chain: [],
        auditEvents: [],
      }),
      getOpsAnomalies: vi.fn().mockResolvedValue([]),
      getOpsSampleShortage: vi.fn().mockResolvedValue([]),
      getOpsLifecycleDrift: vi.fn().mockResolvedValue([]),
      getOpsValidationChainHealth: vi.fn().mockResolvedValue(validationHealth),
      getOpsRuntimeContract: vi.fn().mockResolvedValue(runtimeContract),
      reconcileOpsValidationChainBet: vi.fn().mockResolvedValue({
        marketId: 'market_1',
        requestStatus: 'submitted',
      }),
      getOpsQueueOverview: vi.fn().mockResolvedValue({
        generatedAt: '2026-06-01T10:10:00.000Z',
        queues: [],
      }),
      requeueFailedOpsQueue: vi.fn().mockResolvedValue({
        queue: 'validation-chain-sync',
        failedCount: 2,
        retriedCount: 2,
        skippedCount: 0,
      }),
      getOpsValidationChainRuntimeReadiness: vi.fn().mockResolvedValue(validationReadiness),
      previewOpsDispatchCandidates: vi.fn().mockResolvedValue(dispatchPreview),
      createOpsDispatchTasks: vi.fn().mockResolvedValue(createdDispatchTasks),
      recordOpsRehearsalCheckpoint: vi.fn().mockResolvedValue(recordedCheckpoint),
      getOpsRespondentReputation: vi.fn().mockResolvedValue(respondentReputation),
      getOpsRespondentTags: vi.fn().mockResolvedValue(respondentTags),
      getOpsAuditEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'audit_global_2',
            entityType: 'validation_market',
            entityId: 'market_1',
            action: 'runtime_contract.alert.release_blocked',
            actorUserId: 'ops_user_1',
            reason: 'Release path is blocked on scheduler_queue.',
            note: 'Queue worker heartbeat missing.',
            metadata: {},
            createdAt: '2026-06-01T10:20:00.000Z',
          },
          {
            id: 'audit_global_1',
            entityType: 'proposition',
            entityId: 'prop_list_1',
            action: 'proposition.approved',
            actorUserId: 'ops_user_2',
            reason: 'Approved for publishing.',
            note: 'Ready for operator follow-through.',
            metadata: {},
            createdAt: '2026-06-01T10:10:00.000Z',
          },
        ],
        totalCount: 2,
        limit: 25,
        offset: 0,
      }),
    },
  }
  it('hides high-risk takeover actions for operator sessions', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/takeover?propositionId=prop_list_1&marketId=market_1&userId=respondent_1&cancelReasonCode=operator_cancel'])

    expect(await screen.findByText('proposition-scoped')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'freeze-market' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'resolve-market' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'cancel-market' })).not.toBeInTheDocument()
  })

  it('shows high-risk takeover actions for admin sessions', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    window.localStorage.setItem('arena.auth.identity', JSON.stringify({
      sub: 'admin-demo-user',
      walletAddress: 'demo',
      chainId: 31337,
      roles: [SystemRole.Admin],
    }))

    renderApp(['/zh/ops/takeover?propositionId=prop_list_1&marketId=market_1&userId=respondent_1&cancelReasonCode=operator_cancel'])

    expect(await screen.findByRole('button', { name: 'freeze-market' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'resolve-market' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cancel-market' })).toBeInTheDocument()
  })

  it('hides proposition emergency freeze for operator sessions while keeping approve and reject available', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')

    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText('基础信息与生命周期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'freeze' })).not.toBeInTheDocument()
  })

  it('shows proposition emergency freeze for admin sessions', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    window.localStorage.setItem('arena.auth.identity', JSON.stringify({
      sub: 'admin-demo-user',
      walletAddress: 'demo',
      chainId: 31337,
      roles: [SystemRole.Admin],
    }))

    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByRole('button', { name: 'freeze' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
  })
})

describe('OpsConsolePage', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows login prompt when unauthenticated', async () => {
    renderApp(['/zh/ops'])
    expect(await screen.findByText('请登录后访问。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('renders the overview workspace for the demo operator session', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops'])

    expect(await screen.findByText(opsCopy.shell.eyebrow)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.releaseReadiness)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.validationRehearsal)).toBeInTheDocument()
  })

  it('supports page-scoped batch approve actions on the proposition review queue', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsReviewQueue).mockResolvedValueOnce({
      items: [
        {
          propositionId: 'prop_review_1',
          title: 'Review queue proposition',
          category: 'general',
          status: 'live',
          submissionStatus: 'submitted',
          submittedAt: '2026-06-01T10:00:00.000Z',
          marketEnabled: true,
          createdAt: '2026-06-01T09:00:00.000Z',
          publishedAt: '2026-06-01T09:30:00.000Z',
          liveAt: '2026-06-01T10:00:00.000Z',
          frozenAt: null,
          settledAt: null,
          minEffectiveSample: 5,
          effectiveSampleCount: 2,
          reviewedResponseCount: 1,
          pendingReviewCount: 3,
          sampleShortageCount: 3,
        },
        {
          propositionId: 'prop_review_2',
          title: 'Second review queue proposition',
          category: 'sports',
          status: 'scheduled',
          submissionStatus: 'submitted',
          submittedAt: '2026-06-01T10:02:00.000Z',
          marketEnabled: false,
          createdAt: '2026-06-01T09:10:00.000Z',
          publishedAt: null,
          liveAt: null,
          frozenAt: null,
          settledAt: null,
          minEffectiveSample: 8,
          effectiveSampleCount: 1,
          reviewedResponseCount: 0,
          pendingReviewCount: 2,
          sampleShortageCount: 4,
        },
      ],
      totalCount: 2,
      limit: 25,
      offset: 0,
    })

    renderApp(['/zh/ops/propositions?reviewQueueOnly=true'])

    expect(await screen.findByText(opsCopy.propositions.queueTitle)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: opsCopy.propositions.selectAllAria }))
    expect(screen.getByText(opsCopy.queue.selectedOnPage(2))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.propositions.batchApprove }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getAllByRole('button')[1]!)

    await waitFor(() => {
      expect(arenaApi.approveOpsProposition).toHaveBeenCalledTimes(2)
    })
    expect(arenaApi.approveOpsProposition).toHaveBeenNthCalledWith(
      1,
      'prop_review_1',
      expect.objectContaining({ reason: 'ops_approved' }),
      'arena.demo.session',
    )
    expect(arenaApi.approveOpsProposition).toHaveBeenNthCalledWith(
      2,
      'prop_review_2',
      expect.objectContaining({ reason: 'ops_approved' }),
      'arena.demo.session',
    )
    expect(await screen.findByText('processedCount: 2')).toBeInTheDocument()
  })

  it('renders an inline evidence bundle preview from proposition detail', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')

    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText('证据中心')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.previewBundle }))

    await waitFor(() => {
      expect(arenaApi.getOpsPropositionEvidenceBundle).toHaveBeenCalledWith('prop_list_1', 'arena.demo.session')
    })
    expect(await screen.findByText(opsCopy.propositionDetail.evidence.bundlePreview)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.propositionDetail.evidence.bundleKv.runtimeReadiness)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.propositionDetail.evidence.validationAlertReasons)).toBeInTheDocument()
  })

  it('exposes CSV, report, and evidence export actions from proposition detail', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')

    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText('证据中心')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.exportJson })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.exportCsv })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.downloadReport })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.downloadBundleJson })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.evidence.downloadCheckpointsCsv })).toBeInTheDocument()
  })

  it('uses skeleton loading states in ops workspaces while operator data is pending', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsQueueOverview).mockImplementationOnce(
      () => new Promise(() => {}),
    )

    const { container } = renderApp(['/zh/ops/health'])

    const loading = await screen.findByLabelText(opsCopy.shared.loadingAria)
    expect(loading).toHaveClass('ops-loading-skeleton')
    expect(container.querySelector('.ops-loading-skeleton .skeleton-line')).not.toBeNull()
  })

  it('surfaces operator efficiency metrics and recent operations on the overview workspace', async () => {
    const now = new Date()
    const toIsoMinutesAgo = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    window.localStorage.setItem('arena.ops.recentActionReceipts', JSON.stringify([
      {
        id: 'receipt_1',
        actorUserId: 'demo-user',
        title: 'Batch claim response reviews',
        description: '2 selected responses',
        tone: 'success',
        message: 'Batch claim completed for 2 responses.',
        receipt: ['processedCount: 2'],
        createdAt: toIsoMinutesAgo(5),
      },
    ]))
    vi.mocked(arenaApi.getOpsResponseQueue)
      .mockResolvedValueOnce({
        items: [
          {
            responseId: 'response_ops_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            userId: 'respondent_1',
            submittedAt: toIsoMinutesAgo(30),
            reviewStatus: 'pending_review',
            workflowState: 'unclaimed',
            claimedByUserId: null,
            claimedAt: null,
            isClaimStale: false,
            claimStaleAfterSeconds: 900,
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            responseId: 'response_claimed_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            userId: 'respondent_1',
            submittedAt: toIsoMinutesAgo(110),
            reviewStatus: 'pending_review',
            workflowState: 'claimed',
            claimedByUserId: 'ops_user_1',
            claimedAt: toIsoMinutesAgo(105),
            isClaimStale: false,
            claimStaleAfterSeconds: 900,
          },
          {
            responseId: 'response_claimed_2',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            userId: 'respondent_2',
            submittedAt: toIsoMinutesAgo(109),
            reviewStatus: 'pending_review',
            workflowState: 'claimed',
            claimedByUserId: 'ops_user_1',
            claimedAt: toIsoMinutesAgo(104),
            isClaimStale: false,
            claimStaleAfterSeconds: 900,
          },
        ],
        totalCount: 2,
        limit: 100,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            responseId: 'response_stale_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            userId: 'respondent_3',
            submittedAt: toIsoMinutesAgo(120),
            reviewStatus: 'pending_review',
            workflowState: 'unclaimed',
            claimedByUserId: null,
            claimedAt: null,
            isClaimStale: true,
            claimStaleAfterSeconds: 900,
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
      })
    vi.mocked(arenaApi.getOpsAuditEvents).mockResolvedValueOnce({
      items: [
        {
          id: 'audit_recent_1',
          entityType: 'response',
          entityId: 'response_claimed_1',
          action: 'response_review.claimed',
          actorUserId: 'ops_user_1',
          reason: 'Claimed for manual follow-up.',
          note: null,
          metadata: {},
          createdAt: toIsoMinutesAgo(40),
        },
        {
          id: 'audit_recent_2',
          entityType: 'reward_ledger',
          entityId: 'ledger_1',
          action: 'reward_resolution.retriggered',
          actorUserId: 'ops_user_1',
          reason: 'Retried after manual verification.',
          note: null,
          metadata: {},
          createdAt: toIsoMinutesAgo(15),
        },
      ],
      totalCount: 2,
      limit: 100,
      offset: 0,
    })

    renderApp(['/zh/ops'])

    expect(await screen.findByText(opsCopy.overview.todayThroughput)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.todayThroughputDetail(2))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.myActiveReviewLoad)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.myActiveReviewDetail(2))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.claimSlaBreaches)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.claimSlaOldestOverdue('1h 45m'))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.overview.myRecentOperations)).toBeInTheDocument()
    expect(screen.getByText('Batch claim completed for 2 responses.')).toBeInTheDocument()
  })

  it('renders the propositions route as a list workspace', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/propositions'])

    expect(await screen.findByText('Ops proposition list item')).toBeInTheDocument()
  })

  it('renders the global responses queue route', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/responses?reviewStatus=pending_review&responseId=response_ops_1'])

    expect((await screen.findAllByText('response_ops_1')).length).toBeGreaterThan(0)
    expect(screen.getByText(opsCopy.responses.claim)).toBeInTheDocument()
  })

  it('supports batch claim actions from the response queue', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsResponseQueue).mockResolvedValueOnce({
      items: [
        {
          responseId: 'response_ops_1',
          propositionId: 'prop_list_1',
          propositionTitle: 'Ops proposition list item',
          userId: 'respondent_1',
          submittedAt: '2026-06-01T10:05:00.000Z',
          reviewStatus: 'pending_review',
          workflowState: 'unclaimed',
          claimedByUserId: null,
          claimedAt: null,
          isClaimStale: false,
          claimStaleAfterSeconds: 900,
        },
        {
          responseId: 'response_ops_2',
          propositionId: 'prop_list_1',
          propositionTitle: 'Ops proposition list item',
          userId: 'respondent_2',
          submittedAt: '2026-06-01T10:06:00.000Z',
          reviewStatus: 'pending_review',
          workflowState: 'unclaimed',
          claimedByUserId: null,
          claimedAt: null,
          isClaimStale: false,
          claimStaleAfterSeconds: 900,
        },
      ],
      totalCount: 2,
      limit: 25,
      offset: 0,
    })
    vi.mocked(arenaApi.claimOpsResponseReview)
      .mockResolvedValueOnce({
        responseId: 'response_ops_1',
        reviewStatus: 'pending_review',
        workflowState: 'claimed',
        claimedByUserId: 'ops_user_1',
        claimedAt: '2026-06-01T10:25:00.000Z',
        releasedByUserId: null,
        releasedAt: null,
        expiredAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        finalizedReviewStatus: null,
        claimStaleAfterSeconds: 900,
        isClaimStale: false,
      })
      .mockResolvedValueOnce({
        responseId: 'response_ops_2',
        reviewStatus: 'pending_review',
        workflowState: 'claimed',
        claimedByUserId: 'ops_user_1',
        claimedAt: '2026-06-01T10:25:05.000Z',
        releasedByUserId: null,
        releasedAt: null,
        expiredAt: null,
        reviewedByUserId: null,
        reviewedAt: null,
        finalizedReviewStatus: null,
        claimStaleAfterSeconds: 900,
        isClaimStale: false,
      })

    renderApp(['/zh/ops/responses?reviewStatus=pending_review'])

    expect(await screen.findByText(opsCopy.responses.batchClaim)).toBeInTheDocument()
    await user.click(screen.getByLabelText(opsCopy.responses.selectAllAria))
    expect(screen.getByText(opsCopy.queue.selectedOnPage(2))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.responses.batchClaim }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getAllByRole('button')[1]!)

    await waitFor(() => {
      expect(arenaApi.claimOpsResponseReview).toHaveBeenCalledTimes(2)
    })
    expect(vi.mocked(arenaApi.claimOpsResponseReview).mock.calls[0]?.[0]).toBe('response_ops_1')
    expect(vi.mocked(arenaApi.claimOpsResponseReview).mock.calls[1]?.[0]).toBe('response_ops_2')
    expect(screen.getByText(opsCopy.responses.batchResultOk(opsCopy.responses.actionLabels.claim, 2))).toBeInTheDocument()
    expect(screen.getByText('processedCount: 2')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('arena.ops.recentActionReceipts') ?? '[]')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorUserId: 'demo-user',
        title: opsCopy.responses.batchClaimTitle,
        tone: 'success',
        message: opsCopy.responses.batchResultOk(opsCopy.responses.actionLabels.claim, 2),
        receipt: expect.arrayContaining(['processedCount: 2']),
      }),
    ]))
  })

  it('renders the proposition detail workspace', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText('基础信息与生命周期')).toBeInTheDocument()
    expect(screen.getByText('证据中心')).toBeInTheDocument()
    expect(screen.getByText('响应子队列')).toBeInTheDocument()
  })

  it('previews and creates dispatch tasks from proposition detail', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText(opsCopy.dispatch.title)).toBeInTheDocument()

    await user.type(screen.getByLabelText(opsCopy.dispatch.candidateUserIds), 'respondent_1\nrespondent_2')
    await user.clear(screen.getByLabelText(opsCopy.dispatch.assignedAt))
    await user.type(screen.getByLabelText(opsCopy.dispatch.assignedAt), '2026-06-01T10:20')
    await user.clear(screen.getByLabelText(opsCopy.dispatch.expiresAt))
    await user.type(screen.getByLabelText(opsCopy.dispatch.expiresAt), '2026-06-02T10:20')
    await user.clear(screen.getByLabelText(opsCopy.dispatch.maxAssignments))
    await user.type(screen.getByLabelText(opsCopy.dispatch.maxAssignments), '2')

    await user.click(screen.getByRole('button', { name: opsCopy.dispatch.previewDispatch }))

    await waitFor(() => {
      expect(arenaApi.previewOpsDispatchCandidates).toHaveBeenCalledWith(
        'prop_list_1',
        {
          userIds: ['respondent_1', 'respondent_2'],
          assignedAt: '2026-06-01T10:20:00.000Z',
          maxAssignments: 2,
        },
        'arena.demo.session',
      )
    })
    expect(screen.getAllByText('respondent_1').length).toBeGreaterThan(0)
    expect(screen.getByText('dispatch-tags-v1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.dispatch.createDispatch }))

    await waitFor(() => {
      expect(arenaApi.createOpsDispatchTasks).toHaveBeenCalledWith(
        'prop_list_1',
        {
          userIds: ['respondent_1', 'respondent_2'],
          assignedAt: '2026-06-01T10:20:00.000Z',
          expiresAt: '2026-06-02T10:20:00.000Z',
          maxAssignments: 2,
        },
        'arena.demo.session',
      )
    })
  }, 10000)

  it('records a rehearsal checkpoint from proposition detail', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/propositions/prop_list_1'])

    expect(await screen.findByText(opsCopy.propositionDetail.checkpointForm.title)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.step), 'publish_and_open')
    await user.selectOptions(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.status), 'complete')
    fireEvent.change(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.reason), { target: { value: 'checkpoint ok' } })
    fireEvent.change(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.note), { target: { value: 'note' } })
    fireEvent.change(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.evidence), { target: { value: 'tx=0xabc123\nlog=ready' } })
    fireEvent.change(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.txHash), { target: { value: '0xabc123' } })
    fireEvent.change(screen.getByLabelText(opsCopy.propositionDetail.checkpointForm.blockNumber), { target: { value: '123' } })

    await user.click(screen.getByRole('button', { name: opsCopy.propositionDetail.checkpointForm.submit }))

    await waitFor(() => {
      expect(arenaApi.recordOpsRehearsalCheckpoint).toHaveBeenCalledWith(
        'prop_list_1',
        {
          stepId: 'publish_and_open',
          status: 'complete',
          reason: 'checkpoint ok',
          note: 'note',
          evidence: ['tx=0xabc123', 'log=ready'],
          txHash: '0xabc123',
          blockNumber: 123,
        },
        'arena.demo.session',
      )
    })

  })

  it('supports batch retrigger actions from the rewards workspace', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsRewards).mockResolvedValueOnce({
      items: [
        {
          ledgerId: 'ledger_1',
          propositionId: 'prop_list_1',
          propositionTitle: 'Ops proposition list item',
          responseId: 'response_ops_1',
          userId: 'respondent_1',
          sourceType: 'response',
          status: 'pending',
          reviewStatus: 'pending_review',
          pendingAmount: '20',
          finalAmount: null,
          ledgerVersion: 1,
          reasonCode: null,
          reversalOfLedgerId: null,
          createdAt: '2026-06-01T10:05:05.000Z',
          finalizedAt: null,
          voidedAt: null,
          reversedAt: null,
        },
        {
          ledgerId: 'ledger_2',
          propositionId: 'prop_list_1',
          propositionTitle: 'Ops proposition list item',
          responseId: 'response_ops_2',
          userId: 'respondent_2',
          sourceType: 'response',
          status: 'pending',
          reviewStatus: 'pending_review',
          pendingAmount: '30',
          finalAmount: null,
          ledgerVersion: 1,
          reasonCode: null,
          reversalOfLedgerId: null,
          createdAt: '2026-06-01T10:06:05.000Z',
          finalizedAt: null,
          voidedAt: null,
          reversedAt: null,
        },
      ],
      totalCount: 2,
      limit: 25,
      offset: 0,
    })
    vi.mocked(arenaApi.retriggerOpsRewardResolution)
      .mockResolvedValueOnce({
        ledgerId: 'ledger_1',
        proposition: {
          id: 'prop_list_1',
          title: 'Ops proposition list item',
          status: 'live',
        },
        response: {
          id: 'response_ops_1',
          userId: 'respondent_1',
          isLatest: true,
          submittedAt: '2026-06-01T10:05:00.000Z',
        },
        currentReview: null,
        chain: [],
        auditEvents: [],
      })
      .mockResolvedValueOnce({
        ledgerId: 'ledger_2',
        proposition: {
          id: 'prop_list_1',
          title: 'Ops proposition list item',
          status: 'live',
        },
        response: {
          id: 'response_ops_2',
          userId: 'respondent_2',
          isLatest: true,
          submittedAt: '2026-06-01T10:06:00.000Z',
        },
        currentReview: null,
        chain: [],
        auditEvents: [],
      })

    renderApp(['/zh/ops/rewards?status=pending'])

    expect(await screen.findByText(opsCopy.rewards.batchRetrigger)).toBeInTheDocument()
    await user.click(screen.getByLabelText(opsCopy.rewards.selectAllAria))
    expect(screen.getByText(opsCopy.queue.selectedOnPage(2))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.rewards.batchRetrigger }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(arenaApi.retriggerOpsRewardResolution).toHaveBeenCalledTimes(2)
    })
    expect(vi.mocked(arenaApi.retriggerOpsRewardResolution).mock.calls[0]?.[0]).toBe('ledger_1')
    expect(vi.mocked(arenaApi.retriggerOpsRewardResolution).mock.calls[1]?.[0]).toBe('ledger_2')
    expect(screen.getByText(opsCopy.rewards.batchResultOk(2))).toBeInTheDocument()
    expect(screen.getByText('processedCount: 2')).toBeInTheDocument()
  })

  it('renders the rewards workspace with detail focus', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/rewards?ledgerId=ledger_1&sourceType=response'])

    expect(await screen.findByText(opsCopy.rewards.queueTitle)).toBeInTheDocument()
    expect(screen.getByText('retrigger-review-resolution')).toBeInTheDocument()
    expect(screen.getByText(opsCopy.rewards.auditTitle)).toBeInTheDocument()
  })

  it('renders the audit workspace and passes URL filters through to the api client', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/audit?search=release&actorUserId=ops_user_1&entityType=validation_market&limit=10&offset=10'])

    expect(await screen.findByText(opsCopy.audit.title)).toBeInTheDocument()
    expect(screen.getByText('runtime_contract.alert.release_blocked')).toBeInTheDocument()
    expect(arenaApi.getOpsAuditEvents).toHaveBeenCalledWith('arena.demo.session', {
      search: 'release',
      entityType: 'validation_market',
      entityId: undefined,
      actorUserId: 'ops_user_1',
      action: undefined,
      sortDirection: undefined,
      limit: 10,
      offset: 10,
    })
  })

  it('renders the health workspace deep-read sections', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/health'])

    expect(await screen.findByText(opsCopy.health.chainHealthTitle)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.health.eventLedgerTitle)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.runtimeContract.rehearsalGlobalContract)).toBeInTheDocument()
  })

  it('renders health trend sparklines for waiting, alerts, anomaly rate, and sample progress', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/health'])

    expect(await screen.findByText(opsCopy.trends.title)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.trends.waiting.title)).toBeInTheDocument()
    expect(screen.getByLabelText(opsCopy.trends.sparklineAria(opsCopy.trends.waiting.title))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.trends.alert.title)).toBeInTheDocument()
    expect(screen.getByLabelText(opsCopy.trends.sparklineAria(opsCopy.trends.alert.title))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.trends.anomaly.title)).toBeInTheDocument()
    expect(screen.getByLabelText(opsCopy.trends.sparklineAria(opsCopy.trends.anomaly.title))).toBeInTheDocument()
    expect(screen.getByText(opsCopy.trends.sample.title)).toBeInTheDocument()
    expect(screen.getByLabelText(opsCopy.trends.sparklineAria(opsCopy.trends.sample.title))).toBeInTheDocument()
  })

  it('surfaces a severity-scored attention inbox on the health workspace', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsAnomalies).mockResolvedValueOnce([
      {
        propositionId: 'prop_list_1',
        title: 'Ops proposition list item',
        category: 'general',
        status: 'live',
        reviewedResponseCount: 12,
        validCount: 6,
        partialValidCount: 1,
        invalidCount: 3,
        fraudSuspectedCount: 1,
        flaggedCount: 2,
        invalidRate: 0.25,
        anomalyRate: 0.41,
        riskyRespondentCount: 2,
        topFlags: [{ flag: 'duplicate_pattern', count: 2 }],
      },
    ])
    vi.mocked(arenaApi.getOpsSampleShortage).mockResolvedValueOnce([
      {
        propositionId: 'prop_list_2',
        title: 'Second ops proposition',
        category: 'general',
        status: 'live',
        liveAt: '2026-06-01T10:00:00.000Z',
        deadlineAt: '2026-06-01T12:00:00.000Z',
        remainingSeconds: 1800,
        minEffectiveSample: 10,
        effectiveSampleCount: 6,
        reviewedResponseCount: 7,
        shortageCount: 4,
        nearingDeadline: true,
      },
    ])
    vi.mocked(arenaApi.getOpsLifecycleDrift).mockResolvedValueOnce([
      {
        propositionId: 'prop_list_3',
        title: 'Third ops proposition',
        category: 'general',
        propositionStatus: 'settled',
        marketId: 'market_3',
        marketStatus: 'settled',
        chainMarketId: 'chain_market_3',
        chainStatus: 'live',
        onChainState: 'live',
        chainSyncedAt: '2026-06-01T10:11:00.000Z',
        publishedAt: '2026-06-01T09:00:00.000Z',
        liveAt: '2026-06-01T10:00:00.000Z',
        frozenAt: null,
        revealStartedAt: null,
        resultComputedAt: null,
        settledAt: null,
        driftReason: 'chain_market_not_resolved',
        operatorGuidance: {
          kind: 'queue_recovery',
          summary: 'Market status drifted from the chain view.',
          recoveryReason: 'resolve_settled_market',
          operatorActions: ['Open takeover and inspect the market lifecycle.'],
          plannedCommands: ['resolve_market'],
        },
      },
    ])

    renderApp(['/zh/ops/health'])

    expect(await screen.findByText(opsCopy.attention.title)).toBeInTheDocument()
    expect(screen.getByText(/紧急未读/)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.attention.anomalyLabel('Ops proposition list item'))).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: opsCopy.attention.markHandled })[0]!)

    expect(screen.getByText(opsCopy.attention.handled(1))).toBeInTheDocument()
    expect(window.localStorage.getItem('arena.ops.healthAttentionState')).toContain('handledAt')
  })

  it('prioritizes the active validation-chain summary and exposes audit drill-down links on the health workspace', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    const { container } = renderApp(['/zh/ops/health'])

    expect(await screen.findByText('One stale payout market needs attention.')).toBeInTheDocument()
    expect(container.querySelector('a[href="/zh/ops/audit?entityType=market&entityId=market_1&action=stale_payout_market"]')).not.toBeNull()
    expect(container.querySelector('a[href="/zh/ops/takeover?marketId=market_1"]')).not.toBeNull()
  })

  it('renders delayed and completed queue counts on the health workspace', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsQueueOverview).mockResolvedValueOnce({
      status: 'ok',
      timestamp: '2026-06-01T10:10:00.000Z',
      redis: { status: 'up' },
      queues: [
        {
          name: 'validation-chain-sync',
          status: 'up',
          policy: {
            retryable: true,
            attempts: 3,
            backoffType: 'exponential',
            backoffDelayMs: 5000,
          },
          counts: {
            waiting: 1,
            active: 0,
            delayed: 2,
            completed: 12,
            failed: 0,
          },
        },
      ],
    })
    renderApp(['/zh/ops/health'])

    expect(await screen.findByRole('columnheader', { name: opsCopy.queueOverview.table.delayed })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: opsCopy.queueOverview.table.completed })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows an admin-only requeue entry for failed queues on the health workspace', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    window.localStorage.setItem('arena.auth.identity', JSON.stringify({
      sub: 'admin-demo-user',
      walletAddress: 'demo',
      chainId: 31337,
      roles: [SystemRole.Admin],
    }))
    vi.mocked(arenaApi.getOpsQueueOverview).mockResolvedValueOnce({
      status: 'ok',
      timestamp: '2026-06-01T10:10:00.000Z',
      redis: { status: 'up' },
      queues: [
        {
          name: 'validation-chain-sync',
          status: 'up',
          policy: {
            retryable: true,
            attempts: 3,
            backoffType: 'exponential',
            backoffDelayMs: 5000,
          },
          counts: {
            waiting: 1,
            active: 0,
            delayed: 2,
            completed: 12,
            failed: 2,
          },
        },
      ],
    })

    renderApp(['/zh/ops/health'])

    expect(await screen.findByRole('button', { name: opsCopy.queueOverview.requeueFailed })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.queueOverview.requeueFailed }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getAllByRole('button')[1]!)

    await waitFor(() => {
      expect(arenaApi.requeueFailedOpsQueue).toHaveBeenCalledWith('validation-chain-sync', 'arena.demo.session')
    })
    expect(screen.getByText('retriedCount: 2')).toBeInTheDocument()
  })

  it('supports batch reconcile actions for selected unsynced backlog bets on the health workspace', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    const baseHealth = await arenaApi.getOpsValidationChainHealth('arena.demo.session')
    vi.mocked(arenaApi.getOpsValidationChainHealth).mockResolvedValueOnce({
      ...baseHealth,
      metrics: {
        ...baseHealth.metrics,
        unsyncedBetBacklogCount: 2,
      },
      projection: {
        ...baseHealth.projection,
        unsyncedBetBacklog: [
          ...baseHealth.projection.unsyncedBetBacklog,
          {
            betId: 'bet_2',
            marketId: 'market_2',
            propositionId: 'prop_list_1',
            userId: 'respondent_2',
            status: 'open',
            stakeAmount: '12',
            placedAt: '2026-06-01T10:06:10.000Z',
            chainMarketId: 'chain_market_2',
            chainStatus: 'live',
            oldestUnsyncedAgeMs: 51000,
            operatorActions: ['Reconcile the second unsynced bet before replaying the projection.'],
          },
        ],
      },
    })
    vi.mocked(arenaApi.reconcileOpsValidationChainBet)
      .mockResolvedValueOnce({
        marketId: 'market_1',
        requestStatus: 'submitted',
      })
      .mockResolvedValueOnce({
        marketId: 'market_2',
        requestStatus: 'submitted',
      })

    renderApp(['/zh/ops/health'])

    expect(await screen.findByRole('button', { name: opsCopy.health.batchReconcile })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: opsCopy.health.selectAllBacklogAria }))
    expect(screen.getByText(opsCopy.health.selectedInBacklog(2))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: opsCopy.health.batchReconcile }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getAllByRole('button')[1]!)

    await waitFor(() => {
      expect(arenaApi.reconcileOpsValidationChainBet).toHaveBeenCalledTimes(2)
    })
    expect(arenaApi.reconcileOpsValidationChainBet).toHaveBeenNthCalledWith(
      1,
      'market_1',
      'respondent_1',
      expect.objectContaining({ reason: 'reconcile_validation_bet' }),
      'arena.demo.session',
    )
    expect(arenaApi.reconcileOpsValidationChainBet).toHaveBeenNthCalledWith(
      2,
      'market_2',
      'respondent_2',
      expect.objectContaining({ reason: 'reconcile_validation_bet' }),
      'arena.demo.session',
    )
    expect(screen.getByText(opsCopy.health.batchReconcileResultOk(2))).toBeInTheDocument()
    expect(screen.getByText('processedCount: 2')).toBeInTheDocument()
  })

  it('keeps core ops workspaces usable at a mobile viewport width', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    })
    window.dispatchEvent(new Event('resize'))

    const healthView = renderApp(['/zh/ops/health'])
    expect(await screen.findByText(opsCopy.trends.title)).toBeInTheDocument()
    expect(screen.getByLabelText(opsCopy.trends.sparklineAria(opsCopy.trends.waiting.title))).toBeInTheDocument()
    expect(healthView.container.querySelector('.ops-table-scroll .ops-table')).not.toBeNull()
    healthView.unmount()

    const takeoverView = renderApp(['/zh/ops/takeover?propositionId=prop_list_1&marketId=market_1&userId=respondent_1&cancelReasonCode=operator_cancel'])
    expect(await screen.findByText(opsCopy.takeover.propositionScopedTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create-market/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open-market/ })).toBeInTheDocument()
    takeoverView.unmount()

    const propositionView = renderApp(['/zh/ops/propositions/prop_list_1'])
    expect(await screen.findByText('证据中心')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: opsCopy.propositionDetail.actions.approve })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: opsCopy.propositionDetail.actions.freeze })).not.toBeInTheDocument()
    propositionView.unmount()

    const responsesView = renderApp(['/zh/ops/responses'])
    expect(await screen.findByText(opsCopy.responses.queueTitle)).toBeInTheDocument()
    expect(responsesView.container.querySelector('.ops-table-scroll .ops-table')).not.toBeNull()
  })

  it('surfaces a permission-specific operator error when response detail access is forbidden', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsResponseDetail).mockRejectedValueOnce(
      new ArenaApiError(403, 'Operator detail is restricted for this response.'),
    )

    renderApp(['/zh/ops/responses?reviewStatus=pending_review&responseId=response_ops_1'])

    expect(await screen.findByText(opsCopy.states.permissionDenied)).toBeInTheDocument()
    expect(screen.getByText('HTTP 403')).toBeInTheDocument()
    expect(screen.getByText('Operator detail is restricted for this response.')).toBeInTheDocument()
  })

  it('renders the not-found detail when reward detail returns a 404', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    vi.mocked(arenaApi.getOpsRewardDetail).mockRejectedValueOnce(
      new ArenaApiError(404, 'Reward ledger was not found.'),
    )

    renderApp(['/zh/ops/rewards?ledgerId=missing_ledger'])

    expect(await screen.findByText(opsCopy.states.notFound)).toBeInTheDocument()
    expect(screen.getByText('未找到该 ledger。')).toBeInTheDocument()
  })

  it('renders the respondent profile workspace', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    renderApp(['/zh/ops/respondents/respondent_1'])

    expect(await screen.findByText(opsCopy.respondent.title)).toBeInTheDocument()
    expect(screen.getByText('trusted')).toBeInTheDocument()
    expect(screen.getByText('interest_ai')).toBeInTheDocument()
  })

  it('renders the takeover workspace with scoped sections', async () => {
    window.localStorage.setItem('arena.auth.token', 'arena.demo.session')
    const { container } = renderApp(['/zh/ops/takeover?propositionId=prop_list_1&marketId=market_1&userId=respondent_1&cancelReasonCode=operator_cancel'])

    expect(await screen.findByText(opsCopy.takeover.propositionScopedTitle)).toBeInTheDocument()
    expect(screen.getByText(opsCopy.takeover.marketScopedTitle)).toBeInTheDocument()
    const sectionTitles = Array.from(container.querySelectorAll('.ops-section-title')).map((node) => node.textContent)
    expect(sectionTitles).toContain(opsCopy.takeover.latestEvidenceTitle)
  })
})
