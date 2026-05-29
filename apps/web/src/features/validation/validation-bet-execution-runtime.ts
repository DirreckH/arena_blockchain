import { ArenaApiError } from '../api/arena-api'

const RETRYABLE_CONFIRM_ERROR_CODE = 'bet.transaction_not_confirmed'

const sameAddress = (left: string | null | undefined, right: string | null | undefined) => (
  Boolean(left && right && left.toLowerCase() === right.toLowerCase())
)

export function assertMatchingWalletSession(
  sessionWalletAddress: string | null | undefined,
  connectedWalletAddress: string | null | undefined,
) {
  if (!sessionWalletAddress) {
    throw new Error('Authenticated wallet address missing from session')
  }

  if (!connectedWalletAddress) {
    return
  }

  if (!sameAddress(sessionWalletAddress, connectedWalletAddress)) {
    throw new Error('Switch the browser wallet account to the authenticated Arena session wallet and retry')
  }
}

export async function confirmValidationBetWithRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number
    delayMs?: number
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4
  const delayMs = options.delayMs ?? 1200

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      const isRetryable = (
        error instanceof ArenaApiError
        && error.payload?.errorCode === RETRYABLE_CONFIRM_ERROR_CODE
      )

      if (!isRetryable || attempt === maxAttempts) {
        throw error
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs)
      })
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Validation bet confirmation failed')
}
