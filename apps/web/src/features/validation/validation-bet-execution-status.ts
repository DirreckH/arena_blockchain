import type {
  ValidationBetExecutionViewModel,
  ValidationExecutionReadinessViewModel,
} from '@arena/shared'

type SessionMode = 'real' | 'demo' | 'anonymous'
type WalletAvailability = 'unknown' | 'available' | 'missing'
type WalletNetworkStatus = 'unknown' | 'supported' | 'unsupported'

export type MarketBetStatusLine = {
  label: string
  value: string
  detail: string
}

export type BuildMarketBetStatusLinesInput = {
  sessionMode: SessionMode
  isAuthenticated: boolean
  configuredChainId: number
  identityWalletAddress: string | null
  connectedWalletAddress: string | null
  availability: WalletAvailability
  networkStatus: WalletNetworkStatus
  currentChainId: number | null
  readiness: ValidationExecutionReadinessViewModel | null
}

const shortenHex = (value: string) => (
  value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`
)

const sameAddress = (left: string | null, right: string | null) => (
  Boolean(left && right && left.toLowerCase() === right.toLowerCase())
)

function describeReadinessValue(readiness: ValidationExecutionReadinessViewModel): string {
  switch (readiness.reasonCode) {
    case 'ready':
      return 'Ready'
    case 'market_not_live':
      return 'Market closed'
    case 'chain_market_missing':
      return 'Missing on chain'
    case 'chain_market_not_live':
      return 'Chain market closed'
    case 'wallet_chain_mismatch':
      return 'Wallet mismatch'
    default:
      return 'Blocked'
  }
}

function describeReadinessDetail(readiness: ValidationExecutionReadinessViewModel): string {
  if (readiness.ready) {
    const marketId = readiness.chainMarketId ? shortenHex(readiness.chainMarketId) : 'pending'
    return `Contract ${shortenHex(readiness.contractAddress)} on chain ${readiness.chainId}; market ${marketId}.`
  }

  return readiness.detail
}

export function describeMarketBetPath(
  input: Pick<BuildMarketBetStatusLinesInput, 'sessionMode' | 'readiness'>,
): string {
  if (input.sessionMode === 'demo') {
    return 'Demo path: Arena records a simulated position without a wallet signature or on-chain transaction.'
  }

  if (!input.readiness) {
    return 'Live path: public market data is available, but this environment is not exposing on-chain execution metadata for this market yet.'
  }

  if (input.readiness.ready) {
    return 'Live path: Arena prepares the bet, your wallet submits the contract transaction, and Arena confirms the receipt before recording the local position.'
  }

  switch (input.readiness.reasonCode) {
    case 'market_not_live':
      return 'Live path is paused until both the proposition and the validation market are live.'
    case 'chain_market_missing':
      return 'Live path is blocked until this validation market has been created on chain.'
    case 'chain_market_not_live':
      return 'Live path is blocked until the on-chain validation market is opened for betting.'
    case 'wallet_chain_mismatch':
      return 'Live path is blocked until the wallet is connected to the configured Arena chain.'
    default:
      return input.readiness.detail
  }
}

export function buildMarketBetStatusLines(
  input: BuildMarketBetStatusLinesInput,
): MarketBetStatusLine[] {
  const sessionLine: MarketBetStatusLine = !input.isAuthenticated
    ? {
        label: 'Arena session',
        value: 'Anonymous',
        detail: 'Log in with the wallet you want Arena to attribute this position to.',
      }
    : input.sessionMode === 'demo'
      ? {
          label: 'Arena session',
          value: 'Demo session',
          detail: input.identityWalletAddress
            ? `Arena is using demo wallet ${shortenHex(input.identityWalletAddress)}.`
            : 'Arena is using the demo bypass flow.',
        }
      : {
          label: 'Arena session',
          value: 'Authenticated',
          detail: input.identityWalletAddress
            ? `Arena session wallet ${shortenHex(input.identityWalletAddress)}.`
            : 'Arena authenticated the session, but no wallet address is attached to it.',
        }

  let walletLine: MarketBetStatusLine
  if (input.sessionMode === 'demo') {
    walletLine = {
      label: 'Browser wallet',
      value: 'Bypassed',
      detail: 'Demo mode does not require an injected wallet or browser signature.',
    }
  } else if (input.availability === 'missing') {
    walletLine = {
      label: 'Browser wallet',
      value: 'Not detected',
      detail: 'Install or unlock an injected wallet before submitting a live validation bet.',
    }
  } else if (
    input.connectedWalletAddress
    && input.identityWalletAddress
    && !sameAddress(input.connectedWalletAddress, input.identityWalletAddress)
  ) {
    walletLine = {
      label: 'Browser wallet',
      value: 'Wallet mismatch',
      detail: `Browser wallet ${shortenHex(input.connectedWalletAddress)} does not match Arena session ${shortenHex(input.identityWalletAddress)}.`,
    }
  } else if (input.connectedWalletAddress) {
    walletLine = {
      label: 'Browser wallet',
      value: 'Detected',
      detail: `Browser wallet ${shortenHex(input.connectedWalletAddress)} is available for signing.`,
    }
  } else if (input.availability === 'available') {
    walletLine = {
      label: 'Browser wallet',
      value: 'No account connected',
      detail: 'An injected wallet exists, but no browser account is currently available for signing.',
    }
  } else {
    walletLine = {
      label: 'Browser wallet',
      value: 'Checking',
      detail: 'Arena is still checking the browser wallet environment.',
    }
  }

  const networkLine: MarketBetStatusLine = input.sessionMode === 'demo'
    ? {
        label: 'Wallet network',
        value: 'Bypassed',
        detail: 'Demo mode does not require switching to a live chain.',
      }
    : input.networkStatus === 'supported'
      ? {
          label: 'Wallet network',
          value: `Chain ${input.configuredChainId}`,
          detail: 'The browser wallet is connected to the configured Arena chain.',
        }
      : input.networkStatus === 'unsupported'
        ? {
            label: 'Wallet network',
            value: `Chain ${input.currentChainId ?? 'unknown'}`,
            detail: `Switch the wallet to chain ${input.configuredChainId} before sending the contract transaction.`,
          }
        : {
            label: 'Wallet network',
            value: 'Checking',
            detail: 'Arena has not confirmed the current browser wallet chain yet.',
          }

  const readinessLine: MarketBetStatusLine = input.sessionMode === 'demo'
    ? {
        label: 'On-chain market',
        value: 'Simulated',
        detail: 'Demo mode skips contract readiness and on-chain settlement requirements.',
      }
    : !input.readiness
      ? {
          label: 'On-chain market',
          value: 'Not configured',
          detail: 'This market view does not yet expose contract address or chain market metadata.',
        }
      : {
          label: 'On-chain market',
          value: describeReadinessValue(input.readiness),
          detail: describeReadinessDetail(input.readiness),
        }

  return [sessionLine, walletLine, networkLine, readinessLine]
}

export function describeActiveExecutionFootnote(
  execution: ValidationBetExecutionViewModel,
): string {
  if (execution.usesDemoFlow) {
    return 'Demo mode skipped wallet signature, on-chain confirmation, and receipt matching.'
  }

  switch (execution.stage) {
    case 'session_validated':
      return 'Arena validated the session and prepared the contract request, but no wallet transaction has been submitted yet.'
    case 'awaiting_signature':
      return 'Approve the contract transaction in the wallet to move from preparation to an on-chain submission.'
    case 'transaction_submitted':
      return execution.txHash
        ? `Arena is waiting for on-chain confirmation of ${shortenHex(execution.txHash)} before recording the final local position.`
        : 'Arena is waiting for on-chain confirmation before recording the final local position.'
    case 'position_recorded':
      return execution.txHash
        ? `Arena confirmed ${shortenHex(execution.txHash)} and recorded the matching local position.`
        : 'Arena recorded the matching local position after confirmation.'
    case 'account_write_submitted':
      return 'Arena submitted the account-write step and is still waiting to finalize the position state.'
    default:
      return execution.detail
  }
}
