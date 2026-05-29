import { describe, expect, it } from 'vitest'
import {
  buildMarketBetStatusLines,
  describeActiveExecutionFootnote,
  describeMarketBetPath,
} from './validation-bet-execution-status'

describe('validation bet execution status', () => {
  it('describes the real prepare wallet confirm path when the market is chain-ready', () => {
    const description = describeMarketBetPath({
      sessionMode: 'real',
      readiness: {
        ready: true,
        reasonCode: 'ready',
        detail: 'ready',
        chainId: 31337,
        contractAddress: '0x1111111111111111111111111111111111111111',
        chainMarketId: '0x2222222222222222222222222222222222222222222222222222222222222222',
        chainStatus: 'live',
      },
    })

    expect(description).toContain('Arena prepares the bet')
    expect(description).toContain('wallet submits the contract transaction')
  })

  it('flags when the browser wallet does not match the authenticated Arena session', () => {
    const lines = buildMarketBetStatusLines({
      sessionMode: 'real',
      isAuthenticated: true,
      configuredChainId: 31337,
      identityWalletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      connectedWalletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      availability: 'available',
      networkStatus: 'supported',
      currentChainId: 31337,
      readiness: null,
    })

    expect(lines[1]).toEqual(expect.objectContaining({
      label: 'Browser wallet',
      value: 'Wallet mismatch',
    }))
    expect(lines[1].detail).toContain('does not match Arena session')
  })

  it('reports when a live market has not been created on chain yet', () => {
    const description = describeMarketBetPath({
      sessionMode: 'real',
      readiness: {
        ready: false,
        reasonCode: 'chain_market_missing',
        detail: 'The validation market has not been prepared on chain yet.',
        chainId: 31337,
        contractAddress: '0x1111111111111111111111111111111111111111',
        chainMarketId: null,
        chainStatus: null,
      },
    })

    expect(description).toContain('created on chain')
  })

  it('explains the waiting state after a wallet transaction is submitted', () => {
    const detail = describeActiveExecutionFootnote({
      mode: 'wallet_direct_contract_write',
      stage: 'transaction_submitted',
      requiresWalletSignature: true,
      usesDemoFlow: false,
      chainId: 31337,
      txHash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      submittedAt: '2026-05-26T00:00:00.000Z',
      recordedAt: '2026-05-26T00:00:00.000Z',
      statusLabel: 'Transaction submitted',
      detail: 'pending',
    })

    expect(detail).toContain('waiting for on-chain confirmation')
    expect(detail).toContain('0xabcdef')
  })
})
