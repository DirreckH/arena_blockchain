import type {
  QueueFailedJobRequeueResultSnapshot,
  QueueOverviewSnapshot,
  RespondentReputationInternalViewModel,
  RespondentTagInternalViewModel,
} from '@arena/shared'
import type {
  BackendRuntimeContractViewModel,
  InternalAuditEventListPageViewModel,
  InternalAuditEventViewModel,
  InternalListSortDirection,
  InternalPropositionDetailViewModel,
  InternalPropositionEvidenceBundleViewModel,
  InternalPropositionListItemViewModel,
  InternalPropositionListPageViewModel,
  InternalResponseReviewDetailViewModel,
  InternalResponseReviewQueueItemViewModel,
  InternalResponseReviewQueuePageViewModel,
  InternalRewardAuditDetailViewModel,
  InternalRewardAuditListItemViewModel,
  InternalRewardAuditListPageViewModel,
  OpsAuditFilters,
  OpsDispatchPreviewViewModel,
  OpsDispatchTaskViewModel,
  OpsPropositionFilters,
  OpsResponseQueueFilters,
  OpsRewardFilters,
  OpsValidationChainPropositionCommand,
  PropositionValidationRehearsalCheckpointViewModel,
  QualityAnomalyMonitoringItemViewModel,
  ResponseReviewWorkflowViewModel,
  SampleShortageMonitoringItemViewModel,
  ValidationChainCommandResultViewModel,
  ValidationChainMonitoringViewModel,
  ValidationChainRuntimeReadinessViewModel,
  ValidationLifecycleDriftMonitoringItemViewModel,
} from '../arena/internal-ops.types'

const DEMO_OPERATOR_ID = 'ops_user_1'
const DEMO_NOW = '2026-06-01T10:12:00.000Z'

type DemoOpsState = {
  auditEvents: InternalAuditEventViewModel[]
  reviewQueueItems: InternalPropositionListItemViewModel[]
  propositionItems: InternalPropositionListItemViewModel[]
  propositionDetail: InternalPropositionDetailViewModel
  dispatchTasks: OpsDispatchTaskViewModel[]
  responseQueueItems: InternalResponseReviewQueueItemViewModel[]
  responseDetails: Record<string, InternalResponseReviewDetailViewModel>
  responseWorkflows: Record<string, ResponseReviewWorkflowViewModel>
  rewardItems: InternalRewardAuditListItemViewModel[]
  rewardDetails: Record<string, InternalRewardAuditDetailViewModel>
  respondentReputation: Record<string, RespondentReputationInternalViewModel>
  respondentTags: Record<string, RespondentTagInternalViewModel>
  sampleShortage: SampleShortageMonitoringItemViewModel[]
  anomalies: QualityAnomalyMonitoringItemViewModel[]
  lifecycleDrift: ValidationLifecycleDriftMonitoringItemViewModel[]
  validationReadiness: ValidationChainRuntimeReadinessViewModel
  validationHealth: ValidationChainMonitoringViewModel
  runtimeContract: BackendRuntimeContractViewModel
  queueOverview: QueueOverviewSnapshot
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function createAuditEvent(
  input: Omit<InternalAuditEventViewModel, 'id' | 'createdAt'> & {
    id?: string
    createdAt?: string
  },
): InternalAuditEventViewModel {
  return {
    id: input.id ?? `audit_${Date.now()}`,
    createdAt: input.createdAt ?? DEMO_NOW,
    ...input,
  }
}

function createInitialState(): DemoOpsState {
  const sharedAudit = createAuditEvent({
    id: 'audit_1',
    entityType: 'proposition',
    entityId: 'prop_list_1',
    action: 'validation_rehearsal_checkpoint',
    actorUserId: DEMO_OPERATOR_ID,
    reason: 'Operator recorded rehearsal checkpoint.',
    note: null,
    metadata: {},
    createdAt: '2026-06-01T10:12:00.000Z',
  })

  const validationReadiness: ValidationChainRuntimeReadinessViewModel = {
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

  const validationHealth: ValidationChainMonitoringViewModel = {
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

  const runtimeContract: BackendRuntimeContractViewModel = {
    status: 'ok',
    generatedAt: '2026-06-01T10:12:00.000Z',
    environment: {
      nodeEnv: 'test',
      validationEnvironment: 'local',
      port: 3000,
    },
    health: {
      live: { status: 'ok', timestamp: '2026-06-01T10:12:00.000Z' },
      readiness: {
        status: 'ok',
        timestamp: '2026-06-01T10:12:00.000Z',
        dependencies: [],
      },
      queues: {
        status: 'ok',
        timestamp: '2026-06-01T10:10:00.000Z',
        redis: { status: 'up' },
        queues: [],
      },
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

  const propositionDetail: InternalPropositionDetailViewModel = {
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
        kind: 'queue_recovery',
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
            recordedByUserId: DEMO_OPERATOR_ID,
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
      createAuditEvent({
        id: 'reward_audit_1',
        entityType: 'reward',
        entityId: 'ledger_1',
        action: 'reward_resolution_triggered',
        actorUserId: DEMO_OPERATOR_ID,
        reason: 'Reward resolution is pending review.',
        note: null,
        metadata: { propositionId: 'prop_list_1', responseId: 'response_ops_1' },
      }),
    ],
  }

  return {
    auditEvents: [
      createAuditEvent({
        id: 'audit_global_2',
        entityType: 'validation_market',
        entityId: 'market_1',
        action: 'runtime_contract.alert.release_blocked',
        actorUserId: DEMO_OPERATOR_ID,
        reason: 'Release path is blocked on scheduler_queue.',
        note: 'Queue worker heartbeat missing.',
        metadata: { propositionId: 'prop_list_1', marketId: 'market_1', userId: 'respondent_1' },
        createdAt: '2026-06-01T10:20:00.000Z',
      }),
      createAuditEvent({
        id: 'audit_global_1',
        entityType: 'proposition',
        entityId: 'prop_list_1',
        action: 'proposition.approved',
        actorUserId: 'ops_user_2',
        reason: 'Approved for publishing.',
        note: 'Ready for operator follow-through.',
        metadata: { propositionId: 'prop_list_1' },
        createdAt: '2026-06-01T10:10:00.000Z',
      }),
      sharedAudit,
    ],
    reviewQueueItems: [
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
    propositionItems: [
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
    propositionDetail,
    dispatchTasks: [
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
    ],
    responseQueueItems: [
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
    responseDetails: {
      response_ops_1: {
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
      },
    },
    responseWorkflows: {
      response_ops_1: {
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
      response_ops_2: {
        responseId: 'response_ops_2',
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
    },
    rewardItems: [
      {
        ledgerId: 'ledger_1',
        propositionId: 'prop_list_1',
        propositionTitle: 'Ops proposition list item',
        responseId: 'response_ops_1',
        userId: 'respondent_1',
        sourceType: 'response',
        status: 'finalized',
        reviewStatus: 'valid',
        pendingAmount: '20',
        finalAmount: '20',
        ledgerVersion: 1,
        reasonCode: null,
        reversalOfLedgerId: null,
        createdAt: '2026-06-01T10:05:05.000Z',
        finalizedAt: '2026-06-01T10:06:00.000Z',
        voidedAt: null,
        reversedAt: null,
        payoutId: 'payout_1',
        payoutStatus: 'requested',
        payoutMethod: 'wallet_transfer',
        payoutAmount: '20',
        payoutAssetSymbol: 'USDC',
        payoutDestinationAddress: '0xRewardOpsDemo000000000000000000000000000001',
        payoutRequestedAt: '2026-06-01T10:06:00.000Z',
        payoutApprovedAt: null,
        payoutCompletedAt: null,
        payoutFailedAt: null,
        payoutCancelledAt: null,
        payoutExecutionTxHash: null,
        payoutRetryCount: 0,
        payoutLastErrorCode: null,
        payoutLastErrorMessage: null,
      },
      {
        ledgerId: 'ledger_2',
        propositionId: 'prop_list_1',
        propositionTitle: 'Ops proposition list item',
        responseId: 'response_ops_2',
        userId: 'respondent_2',
        sourceType: 'response',
        status: 'finalized',
        reviewStatus: 'valid',
        pendingAmount: '30',
        finalAmount: '30',
        ledgerVersion: 1,
        reasonCode: null,
        reversalOfLedgerId: null,
        createdAt: '2026-06-01T10:06:05.000Z',
        finalizedAt: '2026-06-01T10:07:00.000Z',
        voidedAt: null,
        reversedAt: null,
        payoutId: 'payout_2',
        payoutStatus: 'requested',
        payoutMethod: 'wallet_transfer',
        payoutAmount: '30',
        payoutAssetSymbol: 'USDC',
        payoutDestinationAddress: '0xRewardOpsDemo000000000000000000000000000002',
        payoutRequestedAt: '2026-06-01T10:07:00.000Z',
        payoutApprovedAt: null,
        payoutCompletedAt: null,
        payoutFailedAt: null,
        payoutCancelledAt: null,
        payoutExecutionTxHash: null,
        payoutRetryCount: 0,
        payoutLastErrorCode: null,
        payoutLastErrorMessage: null,
      },
    ],
    rewardDetails: {
      ledger_1: {
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
          status: 'valid',
          qualityScore: 0.8,
          flags: [],
          reasonCodes: [],
          reviewedByUserId: DEMO_OPERATOR_ID,
          reviewedAt: '2026-06-01T10:05:50.000Z',
        },
        payout: {
          payoutId: 'payout_1',
          status: 'requested',
          method: 'wallet_transfer',
          amount: '20',
          assetSymbol: 'USDC',
          destinationAddress: '0xRewardOpsDemo000000000000000000000000000001',
          requestedAt: '2026-06-01T10:06:00.000Z',
          approvedAt: null,
          approvedByUserId: null,
          executionStartedAt: null,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          executionTxHash: null,
          externalReference: null,
          retryCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        chain: [
          {
            ledgerId: 'ledger_1',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            responseId: 'response_ops_1',
            userId: 'respondent_1',
            sourceType: 'response',
            status: 'finalized',
            reviewStatus: 'valid',
            pendingAmount: '20',
            finalAmount: '20',
            ledgerVersion: 1,
            reasonCode: null,
            reversalOfLedgerId: null,
            createdAt: '2026-06-01T10:05:05.000Z',
            finalizedAt: '2026-06-01T10:06:00.000Z',
            voidedAt: null,
            reversedAt: null,
            payoutId: 'payout_1',
            payoutStatus: 'requested',
            payoutMethod: 'wallet_transfer',
            payoutAmount: '20',
            payoutAssetSymbol: 'USDC',
            payoutDestinationAddress: '0xRewardOpsDemo000000000000000000000000000001',
            payoutRequestedAt: '2026-06-01T10:06:00.000Z',
            payoutApprovedAt: null,
            payoutCompletedAt: null,
            payoutFailedAt: null,
            payoutCancelledAt: null,
            payoutExecutionTxHash: null,
            payoutRetryCount: 0,
            payoutLastErrorCode: null,
            payoutLastErrorMessage: null,
          },
        ],
        auditEvents: [
          createAuditEvent({
            id: 'reward_detail_1',
            entityType: 'reward',
            entityId: 'ledger_1',
            action: 'reward_resolution_triggered',
            actorUserId: DEMO_OPERATOR_ID,
            reason: 'Reward resolution was queued for follow-up.',
            note: null,
            metadata: { propositionId: 'prop_list_1', responseId: 'response_ops_1' },
          }),
        ],
      },
      ledger_2: {
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
        currentReview: {
          status: 'valid',
          qualityScore: 0.75,
          flags: [],
          reasonCodes: [],
          reviewedByUserId: DEMO_OPERATOR_ID,
          reviewedAt: '2026-06-01T10:06:50.000Z',
        },
        payout: {
          payoutId: 'payout_2',
          status: 'requested',
          method: 'wallet_transfer',
          amount: '30',
          assetSymbol: 'USDC',
          destinationAddress: '0xRewardOpsDemo000000000000000000000000000002',
          requestedAt: '2026-06-01T10:07:00.000Z',
          approvedAt: null,
          approvedByUserId: null,
          executionStartedAt: null,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          executionTxHash: null,
          externalReference: null,
          retryCount: 0,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        chain: [
          {
            ledgerId: 'ledger_2',
            propositionId: 'prop_list_1',
            propositionTitle: 'Ops proposition list item',
            responseId: 'response_ops_2',
            userId: 'respondent_2',
            sourceType: 'response',
            status: 'finalized',
            reviewStatus: 'valid',
            pendingAmount: '30',
            finalAmount: '30',
            ledgerVersion: 1,
            reasonCode: null,
            reversalOfLedgerId: null,
            createdAt: '2026-06-01T10:06:05.000Z',
            finalizedAt: '2026-06-01T10:07:00.000Z',
            voidedAt: null,
            reversedAt: null,
            payoutId: 'payout_2',
            payoutStatus: 'requested',
            payoutMethod: 'wallet_transfer',
            payoutAmount: '30',
            payoutAssetSymbol: 'USDC',
            payoutDestinationAddress: '0xRewardOpsDemo000000000000000000000000000002',
            payoutRequestedAt: '2026-06-01T10:07:00.000Z',
            payoutApprovedAt: null,
            payoutCompletedAt: null,
            payoutFailedAt: null,
            payoutCancelledAt: null,
            payoutExecutionTxHash: null,
            payoutRetryCount: 0,
            payoutLastErrorCode: null,
            payoutLastErrorMessage: null,
          },
        ],
        auditEvents: [
          createAuditEvent({
            id: 'reward_detail_2',
            entityType: 'reward',
            entityId: 'ledger_2',
            action: 'reward_payout_requested',
            actorUserId: DEMO_OPERATOR_ID,
            reason: 'Reward payout is awaiting operator approval.',
            note: null,
            metadata: { propositionId: 'prop_list_1', responseId: 'response_ops_2' },
          }),
        ],
      },
    },
    respondentReputation: {
      respondent_1: {
        userId: 'respondent_1',
        reputationScore: 94,
        reputationLevel: 'trusted',
        ruleVersion: 'quality-v1',
        metrics: {
          assignedTaskCount: 50,
          closedTaskCount: 48,
          submittedTaskCount: 46,
          completionRate: 0.96,
          validRate: 0.9,
          partialValidRate: 0.05,
          invalidRate: 0.03,
          anomalyRate: 0.02,
          fraudFlagCount: 0,
          reviewedResponseCount: 48,
          validCount: 43,
          partialValidCount: 2,
          invalidCount: 1,
          flaggedReviewCount: 1,
          anomalyCount: 1,
          fraudRate: 0,
        },
        computedAt: '2026-06-01T10:24:00.000Z',
      },
    },
    respondentTags: {
      respondent_1: {
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
      },
    },
    sampleShortage: [],
    anomalies: [],
    lifecycleDrift: [],
    validationReadiness,
    validationHealth,
    runtimeContract,
    queueOverview: {
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
            delayed: 0,
            completed: 12,
            failed: 0,
          },
          worker: {
            status: 'up',
            checkedAt: '2026-06-01T10:10:00.000Z',
            startedAt: '2026-06-01T09:59:00.000Z',
            lastSeenAt: '2026-06-01T10:10:00.000Z',
            lastJobProcessedAt: '2026-06-01T10:09:45.000Z',
            lastJobName: 'validation-chain-sync',
            lastWorkerErrorAt: null,
            lastWorkerErrorMessage: null,
          },
        },
      ],
    },
  }
}

let demoOpsState = createInitialState()

function prependAuditEvent(event: InternalAuditEventViewModel) {
  demoOpsState.auditEvents = [event, ...demoOpsState.auditEvents]
}

function slicePage<T>(items: T[], limit?: number, offset?: number) {
  const pageLimit = typeof limit === 'number' ? limit : 25
  const pageOffset = typeof offset === 'number' ? offset : 0
  return {
    items: items.slice(pageOffset, pageOffset + pageLimit),
    totalCount: items.length,
    limit: pageLimit,
    offset: pageOffset,
  }
}

function applySortDirection<T>(
  items: T[],
  direction: InternalListSortDirection | undefined,
  compare: (left: T, right: T) => number,
) {
  const sorted = [...items].sort(compare)
  return direction === 'asc' ? sorted : sorted.reverse()
}

function includesSearch(fields: Array<string | null | undefined>, search: string | undefined) {
  if (!search) {
    return true
  }
  const needle = search.trim().toLowerCase()
  return fields.some((value) => value?.toLowerCase().includes(needle))
}

function updateResponseWorkflow(
  responseId: string,
  updater: (current: ResponseReviewWorkflowViewModel) => ResponseReviewWorkflowViewModel,
) {
  const current = demoOpsState.responseWorkflows[responseId]
  if (!current) {
    throw new Error(`Demo response workflow ${responseId} unavailable`)
  }

  const next = updater(current)
  demoOpsState.responseWorkflows = {
    ...demoOpsState.responseWorkflows,
    [responseId]: next,
  }
  demoOpsState.responseQueueItems = demoOpsState.responseQueueItems.map((item) =>
    item.responseId === responseId
      ? {
        ...item,
        reviewStatus: next.reviewStatus,
        workflowState: next.workflowState,
        claimedByUserId: next.claimedByUserId,
        claimedAt: next.claimedAt,
        isClaimStale: next.isClaimStale,
      }
      : item,
  )

  if (demoOpsState.responseDetails[responseId]) {
    demoOpsState.responseDetails = {
      ...demoOpsState.responseDetails,
      [responseId]: {
        ...demoOpsState.responseDetails[responseId],
        workflow: next,
      },
    }
  }

  return next
}

function updateRewardDetail(
  ledgerId: string,
  updater: (current: InternalRewardAuditDetailViewModel) => InternalRewardAuditDetailViewModel,
) {
  const current = demoOpsState.rewardDetails[ledgerId]
  if (!current) {
    throw new Error(`Demo reward ${ledgerId} unavailable`)
  }

  const next = updater(current)
  demoOpsState.rewardDetails = {
    ...demoOpsState.rewardDetails,
    [ledgerId]: next,
  }
  demoOpsState.rewardItems = demoOpsState.rewardItems.map((item) =>
    item.ledgerId === ledgerId
      ? {
          ...item,
          status: next.chain[0]?.status ?? item.status,
          reviewStatus: next.chain[0]?.reviewStatus ?? item.reviewStatus,
          finalAmount: next.chain[0]?.finalAmount ?? item.finalAmount,
          finalizedAt: next.chain[0]?.finalizedAt ?? item.finalizedAt,
          voidedAt: next.chain[0]?.voidedAt ?? item.voidedAt,
          reversedAt: next.chain[0]?.reversedAt ?? item.reversedAt,
          payoutId: next.payout?.payoutId ?? null,
          payoutStatus: next.payout?.status ?? null,
          payoutMethod: next.payout?.method ?? null,
          payoutAmount: next.payout?.amount ?? null,
          payoutAssetSymbol: next.payout?.assetSymbol ?? null,
          payoutDestinationAddress: next.payout?.destinationAddress ?? null,
          payoutRequestedAt: next.payout?.requestedAt ?? null,
          payoutApprovedAt: next.payout?.approvedAt ?? null,
          payoutCompletedAt: next.payout?.completedAt ?? null,
          payoutFailedAt: next.payout?.failedAt ?? null,
          payoutCancelledAt: next.payout?.cancelledAt ?? null,
          payoutExecutionTxHash: next.payout?.executionTxHash ?? null,
          payoutRetryCount: next.payout?.retryCount ?? 0,
          payoutLastErrorCode: next.payout?.lastErrorCode ?? null,
          payoutLastErrorMessage: next.payout?.lastErrorMessage ?? null,
        }
      : item,
  )

  return next
}

function applyRewardPayoutSnapshot(
  detail: InternalRewardAuditDetailViewModel,
  payout: NonNullable<InternalRewardAuditDetailViewModel['payout']>,
): InternalRewardAuditDetailViewModel {
  return {
    ...detail,
    payout,
    chain: detail.chain.map((entry) =>
      entry.ledgerId === detail.ledgerId
        ? {
            ...entry,
            payoutId: payout.payoutId,
            payoutStatus: payout.status,
            payoutMethod: payout.method,
            payoutAmount: payout.amount,
            payoutAssetSymbol: payout.assetSymbol,
            payoutDestinationAddress: payout.destinationAddress,
            payoutRequestedAt: payout.requestedAt,
            payoutApprovedAt: payout.approvedAt,
            payoutCompletedAt: payout.completedAt,
            payoutFailedAt: payout.failedAt,
            payoutCancelledAt: payout.cancelledAt,
            payoutExecutionTxHash: payout.executionTxHash,
            payoutRetryCount: payout.retryCount,
            payoutLastErrorCode: payout.lastErrorCode,
            payoutLastErrorMessage: payout.lastErrorMessage,
          }
        : entry,
    ),
  }
}

function buildValidationCommandResult(
  overrides: Partial<ValidationChainCommandResultViewModel> = {},
): ValidationChainCommandResultViewModel {
  return {
    propositionId: demoOpsState.propositionDetail.proposition.id,
    marketId: demoOpsState.propositionDetail.market?.id,
    chainMarketId: demoOpsState.propositionDetail.market?.chainMarketId,
    chainPropositionId: demoOpsState.propositionDetail.market?.chainPropositionId,
    requestStatus: 'queued',
    attemptedAt: DEMO_NOW,
    txHash: null,
    ...overrides,
  }
}

function updatePropositionStatus(status: InternalPropositionDetailViewModel['proposition']['status']) {
  demoOpsState.propositionDetail = {
    ...demoOpsState.propositionDetail,
    proposition: {
      ...demoOpsState.propositionDetail.proposition,
      status,
    },
    validationLifecycle: {
      ...demoOpsState.propositionDetail.validationLifecycle,
      propositionStatus: status,
    },
    closureReadiness: {
      ...demoOpsState.propositionDetail.closureReadiness,
      propositionStatus: status,
    },
    revealSettlement: {
      ...demoOpsState.propositionDetail.revealSettlement,
      propositionStatus: status,
    },
  }
  demoOpsState.propositionItems = demoOpsState.propositionItems.map((item) =>
    item.propositionId === demoOpsState.propositionDetail.proposition.id
      ? { ...item, status }
      : item,
  )
}

function updateMarketStatus(
  status: NonNullable<InternalPropositionDetailViewModel['market']>['status'],
  chainStatus: NonNullable<InternalPropositionDetailViewModel['market']>['chainStatus'],
) {
  if (!demoOpsState.propositionDetail.market) {
    return
  }

  demoOpsState.propositionDetail = {
    ...demoOpsState.propositionDetail,
    market: {
      ...demoOpsState.propositionDetail.market,
      status,
      chainStatus,
    },
    validationLifecycle: {
      ...demoOpsState.propositionDetail.validationLifecycle,
      marketStatus: status,
      chainStatus,
      onChainState: chainStatus,
    },
    revealSettlement: {
      ...demoOpsState.propositionDetail.revealSettlement,
      marketStatus: status,
    },
  }
}

export const demoOpsBackend = {
  reset() {
    demoOpsState = createInitialState()
  },

  getOpsReviewQueue(filters?: OpsPropositionFilters): InternalPropositionListPageViewModel {
    const filtered = demoOpsState.reviewQueueItems
      .filter((item) => (filters?.category ? item.category === filters.category : true))
      .filter((item) => (filters?.marketEnabled === undefined ? true : item.marketEnabled === filters.marketEnabled))
      .filter((item) => includesSearch([item.propositionId, item.title], filters?.search))
    return clone(slicePage(filtered, filters?.limit, filters?.offset))
  },

  getOpsPropositions(filters?: OpsPropositionFilters): InternalPropositionListPageViewModel {
    let filtered = demoOpsState.propositionItems
      .filter((item) => (filters?.status ? item.status === filters.status : true))
      .filter((item) => (filters?.category ? item.category === filters.category : true))
      .filter((item) => (filters?.marketEnabled === undefined ? true : item.marketEnabled === filters.marketEnabled))
      .filter((item) => includesSearch([item.propositionId, item.title], filters?.search))

    filtered = applySortDirection(filtered, filters?.sortDirection, (left, right) =>
      String(left.createdAt).localeCompare(String(right.createdAt)),
    )
    return clone(slicePage(filtered, filters?.limit, filters?.offset))
  },

  getOpsProposition(propositionId: string): InternalPropositionDetailViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }
    return clone(demoOpsState.propositionDetail)
  },

  previewOpsDispatchCandidates(
    propositionId: string,
    body: {
      userIds: string[]
      assignedAt: string
      maxAssignments?: number
    },
  ): OpsDispatchPreviewViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }

    const selectedUserIds = Array.from(new Set(body.userIds))
    return clone({
      propositionId,
      propositionCategory: demoOpsState.propositionDetail.proposition.category,
      ruleVersion: 'dispatch-tags-v1',
      maxAssignments: body.maxAssignments ?? selectedUserIds.length,
      generalReserveCount: 1,
      selectedUserIds,
      candidates: [
        {
          userId: 'respondent_1',
          eligible: true,
          selected: selectedUserIds.includes('respondent_1'),
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
          selected: selectedUserIds.includes('respondent_2'),
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
    })
  },

  createOpsDispatchTasks(
    propositionId: string,
    body: {
      userIds: string[]
      assignedAt: string
      expiresAt: string
      maxAssignments?: number
    },
  ): OpsDispatchTaskViewModel[] {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }

    const createdTasks = body.userIds.map((userId, index) => ({
      id: `dispatch_task_${demoOpsState.dispatchTasks.length + index + 1}`,
      propositionId,
      userId,
      status: 'assigned',
      assignedAt: body.assignedAt,
      startedAt: null,
      submittedAt: null,
      expiresAt: body.expiresAt,
      skipReason: null,
      expiryReason: null,
      cooldownUntil: null,
      createdAt: body.assignedAt,
      updatedAt: body.assignedAt,
    }))

    demoOpsState.dispatchTasks = [...createdTasks, ...demoOpsState.dispatchTasks]
    demoOpsState.propositionDetail = {
      ...demoOpsState.propositionDetail,
      dispatchSummary: {
        ...demoOpsState.propositionDetail.dispatchSummary,
        totalTasks: demoOpsState.propositionDetail.dispatchSummary.totalTasks + createdTasks.length,
        assignedCount: demoOpsState.propositionDetail.dispatchSummary.assignedCount + createdTasks.length,
        lastAssignedAt: body.assignedAt,
        uniqueAssignedUsers: demoOpsState.propositionDetail.dispatchSummary.uniqueAssignedUsers + createdTasks.length,
      },
    }
    prependAuditEvent(createAuditEvent({
      entityType: 'proposition',
      entityId: propositionId,
      action: 'dispatch.created',
      actorUserId: DEMO_OPERATOR_ID,
      reason: 'Dispatch tasks were created from the demo operator workspace.',
      note: null,
      metadata: { propositionId, userIds: body.userIds, maxAssignments: body.maxAssignments ?? null },
    }))

    return clone(createdTasks)
  },

  getOpsPropositionRehearsalCheckpoints(propositionId: string): PropositionValidationRehearsalCheckpointViewModel[] {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }
    return clone(demoOpsState.propositionDetail.validationRehearsalCheckpoints)
  },

  recordOpsRehearsalCheckpoint(
    propositionId: string,
    body: {
      stepId: string
      reason: string
      status?: string
      note?: string
      evidence?: string[]
      txHash?: string
      blockNumber?: number
    },
  ): PropositionValidationRehearsalCheckpointViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }

    const checkpoint: PropositionValidationRehearsalCheckpointViewModel = {
      propositionId,
      environment: 'local',
      chainId: 31337,
      stepId: body.stepId as PropositionValidationRehearsalCheckpointViewModel['stepId'],
      status: (body.status ?? 'complete') as PropositionValidationRehearsalCheckpointViewModel['status'],
      reason: body.reason,
      note: body.note ?? null,
      evidence: body.evidence ?? [],
      txHash: body.txHash ?? null,
      blockNumber: body.blockNumber ?? null,
      recordedByUserId: DEMO_OPERATOR_ID,
      recordedAt: DEMO_NOW,
    }

    const audit = createAuditEvent({
      entityType: 'proposition',
      entityId: propositionId,
      action: 'validation_rehearsal_checkpoint',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {
        propositionId,
        txHash: checkpoint.txHash,
        blockNumber: checkpoint.blockNumber,
      },
    })

    const updatedSteps = demoOpsState.propositionDetail.validationRehearsal.steps.map((step) =>
      step.id === checkpoint.stepId
        ? {
          ...step,
          status: checkpoint.status,
          manualCheckpoint: checkpoint,
        }
        : step,
    )

    demoOpsState.propositionDetail = {
      ...demoOpsState.propositionDetail,
      validationRehearsalCheckpoints: [checkpoint, ...demoOpsState.propositionDetail.validationRehearsalCheckpoints],
      validationChainActivity: {
        ...demoOpsState.propositionDetail.validationChainActivity,
        timeline: [audit, ...demoOpsState.propositionDetail.validationChainActivity.timeline],
        commandAuditEvents: [audit, ...demoOpsState.propositionDetail.validationChainActivity.commandAuditEvents],
      },
      validationOperatorSummary: {
        ...demoOpsState.propositionDetail.validationOperatorSummary,
        latestRelevantAudit: audit,
      },
      validationRehearsal: {
        ...demoOpsState.propositionDetail.validationRehearsal,
        summary: {
          ...demoOpsState.propositionDetail.validationRehearsal.summary,
          latestCheckpointAt: checkpoint.recordedAt,
          latestCheckpointStepId: checkpoint.stepId,
          latestCheckpointStatus: checkpoint.status,
        },
        steps: updatedSteps,
      },
      auditEvents: [audit, ...demoOpsState.propositionDetail.auditEvents],
    }

    prependAuditEvent(audit)
    return clone(checkpoint)
  },

  getOpsRespondentReputation(userId: string): RespondentReputationInternalViewModel {
    const reputation = demoOpsState.respondentReputation[userId]
    if (!reputation) {
      throw new Error(`Demo respondent ${userId} unavailable`)
    }
    return clone(reputation)
  },

  getOpsRespondentTags(userId: string): RespondentTagInternalViewModel {
    const tags = demoOpsState.respondentTags[userId]
    if (!tags) {
      throw new Error(`Demo respondent ${userId} unavailable`)
    }
    return clone(tags)
  },

  getOpsAuditEvents(filters?: OpsAuditFilters): InternalAuditEventListPageViewModel {
    let filtered = demoOpsState.auditEvents
      .filter((item) => (filters?.entityType ? item.entityType === filters.entityType : true))
      .filter((item) => (filters?.entityId ? item.entityId === filters.entityId : true))
      .filter((item) => (filters?.actorUserId ? item.actorUserId === filters.actorUserId : true))
      .filter((item) => (filters?.action ? item.action === filters.action : true))
      .filter((item) => includesSearch([item.reason, item.note, item.action, item.entityId], filters?.search))

    filtered = applySortDirection(filtered, filters?.sortDirection, (left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )
    return clone(slicePage(filtered, filters?.limit, filters?.offset))
  },

  getOpsPropositionExport(propositionId: string): InternalPropositionDetailViewModel & { exportedAt: string } {
    return {
      ...this.getOpsProposition(propositionId),
      exportedAt: DEMO_NOW,
    }
  },

  getOpsPropositionEvidenceBundle(propositionId: string): InternalPropositionEvidenceBundleViewModel {
    return {
      propositionId,
      exportedAt: DEMO_NOW,
      propositionExport: this.getOpsPropositionExport(propositionId),
      runtimeContract: clone(demoOpsState.runtimeContract),
      validationChainHealth: clone(demoOpsState.validationHealth),
    }
  },

  getOpsSampleShortage(): SampleShortageMonitoringItemViewModel[] {
    return clone(demoOpsState.sampleShortage)
  },

  getOpsAnomalies(): QualityAnomalyMonitoringItemViewModel[] {
    return clone(demoOpsState.anomalies)
  },

  getOpsLifecycleDrift(): ValidationLifecycleDriftMonitoringItemViewModel[] {
    return clone(demoOpsState.lifecycleDrift)
  },

  getOpsValidationChainHealth(): ValidationChainMonitoringViewModel {
    return clone(demoOpsState.validationHealth)
  },

  getOpsValidationChainRuntimeReadiness(): ValidationChainRuntimeReadinessViewModel {
    return clone(demoOpsState.validationReadiness)
  },

  getOpsRuntimeContract(): BackendRuntimeContractViewModel {
    return clone(demoOpsState.runtimeContract)
  },

  getOpsQueueOverview(): QueueOverviewSnapshot {
    return clone(demoOpsState.queueOverview)
  },

  requeueFailedOpsQueue(queueName: string): QueueFailedJobRequeueResultSnapshot {
    const queue = demoOpsState.queueOverview.queues.find((item) => item.name === queueName)
    if (!queue) {
      throw new Error(`Demo queue ${queueName} unavailable`)
    }
    if (!queue.policy.retryable) {
      throw new Error(`Demo queue ${queueName} is not retryable`)
    }

    const failedCount = queue.counts?.failed ?? 0
    demoOpsState.queueOverview = {
      ...demoOpsState.queueOverview,
      queues: demoOpsState.queueOverview.queues.map((item) => {
        if (item.name !== queueName || !item.counts) {
          return item
        }

        return {
          ...item,
          counts: {
            ...item.counts,
            waiting: item.counts.waiting + failedCount,
            failed: 0,
          },
        }
      }),
    }
    prependAuditEvent(createAuditEvent({
      entityType: 'system_queue',
      entityId: queueName,
      action: 'system.queue.failed_requeued',
      actorUserId: DEMO_OPERATOR_ID,
      reason: `Requeued ${failedCount} failed job${failedCount === 1 ? '' : 's'} from ${queueName}.`,
      note: null,
      metadata: { queueName, failedCount, retriedCount: failedCount, skippedCount: 0 },
    }))

    return {
      queue: queueName,
      failedCount,
      retriedCount: failedCount,
      skippedCount: 0,
    }
  },

  approveOpsProposition(
    propositionId: string,
    body: { publishedAt: string; reason: string; note?: string },
  ): InternalPropositionDetailViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }
    demoOpsState.propositionDetail = {
      ...demoOpsState.propositionDetail,
      proposition: {
        ...demoOpsState.propositionDetail.proposition,
        publishedAt: body.publishedAt,
      },
      submission: {
        ...demoOpsState.propositionDetail.submission,
        status: 'approved',
        submissionReason: body.reason,
        submissionNote: body.note ?? null,
      },
    }
    prependAuditEvent(createAuditEvent({
      entityType: 'proposition',
      entityId: propositionId,
      action: 'proposition.approved',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId },
    }))
    return clone(demoOpsState.propositionDetail)
  },

  rejectOpsProposition(
    propositionId: string,
    body: { reason: string; rejectedAt?: string; note?: string },
  ): InternalPropositionDetailViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }
    demoOpsState.propositionDetail = {
      ...demoOpsState.propositionDetail,
      submission: {
        ...demoOpsState.propositionDetail.submission,
        status: 'rejected',
        submissionReason: body.reason,
        submissionNote: body.note ?? null,
      },
    }
    prependAuditEvent(createAuditEvent({
      entityType: 'proposition',
      entityId: propositionId,
      action: 'proposition.rejected',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId, rejectedAt: body.rejectedAt ?? null },
    }))
    return clone(demoOpsState.propositionDetail)
  },

  emergencyFreezeOpsProposition(
    propositionId: string,
    body: { frozenAt: string; reason: string; note?: string },
  ): InternalPropositionDetailViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }
    updatePropositionStatus('frozen')
    updateMarketStatus('frozen', 'frozen')
    demoOpsState.propositionDetail = {
      ...demoOpsState.propositionDetail,
      proposition: {
        ...demoOpsState.propositionDetail.proposition,
        frozenAt: body.frozenAt,
      },
    }
    prependAuditEvent(createAuditEvent({
      entityType: 'proposition',
      entityId: propositionId,
      action: 'proposition.emergency_freeze',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId, frozenAt: body.frozenAt },
    }))
    return clone(demoOpsState.propositionDetail)
  },

  getOpsResponseReviewState(responseId: string): ResponseReviewWorkflowViewModel {
    const workflow = demoOpsState.responseWorkflows[responseId]
    if (!workflow) {
      throw new Error(`Demo response ${responseId} unavailable`)
    }
    return clone(workflow)
  },

  getOpsResponseQueue(filters?: OpsResponseQueueFilters): InternalResponseReviewQueuePageViewModel {
    let filtered = demoOpsState.responseQueueItems
      .filter((item) => (filters?.workflowState ? item.workflowState === filters.workflowState : true))
      .filter((item) => (filters?.propositionId ? item.propositionId === filters.propositionId : true))
      .filter((item) => (filters?.claimStaleOnly ? item.isClaimStale : true))
      .filter((item) => (filters?.claimedByUserId ? item.claimedByUserId === filters.claimedByUserId : true))
      .filter((item) => (filters?.reviewStatus ? item.reviewStatus === filters.reviewStatus : true))
      .filter((item) => includesSearch([item.responseId, item.propositionTitle, item.userId], filters?.search))

    filtered = applySortDirection(filtered, filters?.sortDirection, (left, right) =>
      left.submittedAt.localeCompare(right.submittedAt),
    )
    return clone(slicePage(filtered, filters?.limit, filters?.offset))
  },

  getOpsResponseDetail(responseId: string): InternalResponseReviewDetailViewModel {
    const detail = demoOpsState.responseDetails[responseId]
    if (!detail) {
      throw new Error(`Demo response ${responseId} unavailable`)
    }
    return clone(detail)
  },

  claimOpsResponseReview(
    responseId: string,
    body: { claimedAt: string; note?: string },
  ): ResponseReviewWorkflowViewModel {
    const workflow = updateResponseWorkflow(responseId, (current) => ({
      ...current,
      workflowState: 'claimed',
      claimedByUserId: DEMO_OPERATOR_ID,
      claimedAt: body.claimedAt,
      releasedByUserId: null,
      releasedAt: null,
    }))
    prependAuditEvent(createAuditEvent({
      entityType: 'response_review',
      entityId: responseId,
      action: 'response_review.claimed',
      actorUserId: DEMO_OPERATOR_ID,
      reason: 'Response review was claimed in demo mode.',
      note: body.note ?? null,
      metadata: { responseId },
    }))
    return clone(workflow)
  },

  releaseOpsResponseReview(
    responseId: string,
    body: { releasedAt: string; note?: string },
  ): ResponseReviewWorkflowViewModel {
    const workflow = updateResponseWorkflow(responseId, (current) => ({
      ...current,
      workflowState: 'released',
      claimedByUserId: null,
      claimedAt: null,
      releasedByUserId: DEMO_OPERATOR_ID,
      releasedAt: body.releasedAt,
    }))
    prependAuditEvent(createAuditEvent({
      entityType: 'response_review',
      entityId: responseId,
      action: 'response_review.released',
      actorUserId: DEMO_OPERATOR_ID,
      reason: 'Response review was released in demo mode.',
      note: body.note ?? null,
      metadata: { responseId },
    }))
    return clone(workflow)
  },

  reviewOpsResponse(
    responseId: string,
    body: { reviewedAt: string },
  ): ResponseReviewWorkflowViewModel {
    const workflow = updateResponseWorkflow(responseId, (current) => ({
      ...current,
      reviewStatus: 'valid',
      workflowState: 'finalized',
      claimedByUserId: null,
      claimedAt: null,
      reviewedByUserId: DEMO_OPERATOR_ID,
      reviewedAt: body.reviewedAt,
      finalizedReviewStatus: 'valid',
    }))
    prependAuditEvent(createAuditEvent({
      entityType: 'response_review',
      entityId: responseId,
      action: 'response_review.finalized',
      actorUserId: DEMO_OPERATOR_ID,
      reason: 'Response review was finalized in demo mode.',
      note: null,
      metadata: { responseId, reviewStatus: 'valid' },
    }))
    return clone(workflow)
  },

  getOpsRewards(filters?: OpsRewardFilters): InternalRewardAuditListPageViewModel {
    let filtered = demoOpsState.rewardItems
      .filter((item) => (filters?.propositionId ? item.propositionId === filters.propositionId : true))
      .filter((item) => (filters?.userId ? item.userId === filters.userId : true))
      .filter((item) => (filters?.responseId ? item.responseId === filters.responseId : true))
      .filter((item) => (filters?.status ? item.status === filters.status : true))
      .filter((item) => (filters?.sourceType ? item.sourceType === filters.sourceType : true))
      .filter((item) =>
        includesSearch(
          [item.ledgerId, item.propositionTitle, item.userId, item.responseId, item.reasonCode],
          filters?.search,
        ))

    filtered = applySortDirection(filtered, filters?.sortDirection, (left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )
    return clone(slicePage(filtered, filters?.limit, filters?.offset))
  },

  getOpsRewardDetail(ledgerId: string): InternalRewardAuditDetailViewModel {
    const detail = demoOpsState.rewardDetails[ledgerId]
    if (!detail) {
      throw new Error(`Demo reward ${ledgerId} unavailable`)
    }
    return clone(detail)
  },

  retriggerOpsRewardResolution(
    ledgerId: string,
    body: { resolvedAt: string; reason: string; note?: string },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_resolution_retriggered',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { ledgerId, resolvedAt: body.resolvedAt },
    })

    const next = updateRewardDetail(ledgerId, (current) => ({
      ...current,
      auditEvents: [audit, ...current.auditEvents],
    }))
    prependAuditEvent(audit)
    return clone(next)
  },

  approveOpsRewardPayout(
    ledgerId: string,
    body: { approvedAt: string; reason: string; note?: string },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_payout_approved',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { ledgerId, approvedAt: body.approvedAt },
      createdAt: body.approvedAt,
    })

    const next = updateRewardDetail(ledgerId, (current) => {
      if (!current.payout) {
        throw new Error(`Demo reward payout ${ledgerId} unavailable`)
      }

      return {
        ...applyRewardPayoutSnapshot(current, {
          ...current.payout,
          status: 'approved',
          approvedAt: body.approvedAt,
          approvedByUserId: DEMO_OPERATOR_ID,
          lastErrorCode: null,
          lastErrorMessage: null,
        }),
        auditEvents: [audit, ...current.auditEvents],
      }
    })
    prependAuditEvent(audit)
    return clone(next)
  },

  startOpsRewardPayoutExecution(
    ledgerId: string,
    body: { startedAt: string; reason: string; note?: string },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_payout_execution_started',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { ledgerId, startedAt: body.startedAt },
      createdAt: body.startedAt,
    })

    const next = updateRewardDetail(ledgerId, (current) => {
      if (!current.payout) {
        throw new Error(`Demo reward payout ${ledgerId} unavailable`)
      }

      return {
        ...applyRewardPayoutSnapshot(current, {
          ...current.payout,
          status: 'executing',
          executionStartedAt: body.startedAt,
          executionTxHash:
            current.payout.executionTxHash ??
            '0x0000000000000000000000000000000000000000000000000000000000000001',
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          retryCount:
            current.payout.status === 'failed' || current.payout.failedAt
              ? current.payout.retryCount + 1
              : current.payout.retryCount,
        }),
        auditEvents: [audit, ...current.auditEvents],
      }
    })
    prependAuditEvent(audit)
    return clone(next)
  },

  completeOpsRewardPayout(
    ledgerId: string,
    body: {
      completedAt: string
      reason: string
      note?: string
      executionTxHash?: string
      externalReference?: string
    },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_payout_completed',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {
        ledgerId,
        completedAt: body.completedAt,
        executionTxHash: body.executionTxHash ?? null,
        externalReference: body.externalReference ?? null,
      },
      createdAt: body.completedAt,
    })

    const next = updateRewardDetail(ledgerId, (current) => {
      if (!current.payout) {
        throw new Error(`Demo reward payout ${ledgerId} unavailable`)
      }

      return {
        ...applyRewardPayoutSnapshot(current, {
          ...current.payout,
          status: 'completed',
          completedAt: body.completedAt,
          executionStartedAt: current.payout.executionStartedAt ?? body.completedAt,
          executionTxHash: body.executionTxHash ?? null,
          externalReference: body.externalReference ?? null,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        }),
        auditEvents: [audit, ...current.auditEvents],
      }
    })
    prependAuditEvent(audit)
    return clone(next)
  },

  confirmOpsRewardPayoutExecution(
    ledgerId: string,
    body: {
      confirmedAt: string
      reason: string
      note?: string
      externalReference?: string
    },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_payout_completed',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {
        ledgerId,
        completedAt: body.confirmedAt,
        externalReference: body.externalReference ?? null,
        confirmationMode: 'recorded_execution_tx_hash',
      },
      createdAt: body.confirmedAt,
    })

    const next = updateRewardDetail(ledgerId, (current) => {
      if (!current.payout) {
        throw new Error(`Demo reward payout ${ledgerId} unavailable`)
      }
      if (!current.payout.executionTxHash) {
        throw new Error(`Demo reward payout ${ledgerId} has no recorded execution transaction`)
      }

      return {
        ...applyRewardPayoutSnapshot(current, {
          ...current.payout,
          status: 'completed',
          completedAt: body.confirmedAt,
          executionStartedAt: current.payout.executionStartedAt ?? body.confirmedAt,
          externalReference: body.externalReference ?? null,
          failedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        }),
        auditEvents: [audit, ...current.auditEvents],
      }
    })
    prependAuditEvent(audit)
    return clone(next)
  },

  failOpsRewardPayout(
    ledgerId: string,
    body: {
      failedAt: string
      reason: string
      note?: string
      errorCode: string
      errorMessage: string
    },
  ): InternalRewardAuditDetailViewModel {
    const audit = createAuditEvent({
      entityType: 'reward',
      entityId: ledgerId,
      action: 'reward_payout_failed',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {
        ledgerId,
        failedAt: body.failedAt,
        errorCode: body.errorCode,
      },
      createdAt: body.failedAt,
    })

    const next = updateRewardDetail(ledgerId, (current) => {
      if (!current.payout) {
        throw new Error(`Demo reward payout ${ledgerId} unavailable`)
      }

      return {
        ...applyRewardPayoutSnapshot(current, {
          ...current.payout,
          status: 'failed',
          failedAt: body.failedAt,
          lastErrorCode: body.errorCode,
          lastErrorMessage: body.errorMessage,
        }),
        auditEvents: [audit, ...current.auditEvents],
      }
    })
    prependAuditEvent(audit)
    return clone(next)
  },

  runOpsValidationChainPropositionCommand(
    kind: OpsValidationChainPropositionCommand,
    propositionId: string,
    body: { reason: string; note?: string },
  ): ValidationChainCommandResultViewModel {
    if (demoOpsState.propositionDetail.proposition.id !== propositionId) {
      throw new Error(`Demo proposition ${propositionId} unavailable`)
    }

    if (kind === 'freeze-market') {
      updatePropositionStatus('frozen')
      updateMarketStatus('frozen', 'frozen')
    }
    if (kind === 'resolve-market') {
      updatePropositionStatus('settled')
      updateMarketStatus('settled', 'resolved')
    }
    if (kind === 'open-market') {
      updatePropositionStatus('live')
      updateMarketStatus('live', 'live')
    }

    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_command',
      entityId: propositionId,
      action: `validation_chain.${kind}`,
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId },
    }))
    return clone(buildValidationCommandResult())
  },

  cancelOpsValidationChainMarket(
    propositionId: string,
    body: { reason: string; reasonCode: string; note?: string },
  ): ValidationChainCommandResultViewModel {
    updateMarketStatus('cancelled', 'cancelled')
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_command',
      entityId: propositionId,
      action: 'validation_chain.cancel-market',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId, reasonCode: body.reasonCode },
    }))
    return clone(buildValidationCommandResult())
  },

  recoverOpsValidationChainCommand(
    propositionId: string,
    body: { reason: string; note?: string },
  ): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_command',
      entityId: propositionId,
      action: 'validation_chain.recover-command',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId },
    }))
    return clone(buildValidationCommandResult({ requestStatus: 'reused_pending' }))
  },

  syncOpsValidationChain(body: { reason: string; note?: string }): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_stream',
      entityId: 'arena.validation.local',
      action: 'validation_chain.sync',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId: demoOpsState.propositionDetail.proposition.id },
    }))
    return clone(buildValidationCommandResult())
  },

  reconcileOpsValidationChainBacklog(
    body: { reason: string; note?: string; limit?: number },
  ): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_stream',
      entityId: 'arena.validation.local',
      action: 'validation_chain.reconcile-backlog',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { limit: body.limit ?? null },
    }))
    return clone(buildValidationCommandResult())
  },

  replayOpsValidationChainProjection(
    marketId: string,
    body: { reason: string; note?: string },
  ): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_market',
      entityId: marketId,
      action: 'validation_chain.replay-projection',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId: demoOpsState.propositionDetail.proposition.id, marketId },
    }))
    return clone(buildValidationCommandResult({ marketId }))
  },

  reconcileOpsValidationChainBet(
    marketId: string,
    userId: string,
    body: { reason: string; note?: string },
  ): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_market',
      entityId: marketId,
      action: 'validation_chain.reconcile-bet',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: { propositionId: demoOpsState.propositionDetail.proposition.id, marketId, userId },
    }))
    return clone(buildValidationCommandResult({ marketId }))
  },

  pauseOpsValidationChain(body: { reason: string; note?: string }): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_stream',
      entityId: 'arena.validation.local',
      action: 'validation_chain.pause',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {},
    }))
    return clone(buildValidationCommandResult())
  },

  unpauseOpsValidationChain(body: { reason: string; note?: string }): ValidationChainCommandResultViewModel {
    prependAuditEvent(createAuditEvent({
      entityType: 'validation_chain_stream',
      entityId: 'arena.validation.local',
      action: 'validation_chain.unpause',
      actorUserId: DEMO_OPERATOR_ID,
      reason: body.reason,
      note: body.note ?? null,
      metadata: {},
    }))
    return clone(buildValidationCommandResult())
  },
}
