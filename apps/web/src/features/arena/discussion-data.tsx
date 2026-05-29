import type { ArenaDiscussionThreadViewModel } from '@arena/shared'
import { useEffect, useMemo, useState } from 'react'
import { arenaApi } from '../api/arena-api'
import { useAuthSession } from '../auth/auth-session'
import { DEMO_SESSION_TOKEN, isDemoToken } from '../demo/demo-auth'

type DiscussionSourceMode = 'live' | 'demo'

type DiscussionDataState = {
  thread: ArenaDiscussionThreadViewModel | null
  sourceMode: DiscussionSourceMode
  isLoading: boolean
  errorMessage: string | null
}

export function useDiscussionData(
  marketId: string | null,
  propositionId: string | null,
  preferredSourceMode: DiscussionSourceMode = 'live',
) {
  const { token } = useAuthSession()
  const [state, setState] = useState<DiscussionDataState>({
    thread: null,
    sourceMode: preferredSourceMode,
    isLoading: Boolean(marketId),
    errorMessage: null,
  })

  useEffect(() => {
    if (!marketId) {
      setState({
        thread: null,
        sourceMode: preferredSourceMode,
        isLoading: false,
        errorMessage: null,
      })
      return
    }

    let disposed = false
    const useDemoSource = preferredSourceMode === 'demo' || Boolean(token && isDemoToken(token))

    void (async () => {
      setState((current) => ({
        ...current,
        sourceMode: useDemoSource ? 'demo' : 'live',
        isLoading: true,
        errorMessage: null,
      }))

      try {
        const nextThread = useDemoSource
          ? await arenaApi.getMarketDiscussionThread(marketId, DEMO_SESSION_TOKEN)
          : token
            ? await arenaApi.getMarketDiscussionThread(marketId, token)
            : await arenaApi.getMarketDiscussionThread(marketId)
        if (disposed) {
          return
        }

        setState({
          thread: nextThread,
          sourceMode: useDemoSource ? 'demo' : 'live',
          isLoading: false,
          errorMessage: null,
        })
      } catch (error) {
        if (disposed) {
          return
        }

        setState({
          thread: null,
          sourceMode: useDemoSource ? 'demo' : 'live',
          isLoading: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to load discussion',
        })
      }
    })()

    return () => {
      disposed = true
    }
  }, [marketId, propositionId, token])

  const actions = useMemo(() => ({
    async refresh() {
      if (!marketId) {
        return
      }

      const useDemoSource = preferredSourceMode === 'demo' || Boolean(token && isDemoToken(token))
      const nextThread = useDemoSource
        ? await arenaApi.getMarketDiscussionThread(marketId, DEMO_SESSION_TOKEN)
        : token
          ? await arenaApi.getMarketDiscussionThread(marketId, token)
          : await arenaApi.getMarketDiscussionThread(marketId)

      setState({
        thread: nextThread,
        sourceMode: useDemoSource ? 'demo' : 'live',
        isLoading: false,
        errorMessage: null,
      })
    },
    async createComment(input: {
      body: string
      optionIndex?: 0 | 1
    }) {
      if (!marketId || !propositionId || !token) {
        throw new Error('Authentication required')
      }

      const useDemoSource = preferredSourceMode === 'demo' || isDemoToken(token)
      const nextThread = await arenaApi.createMarketDiscussionComment(
        marketId,
        {
          propositionId,
          body: input.body,
          optionIndex: input.optionIndex,
          createdAt: new Date().toISOString(),
        },
        useDemoSource ? DEMO_SESSION_TOKEN : token,
      )

      setState({
        thread: nextThread,
        sourceMode: useDemoSource ? 'demo' : 'live',
        isLoading: false,
        errorMessage: null,
      })

      return nextThread
    },
  }), [marketId, preferredSourceMode, propositionId, token])

  return {
    ...state,
    ...actions,
  }
}
