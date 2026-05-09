import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { ARENA_LOGO_SRC } from '../../mocks/arena-market.mock'

export function AuthModal({
  mode,
  isOpen,
  onAuthenticate,
  onClose,
  onSwitchMode,
}: {
  mode: 'login' | 'signup'
  isOpen: boolean
  onAuthenticate: (walletAddress: string, mode: 'login' | 'signup') => Promise<void>
  onClose: () => void
  onSwitchMode: (mode: 'login' | 'signup') => void
}) {
  const { configuredChainId } = useAuthSession()
  const { availability, networkStatus, currentChainId } = useWalletEnvironment()
  const [walletAddress, setWalletAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) {
    return null
  }

  const isSignup = mode === 'signup'

  const handleSubmit = async () => {
    const normalizedWalletAddress = walletAddress.trim()

    if (!normalizedWalletAddress) {
      setErrorMessage('Enter a wallet address or the demo shortcut')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      await onAuthenticate(normalizedWalletAddress, mode)
      setWalletAddress('')
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Wallet signature failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="presentation">
      <section
        aria-labelledby="auth-modal-title"
        aria-modal="true"
        className="auth-modal-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close wallet authentication"
          className="rules-intro-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className="auth-modal-shell">
          <div className="auth-modal-brand">
            <img src={ARENA_LOGO_SRC} alt="Arena" />
            <div>
              <span className="auth-modal-kicker">Arena</span>
              <h2 id="auth-modal-title">{isSignup ? 'Create wallet session' : 'Sign in with wallet'}</h2>
            </div>
          </div>

          <p className="auth-modal-description">
            {isSignup
              ? 'Arena creates a wallet-backed session by requesting a challenge, collecting a signature, and exchanging it for an access token.'
              : 'Arena signs a challenge with your wallet and exchanges the signature for an authenticated session token.'}
          </p>

          <div className="auth-modal-fields">
            <label>
              Wallet address
              <input
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x..."
                value={walletAddress}
              />
            </label>
            <p className="boundary-note">Enter `demo` to skip wallet signing and enter the full seeded demo session.</p>
            <div className="auth-modal-environment">
              <div className="auth-modal-environment-row">
                <strong>Wallet provider</strong>
                <span>{availability === 'available' ? 'Detected' : availability === 'missing' ? 'Missing' : 'Checking'}</span>
              </div>
              <div className="auth-modal-environment-row">
                <strong>Network</strong>
                <span>
                  {networkStatus === 'supported'
                    ? `Ready for chain ${configuredChainId}`
                    : networkStatus === 'unsupported'
                      ? `Wrong network (${currentChainId ?? 'unknown'}), expected ${configuredChainId}`
                      : 'Arena verifies the chain when a real wallet signs'}
                </span>
              </div>
            </div>
          </div>

          {errorMessage ? <p className="boundary-note">{errorMessage}</p> : null}

          <div className="auth-modal-actions">
            <button className="primary-action" disabled={isSubmitting} onClick={handleSubmit} type="button">
              {isSubmitting
                ? 'Requesting signature...'
                : isSignup
                  ? 'Sign and create session'
                  : 'Sign and continue'}
            </button>
            <button
              className="secondary-action"
              onClick={() => onSwitchMode(isSignup ? 'login' : 'signup')}
              type="button"
            >
              {isSignup ? 'Already have a session? Switch to sign in' : 'Need a fresh session? Switch to sign up'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
