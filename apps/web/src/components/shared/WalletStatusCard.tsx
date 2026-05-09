import { Link } from 'react-router-dom'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { useRulesIntro } from './RulesIntroContext'

function describeNetwork(chainId: number | null) {
  if (chainId === null) {
    return 'Network not detected'
  }

  return `Connected chain ID ${chainId}`
}

export function WalletStatusCard() {
  const { isAuthenticated, identity, sessionMode, configuredChainId } = useAuthSession()
  const { availability, networkStatus, connectedWalletAddress, currentChainId } = useWalletEnvironment()
  const { openAuthModal } = useRulesIntro()

  const rows = [
    {
      label: 'Session',
      value: !isAuthenticated
        ? 'Anonymous'
        : sessionMode === 'demo'
          ? 'Demo session'
          : 'Signed session',
      detail: !isAuthenticated
        ? 'No authenticated Arena session'
        : identity
          ? `Wallet ${identity.walletAddress}`
          : 'Authenticated session active',
    },
    {
      label: 'Wallet provider',
      value: availability === 'available' ? 'Detected' : availability === 'missing' ? 'Missing' : 'Checking',
      detail: availability === 'missing'
        ? 'Install or unlock an injected wallet to sign with a real address'
        : connectedWalletAddress
          ? `Injected account ${connectedWalletAddress}`
          : 'Wallet can be connected when needed',
    },
    {
      label: 'Network',
      value: networkStatus === 'supported'
        ? 'Supported'
        : networkStatus === 'unsupported'
          ? 'Wrong network'
          : 'Unknown',
      detail: networkStatus === 'unsupported'
        ? `${describeNetwork(currentChainId)}. Arena expects chain ID ${configuredChainId}.`
        : networkStatus === 'supported'
          ? `Ready for Arena chain ID ${configuredChainId}`
          : 'Arena validates chain readiness when a real wallet signs',
    },
  ]

  return (
    <section className="account-menu-panel wallet-status-card">
      <div className="account-menu-panel-head">
        <h2>Wallet readiness</h2>
        <span>Real signing, demo sessions, and network readiness stay visible before any authenticated account write.</span>
      </div>
      <div className="account-menu-status-list">
        {rows.map((row) => (
          <div className="account-menu-status-row" key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.detail}</span>
            </div>
            <em className="account-menu-value">{row.value}</em>
          </div>
        ))}
      </div>
      <div className="wallet-status-actions">
        {!isAuthenticated ? (
          <button className="primary-action" type="button" onClick={() => openAuthModal('login')}>
            Connect wallet
          </button>
        ) : (
          <Link className="secondary-action" to="/zh/activity">
            Open account activity
          </Link>
        )}
      </div>
    </section>
  )
}
