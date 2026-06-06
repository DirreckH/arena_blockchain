import type {
  AdjudicationTaskViewModel,
  ArenaDiscussionThreadViewModel,
  AuthChallengeResponse,
  CreateRequesterComparisonSetDeliveryPolicyInputViewModel,
  DeleteOwnedComparisonSetExportResultViewModel,
  DeleteRequesterComparisonSetDeliveryPolicyResultViewModel,
  JwtIdentity,
  RequesterDeliveryCredentialDirectoryViewModel,
  CreateArenaDiscussionCommentInput,
  PrepareValidationBetResult,
  PlaceValidationBetResult,
  PropositionCategory,
  PropositionStatus,
  RequesterComparisonSetDeliveryPolicyHealthViewModel,
  RequesterComparisonSetDeliveryPolicyListViewModel,
  RequesterComparisonSetDeliveryRunListViewModel,
  RequesterComparisonSetDeliveryRunRetryResultViewModel,
  RequesterComparisonSetDeliveryPolicyRunResultViewModel,
  RequesterComparisonSetListViewModel,
  RequesterPropositionBudgetLedgerViewModel,
  RequesterOwnedComparisonSetExportArtifactViewModel,
  RequesterOwnedComparisonSetExportListViewModel,
  RequesterOwnedPropositionAnalyticsComparisonViewModel,
  RequesterPropositionSubmissionStatus,
  RequesterReportPresetListViewModel,
  RequesterOwnedPropositionDetailViewModel,
  RequesterOwnedPropositionExportArtifactViewModel,
  RequesterOwnedPropositionExportListViewModel,
  RequesterOwnedPropositionOverviewViewModel,
  RequesterOwnedPropositionRecentItemViewModel,
  RequesterOwnedSettledPropositionReportViewModel,
  UpdateRequesterComparisonSetDeliveryPolicyInputViewModel,
  PublicCategoryDirectoryIndexViewModel,
  PublicCategoryDirectoryViewModel,
  PublicClosingSoonViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicIntegrityOverviewViewModel,
  PublicLatestTopicsViewModel,
  PublicRespondentLeaderboardViewModel,
  PublicSettledResultsViewModel,
  PublicProgressSnapshot,
  QueueFailedJobRequeueResultSnapshot,
  QueueOverviewSnapshot,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentReputationInternalViewModel,
  RespondentReputationSummaryViewModel,
  RespondentResultOverviewViewModel,
  RespondentResultListViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagInternalViewModel,
  RespondentTagSummaryViewModel,
  RespondentWatchlistViewModel,
  SubmitAdjudicationResponseResult,
  UpdateRespondentAccountPreferencesInput,
  UpdateRespondentWatchlistResultViewModel,
  ValidationMarketViewModel,
} from '@arena/shared'
import { demoBackend } from '../demo/demo-backend'
import { DEMO_SESSION_TOKEN, isDemoToken, isDemoWalletAddress } from '../demo/demo-auth'
import { demoOpsBackend } from '../demo/demo-ops-backend'
import { toPublicValidationMarket } from '../validation/validation-market-adapter'
import type { PublicValidationMarketCard } from '../validation/validation-market.types'
import type {
  BackendRuntimeContractViewModel,
  InternalAuditEventListPageViewModel,
  InternalPropositionListPageViewModel,
  InternalResponseReviewQueuePageViewModel,
  InternalRewardAuditListPageViewModel,
  OpsAuditFilters,
  OpsDispatchPreviewViewModel,
  OpsDispatchTaskViewModel,
  InternalPropositionDetailViewModel,
  InternalPropositionEvidenceBundleViewModel,
  InternalResponseReviewDetailViewModel,
  InternalRewardAuditDetailViewModel,
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

export type ArenaApiErrorPayload = {
  statusCode?: number
  errorCode?: string
  message?: string
}

export type ArenaApiSourceMode = 'live' | 'demo' | 'mixed'

export type ArenaApiFeedResult<T> = {
  data: T
  sourceMode: ArenaApiSourceMode
}

export type PublicMarketSearchResult = {
  items: PublicValidationMarketCard[]
}

export class ArenaApiError extends Error {
  status: number
  payload: ArenaApiErrorPayload | null

  constructor(status: number, message: string, payload: ArenaApiErrorPayload | null = null) {
    super(message)
    this.name = 'ArenaApiError'
    this.status = status
    this.payload = payload
  }
}

function normalizeValidationBetError(error: unknown): never {
  if (!(error instanceof ArenaApiError)) {
    throw error
  }

  switch (error.payload?.errorCode) {
    case 'bet.duplicate_position':
      throw new Error('You already have a recorded position for this market')
    case 'bet.below_minimum':
      throw new Error('The submitted amount is below the market minimum')
    case 'bet.market_not_live':
      throw new Error('This market is not accepting new positions right now')
    case 'bet.market_mismatch':
      throw new Error('The selected market no longer matches this proposition')
    case 'bet.chain_market_not_ready':
      throw new Error('This market is not ready for live on-chain betting yet')
    case 'bet.transaction_not_confirmed':
      throw new Error('The submitted transaction is not confirmed on chain yet')
    case 'bet.transaction_mismatch':
      throw new Error('The submitted transaction did not match this market position')
    case 'bet.chain_id_mismatch':
      throw new Error('Switch your wallet to the configured Arena network and retry')
    default:
      throw error
  }
}

export type AuthVerifyResponse = {
  accessToken: string
  identity: JwtIdentity
}

export type PropositionDraftRecord = {
  propositionId: string
  title: string
  summary: string
  optionA: string
  optionB: string
  category: PropositionCategory
  sampleConstraints: string[]
  minEffectiveSample: number
  minBetAmount: string
  minDurationSeconds: number
  maxDurationSeconds: number
  rewardBudget: string
  baseResponseReward: string
  marketEnabled: boolean
  status: PropositionStatus
  submissionStatus: RequesterPropositionSubmissionStatus
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}

export type RequesterOwnedPropositionRecentRecord = RequesterOwnedPropositionRecentItemViewModel
export type RequesterOwnedPropositionOverviewRecord = RequesterOwnedPropositionOverviewViewModel
export type RequesterOwnedPropositionDetailRecord = RequesterOwnedPropositionDetailViewModel
export type RequesterPropositionBudgetLedgerRecord = RequesterPropositionBudgetLedgerViewModel
export type RequesterOwnedSettledPropositionReportRecord = RequesterOwnedSettledPropositionReportViewModel
export type RequesterOwnedPropositionExportRecord = RequesterOwnedPropositionExportArtifactViewModel
export type RequesterOwnedPropositionExportListRecord = RequesterOwnedPropositionExportListViewModel
export type RequesterReportPresetListRecord = RequesterReportPresetListViewModel
export type RequesterComparisonSetListRecord = RequesterComparisonSetListViewModel
export type RequesterComparisonSetAnalyticsRecord = RequesterOwnedPropositionAnalyticsComparisonViewModel
export type RequesterComparisonSetExportRecord = RequesterOwnedComparisonSetExportArtifactViewModel
export type RequesterComparisonSetExportListRecord = RequesterOwnedComparisonSetExportListViewModel
export type RequesterComparisonSetDeliveryPolicyListRecord = RequesterComparisonSetDeliveryPolicyListViewModel
export type RequesterComparisonSetDeliveryPolicyHealthRecord = RequesterComparisonSetDeliveryPolicyHealthViewModel
export type RequesterComparisonSetDeliveryPolicyRunRecord = RequesterComparisonSetDeliveryPolicyRunResultViewModel
export type RequesterComparisonSetDeliveryRunListRecord = RequesterComparisonSetDeliveryRunListViewModel
export type RequesterComparisonSetDeliveryRunRetryRecord = RequesterComparisonSetDeliveryRunRetryResultViewModel
export type RequesterDeliveryCredentialDirectoryRecord = RequesterDeliveryCredentialDirectoryViewModel
export type CreateRequesterComparisonSetDeliveryPolicyInputRecord = CreateRequesterComparisonSetDeliveryPolicyInputViewModel
export type UpdateRequesterComparisonSetDeliveryPolicyInputRecord = UpdateRequesterComparisonSetDeliveryPolicyInputViewModel
export type DeleteRequesterComparisonSetDeliveryPolicyResultRecord = DeleteRequesterComparisonSetDeliveryPolicyResultViewModel
export type DeleteRequesterComparisonSetExportResultRecord = DeleteOwnedComparisonSetExportResultViewModel
export type RequesterComparisonSetExportOriginFilterRecord =
  | 'manual'
  | 'delivery_policy_manual'
  | 'delivery_policy_automation'
export type RequesterComparisonSetDeliveryRunStatusFilterRecord = 'completed' | 'failed'
export type RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord =
  | 'manual'
  | 'automation'
export type RequesterComparisonSetDeliveryRunReplayFilterRecord =
  | 'all'
  | 'fresh_only'
  | 'replayed_only'

export type ArchiveDraftResult = {
  propositionId: string
  archivedAt: string
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4000'

function resolveApiBaseUrl() {
  const configured =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined

  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.replace(/\/+$/, '')
  }

  return DEFAULT_API_BASE_URL
}

const API_BASE_URL = resolveApiBaseUrl()

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
  })

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const payload = await safeReadJson(response)
    throw new ArenaApiError(
      response.status,
      payload?.message ?? `Request failed with status ${response.status}`,
      payload,
    )
  }

  return response.json() as Promise<T>
}

async function safeReadJson(response: Response): Promise<ArenaApiErrorPayload | null> {
  const contentType = response.headers.get('content-type')

  if (!contentType?.includes('application/json')) {
    return null
  }

  try {
    return (await response.json()) as ArenaApiErrorPayload
  } catch {
    return null
  }
}

async function requestWithDemoFallback<T>(request: () => Promise<T>, demoFallback: () => T | Promise<T>): Promise<ArenaApiFeedResult<T>> {
  try {
    const data = await request()
    return {
      data,
      sourceMode: 'live',
    }
  } catch {
    return {
      data: await demoFallback(),
      sourceMode: 'mixed',
    }
  }
}

function maybeUseDemoToken(token?: string | null) {
  return isDemoToken(token) ? DEMO_SESSION_TOKEN : null
}

function withDemoOperatorToken<T>(
  token: string,
  demoLoader: () => T | Promise<T>,
  liveLoader: () => Promise<T>,
) {
  return maybeUseDemoToken(token)
    ? Promise.resolve(demoLoader())
    : liveLoader()
}

export const arenaApi = {
  baseUrl: API_BASE_URL,
  requestJson,
  getPublicMarkets() {
    return requestJson<ValidationMarketViewModel[]>('/arena/public/markets')
      .catch(() => demoBackend.getValidationMarkets())
  },
  getPublicMarketsFeed() {
    return requestWithDemoFallback(
      () => requestJson<ValidationMarketViewModel[]>('/arena/public/markets'),
      () => demoBackend.getValidationMarkets(),
    )
  },
  getPublicMarket(marketId: string) {
    return requestJson<ValidationMarketViewModel>(`/arena/public/markets/${marketId}`)
      .catch(() => demoBackend.getValidationMarket(marketId))
  },
  searchPublicMarkets(query: string) {
    return requestJson<ValidationMarketViewModel[]>(
      `/arena/public/markets/search?q=${encodeURIComponent(query)}`,
    )
      .then((markets) => ({
        items: markets.map(toPublicValidationMarket),
      }))
      .catch(() => ({
        items: demoBackend.searchValidationMarkets(query).map(toPublicValidationMarket),
      }))
  },
  searchPublicMarketsFeed(query: string) {
    return requestWithDemoFallback(
      () =>
        requestJson<ValidationMarketViewModel[]>(
          `/arena/public/markets/search?q=${encodeURIComponent(query)}`,
        ).then((markets) => ({
          items: markets.map(toPublicValidationMarket),
        })),
      () => ({
        items: demoBackend.searchValidationMarkets(query).map(toPublicValidationMarket),
      }),
    )
  },
  getPublicProgress(propositionId: string) {
    return requestJson<PublicProgressSnapshot>(`/arena/public/propositions/${propositionId}/progress`)
      .catch(() => {
        const market = demoBackend.getValidationMarkets().find((entry) => entry.propositionId === propositionId)
        if (!market) {
          throw new Error('Public progress unavailable')
        }

        return market.publicProgress
      })
  },
  getDiscoveryHome() {
    return requestJson<PublicDiscoverPageViewModel>('/arena/public/discovery/home')
      .catch(() => demoBackend.getDiscoveryHome())
  },
  getDiscoveryHomeFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicDiscoverPageViewModel>('/arena/public/discovery/home'),
      () => demoBackend.getDiscoveryHome(),
    )
  },
  getDiscoveryRanking(kind: 'hot' | 'breaking') {
    return requestJson<PublicDiscoveryRankingViewModel>(`/arena/public/discovery/rankings/${kind}`)
      .catch(() => demoBackend.getDiscoveryRanking(kind))
  },
  getDiscoveryRankingFeed(kind: 'hot' | 'breaking') {
    return requestWithDemoFallback(
      () => requestJson<PublicDiscoveryRankingViewModel>(`/arena/public/discovery/rankings/${kind}`),
      () => demoBackend.getDiscoveryRanking(kind),
    )
  },
  getLatestTopics() {
    return requestJson<PublicLatestTopicsViewModel>('/arena/public/discovery/latest-topics')
      .catch(() => demoBackend.getLatestTopics())
  },
  getLatestTopicsFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicLatestTopicsViewModel>('/arena/public/discovery/latest-topics'),
      () => demoBackend.getLatestTopics(),
    )
  },
  getDiscoveryClosingSoon() {
    return requestJson<PublicClosingSoonViewModel>('/arena/public/discovery/closing-soon')
      .catch(() => demoBackend.getDiscoveryClosingSoon())
  },
  getDiscoveryClosingSoonFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicClosingSoonViewModel>('/arena/public/discovery/closing-soon'),
      () => demoBackend.getDiscoveryClosingSoon(),
    )
  },
  getPublicRespondentLeaderboard() {
    return requestJson<PublicRespondentLeaderboardViewModel>('/arena/public/discovery/respondent-leaderboard')
      .catch(() => demoBackend.getPublicRespondentLeaderboard())
  },
  getPublicRespondentLeaderboardFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicRespondentLeaderboardViewModel>('/arena/public/discovery/respondent-leaderboard'),
      () => demoBackend.getPublicRespondentLeaderboard(),
    )
  },
  getCategoryDirectoryIndex() {
    return requestJson<PublicCategoryDirectoryIndexViewModel>('/arena/public/discovery/categories')
      .catch(() => demoBackend.getCategoryDirectoryIndex())
  },
  getCategoryDirectoryIndexFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicCategoryDirectoryIndexViewModel>('/arena/public/discovery/categories'),
      () => demoBackend.getCategoryDirectoryIndex(),
    )
  },
  getCategoryDirectory(slug: string) {
    return requestJson<PublicCategoryDirectoryViewModel | null>(`/arena/public/discovery/categories/${slug}`)
      .catch(() => demoBackend.getCategoryDirectory(slug))
  },
  getCategoryDirectoryFeed(slug: string) {
    return requestWithDemoFallback(
      () => requestJson<PublicCategoryDirectoryViewModel | null>(`/arena/public/discovery/categories/${slug}`),
      () => demoBackend.getCategoryDirectory(slug),
    )
  },
  getPublicSettledResults() {
    return requestJson<PublicSettledResultsViewModel>('/arena/public/results/settled')
      .catch(() => demoBackend.getPublicSettledResults())
  },
  getPublicSettledResultsFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicSettledResultsViewModel>('/arena/public/results/settled'),
      () => demoBackend.getPublicSettledResults(),
    )
  },
  getPublicIntegrityOverview() {
    return requestJson<PublicIntegrityOverviewViewModel>('/arena/public/integrity/overview')
      .catch(() => demoBackend.getPublicIntegrityOverview())
  },
  getPublicIntegrityOverviewFeed() {
    return requestWithDemoFallback(
      () => requestJson<PublicIntegrityOverviewViewModel>('/arena/public/integrity/overview'),
      () => demoBackend.getPublicIntegrityOverview(),
    )
  },
  getValidationMarkets(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getValidationMarkets(token))
    }
    return requestJson<ValidationMarketViewModel[]>('/arena/validation/markets', { token })
  },
  getValidationMarket(marketId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getValidationMarket(marketId))
    }
    return requestJson<ValidationMarketViewModel>(`/arena/validation/markets/${marketId}`, { token })
  },
  getMarketDiscussionThread(marketId: string, token?: string) {
    if (token && maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getMarketDiscussionThread(marketId))
    }
    return requestJson<ArenaDiscussionThreadViewModel>(`/arena/discussion/markets/${marketId}`, token ? { token } : {})
  },
  createMarketDiscussionComment(
    marketId: string,
    body: Omit<CreateArenaDiscussionCommentInput, 'marketId' | 'userId' | 'createdAt'> & {
      createdAt: string
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.createMarketDiscussionComment(marketId, body))
    }
    return requestJson<ArenaDiscussionThreadViewModel>(`/arena/discussion/markets/${marketId}/comments`, {
      method: 'POST',
      body,
      token,
    })
  },
  placeValidationBet(
    marketId: string,
    body: {
      propositionId: string
      chainId: number
      selectedOption: 0 | 1
      stakeAmount: string
      placedAt: string
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.placeValidationBet({
        marketId,
        ...body,
      }))
    }
    throw new Error('Direct live bet placement has been replaced by prepare/confirm wallet execution')
  },
  prepareValidationBet(
    marketId: string,
    body: {
      propositionId: string
      selectedOption: 0 | 1
      stakeAmount: string
      placedAt: string
    },
    token: string,
  ) {
    return requestJson<PrepareValidationBetResult>(`/arena/validation/markets/${marketId}/bets/prepare`, {
      method: 'POST',
      body,
      token,
    }).catch((error) => normalizeValidationBetError(error))
  },
  confirmValidationBet(
    marketId: string,
    body: {
      propositionId: string
      selectedOption: 0 | 1
      stakeAmount: string
      placedAt: string
      txHash: string
    },
    token: string,
  ) {
    return requestJson<PlaceValidationBetResult>(`/arena/validation/markets/${marketId}/bets/confirm`, {
      method: 'POST',
      body,
      token,
    }).catch((error) => normalizeValidationBetError(error))
  },
  createAuthChallenge(walletAddress: string, chainId: number) {
    if (isDemoWalletAddress(walletAddress)) {
      return Promise.resolve(demoBackend.createChallenge(walletAddress, chainId))
    }
    return requestJson<AuthChallengeResponse>('/auth/challenge', {
      method: 'POST',
      body: {
        walletAddress,
        chainId,
      },
    })
  },
  verifyAuthSignature(walletAddress: string, chainId: number, signature: string) {
    if (isDemoWalletAddress(walletAddress) || signature === 'demo-signature') {
      return Promise.resolve(demoBackend.verifyAuthSignature(chainId))
    }
    return requestJson<AuthVerifyResponse>('/auth/verify', {
      method: 'POST',
      body: {
        walletAddress,
        chainId,
        signature,
      },
    })
  },
  getAuthProfile(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAuthProfile(token))
    }
    return requestJson<JwtIdentity>('/auth/me', { token })
  },
  listDrafts(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listDrafts())
    }
    return requestJson<PropositionDraftRecord[]>('/arena/propositions/drafts', { token })
  },
  listSubmissions(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listSubmissions())
    }
    return requestJson<PropositionDraftRecord[]>('/arena/propositions/submissions', { token })
  },
  getRequesterOverview(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getRequesterOverview())
    }
    return requestJson<RequesterOwnedPropositionOverviewRecord>('/arena/propositions/mine/overview', { token })
  },
  getOwnedPropositionDetail(propositionId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getOwnedPropositionDetail(propositionId))
    }
    return requestJson<RequesterOwnedPropositionDetailRecord>(
      `/arena/propositions/mine/${propositionId}`,
      { token },
    )
  },
  getOwnedPropositionBudgetLedger(propositionId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getOwnedPropositionBudgetLedger(propositionId))
    }
    return requestJson<RequesterPropositionBudgetLedgerRecord>(
      `/arena/propositions/mine/${propositionId}/budget-ledger`,
      { token },
    )
  },
  getOwnedPropositionReport(propositionId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getOwnedPropositionReport(propositionId))
    }
    return requestJson<RequesterOwnedSettledPropositionReportRecord>(
      `/arena/propositions/mine/${propositionId}/report`,
      { token },
    )
  },
  getOwnedPropositionExport(exportId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getOwnedPropositionExport(exportId))
    }
    return requestJson<RequesterOwnedPropositionExportRecord>(
      `/arena/propositions/mine/exports/${exportId}`,
      { token },
    )
  },
  listOwnedPropositionExports(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listOwnedPropositionExports())
    }
    return requestJson<RequesterOwnedPropositionExportListRecord>(
      '/arena/propositions/mine/exports',
      { token },
    )
  },
  listRequesterReportPresets(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listRequesterReportPresets())
    }
    return requestJson<RequesterReportPresetListRecord>(
      '/arena/propositions/mine/report-presets',
      { token },
    )
  },
  listRequesterComparisonSets(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listRequesterComparisonSets())
    }
    return requestJson<RequesterComparisonSetListRecord>(
      '/arena/propositions/mine/comparison-sets',
      { token },
    )
  },
  getRequesterComparisonSetAnalytics(comparisonSetId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getRequesterComparisonSetAnalytics(comparisonSetId))
    }
    return requestJson<RequesterComparisonSetAnalyticsRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/analytics`,
      { token },
    )
  },
  createRequesterComparisonSetExport(
    comparisonSetId: string,
    token: string,
    body?: {
      format?: 'json' | 'csv'
    },
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.createRequesterComparisonSetExport(comparisonSetId, body))
    }
    return requestJson<RequesterComparisonSetExportRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/exports`,
      {
        method: 'POST',
        body: body ?? {},
        token,
      },
    )
  },
  listRequesterComparisonSetExports(
    comparisonSetId: string,
    token: string,
    filters?: {
      origin?: RequesterComparisonSetExportOriginFilterRecord
      policyId?: string
      limit?: number
    },
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listRequesterComparisonSetExports(comparisonSetId, filters))
    }
    const params = new URLSearchParams()
    if (filters?.origin) {
      params.set('origin', filters.origin)
    }
    if (filters?.policyId) {
      params.set('policyId', filters.policyId)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    return requestJson<RequesterComparisonSetExportListRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/exports${params.size > 0 ? `?${params.toString()}` : ''}`,
      { token },
    )
  },
  getRequesterComparisonSetExport(
    comparisonSetId: string,
    exportId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.getRequesterComparisonSetExport(comparisonSetId, exportId),
      )
    }
    return requestJson<RequesterComparisonSetExportRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/exports/${exportId}`,
      { token },
    )
  },
  deleteRequesterComparisonSetExport(
    comparisonSetId: string,
    exportId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.deleteRequesterComparisonSetExport(comparisonSetId, exportId),
      )
    }
    return requestJson<DeleteRequesterComparisonSetExportResultRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/exports/${exportId}`,
      {
        method: 'DELETE',
        token,
      },
    )
  },
  listRequesterDeliveryCredentials(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listRequesterDeliveryCredentials())
    }
    return requestJson<RequesterDeliveryCredentialDirectoryRecord>(
      '/arena/propositions/mine/delivery-credentials',
      { token },
    )
  },
  listRequesterComparisonSetDeliveryPolicies(comparisonSetId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listRequesterComparisonSetDeliveryPolicies(comparisonSetId))
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyListRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies`,
      { token },
    )
  },
  createRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    body: CreateRequesterComparisonSetDeliveryPolicyInputRecord,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.createRequesterComparisonSetDeliveryPolicy(comparisonSetId, body),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyListRecord['items'][number]>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies`,
      {
        method: 'POST',
        body,
        token,
      },
    )
  },
  updateRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    body: UpdateRequesterComparisonSetDeliveryPolicyInputRecord,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.updateRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId, body),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyListRecord['items'][number]>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}`,
      {
        method: 'PATCH',
        body,
        token,
      },
    )
  },
  deleteRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.deleteRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId),
      )
    }
    return requestJson<DeleteRequesterComparisonSetDeliveryPolicyResultRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}`,
      {
        method: 'DELETE',
        token,
      },
    )
  },
  getRequesterComparisonSetDeliveryPolicyHealth(
    comparisonSetId: string,
    policyId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.getRequesterComparisonSetDeliveryPolicyHealth(comparisonSetId, policyId),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyHealthRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/health`,
      { token },
    )
  },
  runRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.runRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyRunRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/run`,
      {
        method: 'POST',
        body: {},
        token,
      },
    )
  },
  listRequesterComparisonSetDeliveryRuns(
    comparisonSetId: string,
    policyId: string,
    token: string,
    filters?: {
      status?: RequesterComparisonSetDeliveryRunStatusFilterRecord
      triggerType?: RequesterComparisonSetDeliveryRunTriggerTypeFilterRecord
      replay?: RequesterComparisonSetDeliveryRunReplayFilterRecord
      limit?: number
    },
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.listRequesterComparisonSetDeliveryRuns(comparisonSetId, policyId, filters),
      )
    }
    const params = new URLSearchParams()
    if (filters?.status) {
      params.set('status', filters.status)
    }
    if (filters?.triggerType) {
      params.set('triggerType', filters.triggerType)
    }
    if (filters?.replay && filters.replay !== 'all') {
      params.set('replay', filters.replay)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    return requestJson<RequesterComparisonSetDeliveryRunListRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/runs${params.size > 0 ? `?${params.toString()}` : ''}`,
      { token },
    )
  },
  retryRequesterComparisonSetDeliveryRun(
    comparisonSetId: string,
    policyId: string,
    runId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.retryRequesterComparisonSetDeliveryRun(comparisonSetId, policyId, runId),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryRunRetryRecord>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/runs/${runId}/retry`,
      {
        method: 'POST',
        body: {},
        token,
      },
    )
  },
  pauseRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.pauseRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyListRecord['items'][number]>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/pause`,
      {
        method: 'POST',
        body: {},
        token,
      },
    )
  },
  resumeRequesterComparisonSetDeliveryPolicy(
    comparisonSetId: string,
    policyId: string,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(
        demoBackend.resumeRequesterComparisonSetDeliveryPolicy(comparisonSetId, policyId),
      )
    }
    return requestJson<RequesterComparisonSetDeliveryPolicyListRecord['items'][number]>(
      `/arena/propositions/mine/comparison-sets/${comparisonSetId}/delivery-policies/${policyId}/resume`,
      {
        method: 'POST',
        body: {},
        token,
      },
    )
  },
  createOwnedPropositionExport(
    body: {
      presetId?: string
      format?: 'json' | 'csv'
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.createOwnedPropositionExport(body))
    }
    return requestJson<RequesterOwnedPropositionExportRecord>('/arena/propositions/mine/exports', {
      method: 'POST',
      body,
      token,
    })
  },
  getDraft(propositionId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getDraft(propositionId))
    }
    return requestJson<PropositionDraftRecord>(`/arena/propositions/drafts/${propositionId}`, {
      token,
    })
  },
  createDraft(
    body: {
      category: PropositionCategory
      title: string
      summary: string
      optionA: string
      optionB: string
      sampleConstraints: string[]
      minEffectiveSample: number
      minBetAmount: string
      minDurationSeconds: number
      maxDurationSeconds: number
      rewardBudget: string
      baseResponseReward: string
      marketEnabled: boolean
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.createDraft(body))
    }
    return requestJson<PropositionDraftRecord>('/arena/propositions/drafts', {
      method: 'POST',
      body,
      token,
    })
  },
  updateDraft(
    propositionId: string,
    body: Partial<{
      category: PropositionCategory
      title: string
      summary: string
      optionA: string
      optionB: string
      sampleConstraints: string[]
      minEffectiveSample: number
      minBetAmount: string
      minDurationSeconds: number
      maxDurationSeconds: number
      rewardBudget: string
      baseResponseReward: string
      marketEnabled: boolean
    }>,
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.updateDraft(propositionId, body))
    }
    return requestJson<PropositionDraftRecord>(`/arena/propositions/drafts/${propositionId}`, {
      method: 'PATCH',
      body,
      token,
    })
  },
  submitDraft(propositionId: string, note: string | undefined, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.submitDraft(propositionId))
    }
    return requestJson<PropositionDraftRecord>(`/arena/propositions/drafts/${propositionId}/submit`, {
      method: 'POST',
      body: note ? { note } : {},
      token,
    })
  },
  withdrawSubmission(propositionId: string, note: string | undefined, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.withdrawSubmission(propositionId))
    }
    return requestJson<PropositionDraftRecord>(`/arena/propositions/submissions/${propositionId}/withdraw`, {
      method: 'POST',
      body: note ? { note } : {},
      token,
    })
  },
  deleteDraft(propositionId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.deleteDraft(propositionId))
    }
    return requestJson<ArchiveDraftResult>(`/arena/propositions/drafts/${propositionId}`, {
      method: 'DELETE',
      token,
    })
  },
  listAdjudicationTasks(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.listAdjudicationTasks())
    }
    return requestJson<AdjudicationTaskViewModel[]>('/arena/adjudication/tasks', { token })
  },
  getAdjudicationTask(taskId: string, token: string) {
    return requestJson<AdjudicationTaskViewModel>(`/arena/adjudication/tasks/${taskId}`, { token })
  },
  startAdjudicationTask(
    taskId: string,
    body: {
      startedAt: string
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.startAdjudicationTask(taskId, body))
    }
    return requestJson<AdjudicationTaskViewModel>(`/arena/adjudication/tasks/${taskId}/start`, {
      method: 'POST',
      body,
      token,
    })
  },
  skipAdjudicationTask(
    taskId: string,
    body: {
      skippedAt: string
      skipReason: string
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.skipAdjudicationTask(taskId, body))
    }
    return requestJson<AdjudicationTaskViewModel>(`/arena/adjudication/tasks/${taskId}/skip`, {
      method: 'POST',
      body,
      token,
    })
  },
  submitAdjudicationResponse(
    taskId: string,
    body: {
      propositionId: string
      selectedOption: 0 | 1
      confirmationOption: 0 | 1
      clientStartedAt: string
      clientSubmittedAt: string
      understandingAck: boolean
      submittedAt: string
    },
    token: string,
  ) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.submitAdjudicationResponse(taskId, body))
    }
    return requestJson<SubmitAdjudicationResponseResult>(
      `/arena/adjudication/tasks/${taskId}/responses`,
      {
        method: 'POST',
        body,
        token,
      },
    )
  },
  listRewards(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview().rewards)
    }
    return requestJson<RespondentRewardLedgerViewModel[]>('/arena/adjudication/rewards', { token })
  },
  getAccountOverview(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview())
    }
    return requestJson<RespondentAccountOverviewViewModel>('/arena/adjudication/account/overview', { token })
  },
  getAccountPreferences(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountPreferences())
    }
    return requestJson<RespondentAccountPreferencesViewModel>('/arena/adjudication/account/preferences', { token })
  },
  updateAccountPreferences(body: UpdateRespondentAccountPreferencesInput, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.updateAccountPreferences(body))
    }
    return requestJson<RespondentAccountPreferencesViewModel>('/arena/adjudication/account/preferences', {
      method: 'PATCH',
      body,
      token,
    })
  },
  getAccountExports(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountExports())
    }
    return requestJson<RespondentAccountExportListViewModel>('/arena/adjudication/account/exports', { token })
  },
  getAccountExport(exportId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountExport(exportId))
    }
    return requestJson<RespondentAccountExportArtifactViewModel>(
      `/arena/adjudication/account/exports/${exportId}`,
      { token },
    )
  },
  createAccountExport(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.createAccountExport())
    }
    return requestJson<RespondentAccountExportArtifactViewModel>('/arena/adjudication/account/exports', {
      method: 'POST',
      body: {},
      token,
    })
  },
  getWatchlist(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getWatchlist())
    }
    return requestJson<RespondentWatchlistViewModel>('/arena/adjudication/account/watchlist', { token })
  },
  saveWatchlistItem(marketId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.saveWatchlistItem(marketId))
    }
    return requestJson<UpdateRespondentWatchlistResultViewModel>('/arena/adjudication/account/watchlist', {
      method: 'POST',
      body: { marketId },
      token,
    })
  },
  removeWatchlistItem(marketId: string, token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.removeWatchlistItem(marketId))
    }
    return requestJson<UpdateRespondentWatchlistResultViewModel>(`/arena/adjudication/account/watchlist/${marketId}`, {
      method: 'DELETE',
      token,
    })
  },
  listResults(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview().resultOverview.settledResults)
    }
    return requestJson<RespondentResultListViewModel>('/arena/adjudication/results', { token })
  },
  getResultOverview(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview().resultOverview)
    }
    return requestJson<RespondentResultOverviewViewModel>('/arena/adjudication/results/overview', { token })
  },
  getReputation(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview().reputation)
    }
    return requestJson<RespondentReputationSummaryViewModel>('/arena/adjudication/reputation', { token })
  },
  getTags(token: string) {
    if (maybeUseDemoToken(token)) {
      return Promise.resolve(demoBackend.getAccountOverview().tags)
    }
    return requestJson<RespondentTagSummaryViewModel>('/arena/adjudication/tags', { token })
  },

  // --- Operator console (internal). Demo operator sessions use a local
  // mutable fixture backend so the ops workspace remains verifiable even when
  // no live operator API is available on localhost. ---

  getOpsReviewQueue(
    token: string,
    filters?: OpsPropositionFilters,
  ) {
    const params = new URLSearchParams()
    if (filters?.category) {
      params.set('category', filters.category)
    }
    if (filters?.marketEnabled !== undefined) {
      params.set('marketEnabled', String(filters.marketEnabled))
    }
    if (filters?.search) {
      params.set('search', filters.search)
    }
    if (filters?.sortBy) {
      params.set('sortBy', filters.sortBy)
    }
    if (filters?.sortDirection) {
      params.set('sortDirection', filters.sortDirection)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number') {
      params.set('offset', String(filters.offset))
    }
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsReviewQueue(filters),
      () => requestJson<InternalPropositionListPageViewModel>(
        `/arena/internal/propositions/review-queue${params.size > 0 ? `?${params.toString()}` : ''}`,
        { token },
      ),
    )
  },
  getOpsPropositions(
    token: string,
    filters?: OpsPropositionFilters,
  ) {
    const params = new URLSearchParams()
    if (filters?.status) {
      params.set('status', filters.status)
    }
    if (filters?.category) {
      params.set('category', filters.category)
    }
    if (filters?.marketEnabled !== undefined) {
      params.set('marketEnabled', String(filters.marketEnabled))
    }
    if (filters?.search) {
      params.set('search', filters.search)
    }
    if (filters?.sortBy) {
      params.set('sortBy', filters.sortBy)
    }
    if (filters?.sortDirection) {
      params.set('sortDirection', filters.sortDirection)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number') {
      params.set('offset', String(filters.offset))
    }
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsPropositions(filters),
      () => requestJson<InternalPropositionListPageViewModel>(
        `/arena/internal/propositions${params.size > 0 ? `?${params.toString()}` : ''}`,
        { token },
      ),
    )
  },
  getOpsProposition(propositionId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsProposition(propositionId),
      () => requestJson<InternalPropositionDetailViewModel>(
        `/arena/internal/propositions/${propositionId}`,
        { token },
      ),
    )
  },
  previewOpsDispatchCandidates(
    propositionId: string,
    body: {
      userIds: string[]
      assignedAt: string
      maxAssignments?: number
    },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.previewOpsDispatchCandidates(propositionId, body),
      () => requestJson<OpsDispatchPreviewViewModel>(
        `/arena/internal/propositions/${propositionId}/dispatch-preview`,
        { method: 'POST', body, token },
      ),
    )
  },
  createOpsDispatchTasks(
    propositionId: string,
    body: {
      userIds: string[]
      assignedAt: string
      expiresAt: string
      maxAssignments?: number
    },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.createOpsDispatchTasks(propositionId, body),
      () => requestJson<OpsDispatchTaskViewModel[]>(
        `/arena/internal/propositions/${propositionId}/dispatch`,
        { method: 'POST', body, token },
      ),
    )
  },
  getOpsPropositionRehearsalCheckpoints(propositionId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsPropositionRehearsalCheckpoints(propositionId),
      () => requestJson<PropositionValidationRehearsalCheckpointViewModel[]>(
        `/arena/internal/propositions/${propositionId}/rehearsal-checkpoints`,
        { token },
      ),
    )
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
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.recordOpsRehearsalCheckpoint(propositionId, body),
      () => requestJson<PropositionValidationRehearsalCheckpointViewModel>(
        `/arena/internal/validation-chain/propositions/${propositionId}/rehearsal-checkpoints`,
        { method: 'POST', body, token },
      ),
    )
  },
  getOpsRespondentReputation(userId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsRespondentReputation(userId),
      () => requestJson<RespondentReputationInternalViewModel>(
        `/arena/internal/respondents/${userId}/reputation`,
        { token },
      ),
    )
  },
  getOpsRespondentTags(userId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsRespondentTags(userId),
      () => requestJson<RespondentTagInternalViewModel>(
        `/arena/internal/respondents/${userId}/tags`,
        { token },
      ),
    )
  },
  getOpsAuditEvents(token: string, filters?: OpsAuditFilters) {
    const params = new URLSearchParams()
    if (filters?.entityType) {
      params.set('entityType', filters.entityType)
    }
    if (filters?.entityId) {
      params.set('entityId', filters.entityId)
    }
    if (filters?.actorUserId) {
      params.set('actorUserId', filters.actorUserId)
    }
    if (filters?.action) {
      params.set('action', filters.action)
    }
    if (filters?.search) {
      params.set('search', filters.search)
    }
    if (filters?.sortDirection) {
      params.set('sortDirection', filters.sortDirection)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number') {
      params.set('offset', String(filters.offset))
    }
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsAuditEvents(filters),
      () => requestJson<InternalAuditEventListPageViewModel>(
        `/arena/internal/audit-events${params.size > 0 ? `?${params.toString()}` : ''}`,
        { token },
      ),
    )
  },
  getOpsPropositionExport(propositionId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsPropositionExport(propositionId),
      () => requestJson<InternalPropositionDetailViewModel & { exportedAt: string }>(
        `/arena/internal/propositions/${propositionId}/export`,
        { token },
      ),
    )
  },
  getOpsPropositionEvidenceBundle(propositionId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsPropositionEvidenceBundle(propositionId),
      () => requestJson<InternalPropositionEvidenceBundleViewModel>(
        `/arena/internal/propositions/${propositionId}/evidence-bundle`,
        { token },
      ),
    )
  },
  getOpsSampleShortage(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsSampleShortage(),
      () => requestJson<SampleShortageMonitoringItemViewModel[]>(
        '/arena/internal/monitoring/sample-shortage',
        { token },
      ),
    )
  },
  getOpsAnomalies(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsAnomalies(),
      () => requestJson<QualityAnomalyMonitoringItemViewModel[]>(
        '/arena/internal/monitoring/anomalies',
        { token },
      ),
    )
  },
  getOpsLifecycleDrift(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsLifecycleDrift(),
      () => requestJson<ValidationLifecycleDriftMonitoringItemViewModel[]>(
        '/arena/internal/monitoring/validation-lifecycle-drift',
        { token },
      ),
    )
  },
  getOpsValidationChainHealth(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsValidationChainHealth(),
      () => requestJson<ValidationChainMonitoringViewModel | null>(
        '/arena/internal/monitoring/validation-chain',
        { token },
      ),
    )
  },
  getOpsValidationChainRuntimeReadiness(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsValidationChainRuntimeReadiness(),
      () => requestJson<ValidationChainRuntimeReadinessViewModel>(
        '/arena/internal/monitoring/validation-chain/runtime-readiness',
        { token },
      ),
    )
  },
  getOpsRuntimeContract(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsRuntimeContract(),
      () => requestJson<BackendRuntimeContractViewModel>(
        '/arena/internal/monitoring/runtime-contract',
        { token },
      ),
    )
  },
  getOpsQueueOverview(token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsQueueOverview(),
      () => requestJson<QueueOverviewSnapshot>('/system/queues/overview', { token }),
    )
  },
  requeueFailedOpsQueue(queueName: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.requeueFailedOpsQueue(queueName),
      () => requestJson<QueueFailedJobRequeueResultSnapshot>(`/system/queues/${encodeURIComponent(queueName)}/requeue-failed`, {
        method: 'POST',
        token,
      }),
    )
  },
  approveOpsProposition(
    propositionId: string,
    body: { publishedAt: string; reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.approveOpsProposition(propositionId, body),
      () => requestJson<InternalPropositionDetailViewModel>(
        `/arena/internal/propositions/${propositionId}/approve`,
        { method: 'POST', body, token },
      ),
    )
  },
  rejectOpsProposition(
    propositionId: string,
    body: { reason: string; rejectedAt?: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.rejectOpsProposition(propositionId, body),
      () => requestJson<InternalPropositionDetailViewModel>(
        `/arena/internal/propositions/${propositionId}/reject`,
        { method: 'POST', body, token },
      ),
    )
  },
  emergencyFreezeOpsProposition(
    propositionId: string,
    body: { frozenAt: string; reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.emergencyFreezeOpsProposition(propositionId, body),
      () => requestJson<InternalPropositionDetailViewModel>(
        `/arena/internal/propositions/${propositionId}/emergency-freeze`,
        { method: 'POST', body, token },
      ),
    )
  },
  getOpsResponseReviewState(responseId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsResponseReviewState(responseId),
      () => requestJson<ResponseReviewWorkflowViewModel>(
        `/arena/internal/responses/${responseId}/review-state`,
        { token },
      ),
    )
  },
  getOpsResponseQueue(token: string, filters?: OpsResponseQueueFilters) {
    const params = new URLSearchParams()
    if (filters?.workflowState) {
      params.set('workflowState', filters.workflowState)
    }
    if (filters?.propositionId) {
      params.set('propositionId', filters.propositionId)
    }
    if (filters?.claimStaleOnly) {
      params.set('claimStaleOnly', 'true')
    }
    if (filters?.claimedByUserId) {
      params.set('claimedByUserId', filters.claimedByUserId)
    }
    if (filters?.reviewStatus) {
      params.set('reviewStatus', filters.reviewStatus)
    }
    if (filters?.search) {
      params.set('search', filters.search)
    }
    if (filters?.sortBy) {
      params.set('sortBy', filters.sortBy)
    }
    if (filters?.sortDirection) {
      params.set('sortDirection', filters.sortDirection)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number') {
      params.set('offset', String(filters.offset))
    }
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsResponseQueue(filters),
      () => requestJson<InternalResponseReviewQueuePageViewModel>(
        `/arena/internal/responses${params.size > 0 ? `?${params.toString()}` : ''}`,
        { token },
      ),
    )
  },
  getOpsResponseDetail(responseId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsResponseDetail(responseId),
      () => requestJson<InternalResponseReviewDetailViewModel>(
        `/arena/internal/responses/${responseId}`,
        { token },
      ),
    )
  },
  claimOpsResponseReview(
    responseId: string,
    body: { claimedAt: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.claimOpsResponseReview(responseId, body),
      () => requestJson<ResponseReviewWorkflowViewModel>(
        `/arena/internal/responses/${responseId}/claim`,
        { method: 'POST', body, token },
      ),
    )
  },
  releaseOpsResponseReview(
    responseId: string,
    body: { releasedAt: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.releaseOpsResponseReview(responseId, body),
      () => requestJson<ResponseReviewWorkflowViewModel>(
        `/arena/internal/responses/${responseId}/release`,
        { method: 'POST', body, token },
      ),
    )
  },
  reviewOpsResponse(
    responseId: string,
    body: { reviewedAt: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.reviewOpsResponse(responseId, body),
      () => requestJson<ResponseReviewWorkflowViewModel>(
        `/arena/internal/responses/${responseId}/review`,
        { method: 'POST', body, token },
      ),
    )
  },
  getOpsRewards(token: string, filters?: OpsRewardFilters) {
    const params = new URLSearchParams()
    if (filters?.propositionId) {
      params.set('propositionId', filters.propositionId)
    }
    if (filters?.userId) {
      params.set('userId', filters.userId)
    }
    if (filters?.responseId) {
      params.set('responseId', filters.responseId)
    }
    if (filters?.status) {
      params.set('status', filters.status)
    }
    if (filters?.sourceType) {
      params.set('sourceType', filters.sourceType)
    }
    if (filters?.search) {
      params.set('search', filters.search)
    }
    if (filters?.sortBy) {
      params.set('sortBy', filters.sortBy)
    }
    if (filters?.sortDirection) {
      params.set('sortDirection', filters.sortDirection)
    }
    if (typeof filters?.limit === 'number') {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number') {
      params.set('offset', String(filters.offset))
    }
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsRewards(filters),
      () => requestJson<InternalRewardAuditListPageViewModel>(
        `/arena/internal/rewards${params.size > 0 ? `?${params.toString()}` : ''}`,
        { token },
      ),
    )
  },
  getOpsRewardDetail(ledgerId: string, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.getOpsRewardDetail(ledgerId),
      () => requestJson<InternalRewardAuditDetailViewModel>(
        `/arena/internal/rewards/${ledgerId}`,
        { token },
      ),
    )
  },
  retriggerOpsRewardResolution(
    ledgerId: string,
    body: { resolvedAt: string; reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.retriggerOpsRewardResolution(ledgerId, body),
      () => requestJson<InternalRewardAuditDetailViewModel>(
        `/arena/internal/rewards/${ledgerId}/retrigger-review-resolution`,
        { method: 'POST', body, token },
      ),
    )
  },
  runOpsValidationChainPropositionCommand(
    kind: OpsValidationChainPropositionCommand,
    propositionId: string,
    body: { reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.runOpsValidationChainPropositionCommand(kind, propositionId, body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        `/arena/internal/validation-chain/propositions/${propositionId}/${kind}`,
        { method: 'POST', body, token },
      ),
    )
  },
  cancelOpsValidationChainMarket(
    propositionId: string,
    body: { reason: string; reasonCode: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.cancelOpsValidationChainMarket(propositionId, body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        `/arena/internal/validation-chain/propositions/${propositionId}/cancel-market`,
        { method: 'POST', body, token },
      ),
    )
  },
  recoverOpsValidationChainCommand(
    propositionId: string,
    body: { reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.recoverOpsValidationChainCommand(propositionId, body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        `/arena/internal/validation-chain/propositions/${propositionId}/recover-command`,
        { method: 'POST', body, token },
      ),
    )
  },
  syncOpsValidationChain(body: { reason: string; note?: string }, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.syncOpsValidationChain(body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        '/arena/internal/validation-chain/sync',
        { method: 'POST', body, token },
      ),
    )
  },
  reconcileOpsValidationChainBacklog(
    body: { reason: string; note?: string; limit?: number },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.reconcileOpsValidationChainBacklog(body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        '/arena/internal/validation-chain/backlog/reconcile',
        { method: 'POST', body, token },
      ),
    )
  },
  replayOpsValidationChainProjection(
    marketId: string,
    body: { reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.replayOpsValidationChainProjection(marketId, body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        `/arena/internal/validation-chain/markets/${marketId}/replay-projection`,
        { method: 'POST', body, token },
      ),
    )
  },
  reconcileOpsValidationChainBet(
    marketId: string,
    userId: string,
    body: { reason: string; note?: string },
    token: string,
  ) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.reconcileOpsValidationChainBet(marketId, userId, body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        `/arena/internal/validation-chain/markets/${marketId}/bets/${userId}/reconcile`,
        { method: 'POST', body, token },
      ),
    )
  },
  pauseOpsValidationChain(body: { reason: string; note?: string }, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.pauseOpsValidationChain(body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        '/arena/internal/validation-chain/pause',
        { method: 'POST', body, token },
      ),
    )
  },
  unpauseOpsValidationChain(body: { reason: string; note?: string }, token: string) {
    return withDemoOperatorToken(
      token,
      () => demoOpsBackend.unpauseOpsValidationChain(body),
      () => requestJson<ValidationChainCommandResultViewModel>(
        '/arena/internal/validation-chain/unpause',
        { method: 'POST', body, token },
      ),
    )
  },
}
