import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { arenaApi, ArenaApiError } from '../features/api/arena-api'

const AUTH_TOKEN_STORAGE_KEY = 'arena.auth.token'
const AUTH_IDENTITY_STORAGE_KEY = 'arena.auth.identity'

function isDevSessionSeedEnabled() {
  const mode = import.meta.env?.MODE
  return import.meta.env?.DEV === true || mode === 'test'
}

function redirectToTarget(target: string) {
  if (import.meta.env?.MODE === 'test') {
    window.history.replaceState({}, '', target)
    return
  }

  window.location.replace(target)
}

function normalizeRedirect(rawRedirect: string | null) {
  if (!rawRedirect || !rawRedirect.startsWith('/zh')) {
    return '/zh'
  }

  return rawRedirect
}

function getErrorMessage(error: unknown) {
  if (error instanceof ArenaApiError) {
    return error.payload?.message ?? error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Failed to seed the local Arena session.'
}

export function DevSessionSeedPage() {
  const { search } = useLocation()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const params = useMemo(() => new URLSearchParams(search), [search])
  const redirectTo = normalizeRedirect(params.get('redirect'))
  const token = params.get('token')

  useEffect(() => {
    if (!isDevSessionSeedEnabled()) {
      setStatus('error')
      setErrorMessage('Local session seeding is only enabled in dev and test builds.')
      return
    }

    if (!token) {
      setStatus('error')
      setErrorMessage('Missing token query parameter.')
      return
    }

    let disposed = false

    void (async () => {
      try {
        const identity = await arenaApi.getAuthProfile(token)

        if (disposed) {
          return
        }

        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
        window.localStorage.setItem(AUTH_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
        redirectToTarget(redirectTo)
      } catch (error) {
        if (disposed) {
          return
        }

        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      }
    })()

    return () => {
      disposed = true
    }
  }, [redirectTo, token])

  return (
    <section className="route-page" aria-label="Local session seed">
      <div className="account-menu-panel">
        <h1>Preparing local Arena session</h1>
        {status === 'loading' ? (
          <p>Verifying the supplied Arena bearer token and redirecting…</p>
        ) : (
          <p>{errorMessage}</p>
        )}
      </div>
    </section>
  )
}
