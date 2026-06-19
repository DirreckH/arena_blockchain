import { useCallback, useEffect, useRef, useState } from 'react'
import {
  hasAnySystemRole,
  type QueueOverviewSnapshot,
  type RespondentReputationInternalViewModel,
  type RespondentTagInternalViewModel,
  SystemRole,
} from '@arena/shared'
import { useAuthSession } from '../auth/auth-session'
import { ArenaApiError, arenaApi } from '../api/arena-api'
import type {
  InternalDiscoveryCategoryConfigSummaryViewModel,
  InternalDiscoveryCategoryConfigViewModel,
  InternalDiscoveryGlobalConfigViewModel,
  InternalAuditEventListPageViewModel,
  InternalPropositionListPageViewModel,
  InternalPropositionDetailViewModel,
  InternalResponseReviewDetailViewModel,
  InternalResponseReviewQueuePageViewModel,
  InternalRewardAuditDetailViewModel,
  InternalRewardAuditListPageViewModel,
  OpsAuditFilters,
  OpsPropositionFilters,
  OpsResponseQueueFilters,
  OpsRewardFilters,
  SampleShortageMonitoringItemViewModel,
  QualityAnomalyMonitoringItemViewModel,
  ValidationLifecycleDriftMonitoringItemViewModel,
  ValidationChainMonitoringViewModel,
  ValidationChainRuntimeReadinessViewModel,
  BackendRuntimeContractViewModel,
  ResponseReviewWorkflowViewModel,
} from './internal-ops.types'

const DEFAULT_OPS_POLL_INTERVAL_MS = 30_000

export type OpsAccessState =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'granted'; token: string }

export function useOpsAccess(): OpsAccessState {
  const { isAuthenticated, identity, token } = useAuthSession()
  if (!isAuthenticated || !token) return { kind: 'unauthenticated' }
  if (!identity || !hasAnySystemRole(identity.roles, [SystemRole.Operator, SystemRole.Admin, SystemRole.System])) {
    return { kind: 'forbidden' }
  }
  return { kind: 'granted', token }
}

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | {
    status: 'error'
    message: string
    kind: 'not_found' | 'unauthorized' | 'forbidden' | 'network' | 'unknown'
    statusCode: number | null
  }

function classifyLoadError(error: unknown): Extract<LoadState<never>, { status: 'error' }> {
  if (error instanceof ArenaApiError) {
    const kind = error.status === 404
      ? 'not_found'
      : error.status === 401
        ? 'unauthorized'
        : error.status === 403
          ? 'forbidden'
          : 'unknown'

    return {
      status: 'error',
      message: error.message,
      kind,
      statusCode: error.status,
    }
  }

  if (error instanceof TypeError) {
    return {
      status: 'error',
      message: error.message,
      kind: 'network',
      statusCode: null,
    }
  }

  return {
    status: 'error',
    message: String((error as { message?: unknown } | null | undefined)?.message ?? error),
    kind: 'unknown',
    statusCode: null,
  }
}

function useOpsQuery<T>(
  token: string | null,
  fetcher: (token: string) => Promise<T>,
  options?: {
    pollIntervalMs?: number
  },
): { state: LoadState<T>; refresh: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'idle' })
  const activeRef = useRef(0)

  const run = useCallback((silent = false) => {
    if (!token) return
    const id = ++activeRef.current
    setState((current) => (silent && current.status === 'ok' ? current : { status: 'loading' }))
    fetcher(token)
      .then((data) => { if (activeRef.current === id) setState({ status: 'ok', data }) })
      .catch((err) => { if (activeRef.current === id) setState(classifyLoadError(err)) })
  }, [token, fetcher])

  useEffect(() => { run() }, [run])
  useEffect(() => {
    if (!token || !options?.pollIntervalMs) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      run(true)
    }, options.pollIntervalMs)

    return () => window.clearInterval(intervalId)
  }, [options?.pollIntervalMs, run, token])

  return { state, refresh: () => run() }
}

export function useOpsReviewQueue(
  token: string | null,
  filters?: OpsPropositionFilters,
) {
  const category = filters?.category
  const marketEnabled = filters?.marketEnabled
  const search = filters?.search
  const sortBy = filters?.sortBy
  const sortDirection = filters?.sortDirection
  const limit = filters?.limit
  const offset = filters?.offset
  const fetcher = useCallback(
    (t: string) => arenaApi.getOpsReviewQueue(t, {
      category,
      marketEnabled,
      search,
      sortBy,
      sortDirection,
      limit,
      offset,
    }),
    [category, limit, marketEnabled, offset, search, sortBy, sortDirection],
  )
  return useOpsQuery<InternalPropositionListPageViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsPropositions(
  token: string | null,
  filters?: OpsPropositionFilters,
) {
  const status = filters?.status
  const category = filters?.category
  const marketEnabled = filters?.marketEnabled
  const search = filters?.search
  const sortBy = filters?.sortBy
  const sortDirection = filters?.sortDirection
  const limit = filters?.limit
  const offset = filters?.offset
  const fetcher = useCallback(
    (t: string) => arenaApi.getOpsPropositions(t, {
      status,
      category,
      marketEnabled,
      search,
      sortBy,
      sortDirection,
      limit,
      offset,
    }),
    [category, limit, marketEnabled, offset, search, sortBy, sortDirection, status],
  )
  return useOpsQuery<InternalPropositionListPageViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsAnomalies(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsAnomalies(t), [])
  return useOpsQuery<QualityAnomalyMonitoringItemViewModel[]>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsSampleShortage(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsSampleShortage(t), [])
  return useOpsQuery<SampleShortageMonitoringItemViewModel[]>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsLifecycleDrift(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsLifecycleDrift(t), [])
  return useOpsQuery<ValidationLifecycleDriftMonitoringItemViewModel[]>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsValidationChainHealth(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsValidationChainHealth(t), [])
  return useOpsQuery<ValidationChainMonitoringViewModel | null>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsValidationChainReadiness(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsValidationChainRuntimeReadiness(t), [])
  return useOpsQuery<ValidationChainRuntimeReadinessViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsRuntimeContract(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsRuntimeContract(t), [])
  return useOpsQuery<BackendRuntimeContractViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsQueueOverview(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsQueueOverview(t), [])
  return useOpsQuery<QueueOverviewSnapshot>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsDiscoveryGlobalConfig(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsDiscoveryGlobalConfig(t), [])
  return useOpsQuery<InternalDiscoveryGlobalConfigViewModel>(token, fetcher)
}

export function useOpsDiscoveryCategoryConfigs(token: string | null) {
  const fetcher = useCallback((t: string) => arenaApi.getOpsDiscoveryCategoryConfigs(t), [])
  return useOpsQuery<InternalDiscoveryCategoryConfigSummaryViewModel[]>(token, fetcher)
}

export function useOpsDiscoveryCategoryConfig(token: string | null, slug: string | null) {
  const fetcher = useCallback(
    (t: string) => slug
      ? arenaApi.getOpsDiscoveryCategoryConfig(slug, t)
      : Promise.reject(new Error('no slug')),
    [slug],
  )
  return useOpsQuery<InternalDiscoveryCategoryConfigViewModel>(slug ? token : null, fetcher)
}

export function useOpsResponseReviewState(token: string | null, responseId: string | null) {
  const fetcher = useCallback(
    (t: string) => responseId
      ? arenaApi.getOpsResponseReviewState(responseId, t)
      : Promise.reject(new Error('no id')),
    [responseId],
  )
  return useOpsQuery<ResponseReviewWorkflowViewModel>(responseId ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsResponseQueue(token: string | null, filters?: OpsResponseQueueFilters) {
  const workflowState = filters?.workflowState
  const propositionId = filters?.propositionId
  const claimStaleOnly = filters?.claimStaleOnly
  const claimedByUserId = filters?.claimedByUserId
  const reviewStatus = filters?.reviewStatus
  const limit = filters?.limit
  const fetcher = useCallback(
    (t: string) => arenaApi.getOpsResponseQueue(t, {
      workflowState,
      propositionId,
      claimStaleOnly,
      claimedByUserId,
      reviewStatus,
      limit,
      search: filters?.search,
      sortBy: filters?.sortBy,
      sortDirection: filters?.sortDirection,
      offset: filters?.offset,
    }),
    [
      claimStaleOnly,
      claimedByUserId,
      filters?.offset,
      filters?.search,
      filters?.sortBy,
      filters?.sortDirection,
      limit,
      propositionId,
      reviewStatus,
      workflowState,
    ],
  )
  return useOpsQuery<InternalResponseReviewQueuePageViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsResponseDetail(token: string | null, responseId: string | null) {
  const fetcher = useCallback(
    (t: string) => responseId
      ? arenaApi.getOpsResponseDetail(responseId, t)
      : Promise.reject(new Error('no id')),
    [responseId],
  )
  return useOpsQuery<InternalResponseReviewDetailViewModel>(responseId ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsProposition(token: string | null, id: string | null) {
  const fetcher = useCallback(
    (t: string) => id
      ? arenaApi.getOpsProposition(id, t)
      : Promise.reject(new Error('no id')),
    [id],
  )
  return useOpsQuery<InternalPropositionDetailViewModel>(id ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsRespondentReputation(token: string | null, userId: string | null) {
  const fetcher = useCallback(
    (t: string) => userId
      ? arenaApi.getOpsRespondentReputation(userId, t)
      : Promise.reject(new Error('no id')),
    [userId],
  )
  return useOpsQuery<RespondentReputationInternalViewModel>(userId ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsRespondentTags(token: string | null, userId: string | null) {
  const fetcher = useCallback(
    (t: string) => userId
      ? arenaApi.getOpsRespondentTags(userId, t)
      : Promise.reject(new Error('no id')),
    [userId],
  )
  return useOpsQuery<RespondentTagInternalViewModel>(userId ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsAuditEvents(token: string | null, filters?: OpsAuditFilters) {
  const entityType = filters?.entityType
  const entityId = filters?.entityId
  const actorUserId = filters?.actorUserId
  const action = filters?.action
  const search = filters?.search
  const sortDirection = filters?.sortDirection
  const limit = filters?.limit
  const offset = filters?.offset
  const fetcher = useCallback(
    (t: string) => arenaApi.getOpsAuditEvents(t, {
      entityType,
      entityId,
      actorUserId,
      action,
      search,
      sortDirection,
      limit,
      offset,
    }),
    [action, actorUserId, entityId, entityType, limit, offset, search, sortDirection],
  )
  return useOpsQuery<InternalAuditEventListPageViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsRewards(token: string | null, filters?: OpsRewardFilters) {
  const propositionId = filters?.propositionId
  const userId = filters?.userId
  const responseId = filters?.responseId
  const status = filters?.status
  const sourceType = filters?.sourceType
  const fetcher = useCallback(
    (t: string) => arenaApi.getOpsRewards(t, {
      propositionId,
      userId,
      responseId,
      status,
      sourceType,
      search: filters?.search,
      sortBy: filters?.sortBy,
      sortDirection: filters?.sortDirection,
      limit: filters?.limit,
      offset: filters?.offset,
    }),
    [
      filters?.limit,
      filters?.offset,
      filters?.search,
      filters?.sortBy,
      filters?.sortDirection,
      propositionId,
      responseId,
      sourceType,
      status,
      userId,
    ],
  )
  return useOpsQuery<InternalRewardAuditListPageViewModel>(token, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}

export function useOpsRewardDetail(token: string | null, ledgerId: string | null) {
  const fetcher = useCallback(
    (t: string) => ledgerId
      ? arenaApi.getOpsRewardDetail(ledgerId, t)
      : Promise.reject(new Error('no id')),
    [ledgerId],
  )
  return useOpsQuery<InternalRewardAuditDetailViewModel>(ledgerId ? token : null, fetcher, { pollIntervalMs: DEFAULT_OPS_POLL_INTERVAL_MS })
}
