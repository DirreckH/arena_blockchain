import { describe, expect, it, vi } from 'vitest'
import { ArenaApiError } from '../api/arena-api'
import {
  assertMatchingWalletSession,
  confirmValidationBetWithRetry,
} from './validation-bet-execution-runtime'

describe('validation bet execution runtime', () => {
  it('allows execution when the injected wallet matches the Arena session wallet', () => {
    expect(() => {
      assertMatchingWalletSession(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
      )
    }).not.toThrow()
  })

  it('blocks execution when the injected wallet does not match the Arena session wallet', () => {
    expect(() => {
      assertMatchingWalletSession(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      )
    }).toThrow('Switch the browser wallet account to the authenticated Arena session wallet and retry')
  })

  it('retries confirm while the transaction receipt is still unavailable', async () => {
    vi.useFakeTimers()

    const operation = vi.fn()
      .mockRejectedValueOnce(new ArenaApiError(
        409,
        'pending',
        {
          errorCode: 'bet.transaction_not_confirmed',
          message: 'pending',
        },
      ))
      .mockRejectedValueOnce(new ArenaApiError(
        409,
        'pending',
        {
          errorCode: 'bet.transaction_not_confirmed',
          message: 'pending',
        },
      ))
      .mockResolvedValueOnce({ ok: true })

    const resultPromise = confirmValidationBetWithRetry(operation, {
      maxAttempts: 4,
      delayMs: 1000,
    })

    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(operation).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it('does not retry non-retryable confirm failures', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ArenaApiError(
        409,
        'mismatch',
        {
          errorCode: 'bet.transaction_mismatch',
          message: 'mismatch',
        },
      ))

    await expect(confirmValidationBetWithRetry(operation)).rejects.toBeInstanceOf(ArenaApiError)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
