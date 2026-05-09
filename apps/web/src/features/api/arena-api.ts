import type {
  AdjudicationTaskViewModel,
  AuthChallengeResponse,
  JwtIdentity,
  PlaceValidationBetResult,
  PublicCategoryDirectoryViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicsViewModel,
  PublicProgressSnapshot,
  RespondentAccountOverviewViewModel,
  RespondentAccountPreferencesViewModel,
  RespondentAccountExportArtifactViewModel,
  RespondentAccountExportListViewModel,
  RespondentReputationSummaryViewModel,
  RespondentResultOverviewViewModel,
  RespondentResultListViewModel,
  RespondentRewardLedgerViewModel,
  RespondentTagSummaryViewModel,
  RespondentWatchlistViewModel,
  SubmitAdjudicationResponseResult,
  UpdateRespondentAccountPreferencesInput,
  UpdateRespondentWatchlistResultViewModel,
  ValidationMarketViewModel,
} from '@arena/shared'
import { demoBackend } from '../demo/demo-backend'
import { DEMO_SESSION_TOKEN, isDemoToken, isDemoWalletAddress } from '../demo/demo-auth'

export type ArenaApiErrorPayload = {
  statusCode?: number
  errorCode?: string
  message?: string
}

export type ArenaApiSourceMode = 'live' | 'demo'

export type ArenaApiFeedResult<T> = {
  data: T
  sourceMode: ArenaApiSourceMode
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
  category: string
  sampleConstraints: string[]
  minEffectiveSample: number
  minBetAmount: string
  minDurationSeconds: number
  maxDurationSeconds: number
  rewardBudget: string
  baseResponseReward: string
  marketEnabled: boolean
  status: string
  submissionStatus: string
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}

export type ArchiveDraftResult = {
  propositionId: string
  archivedAt: string
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
}

const DEFAULT_API_BASE_URL = 'http://localhost:3000'

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
      sourceMode: 'demo',
    }
  }
}

function maybeUseDemoToken(token?: string | null) {
  return isDemoToken(token) ? DEMO_SESSION_TOKEN : null
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
    return requestJson<PlaceValidationBetResult>(`/arena/validation/markets/${marketId}/bets`, {
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
      category: string
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
      category: string
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
      return Promise.resolve(demoBackend.submitAdjudicationResponse(taskId, body.selectedOption))
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
}
