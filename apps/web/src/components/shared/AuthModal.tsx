import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { ARENA_LOGO_SRC } from '../../features/app-shell/navigation-contract'

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
      setErrorMessage('请输入钱包地址')
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
        setErrorMessage('钱包签名失败')
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
          aria-label="关闭钱包认证"
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
              <h2 id="auth-modal-title">{isSignup ? '创建钱包会话' : '钱包登录'}</h2>
            </div>
          </div>

          <p className="auth-modal-description">
            {isSignup
              ? '使用钱包签名 Arena 的认证挑战，建立绑定该地址的会话。'
              : '使用钱包签名 Arena 的认证挑战，恢复绑定该地址的会话。'}
          </p>

          <div className="auth-modal-fields">
            <label>
              钱包地址
              <input
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x..."
                value={walletAddress}
              />
            </label>
            <div className="auth-modal-environment">
              <div className="auth-modal-environment-row">
                <strong>钱包插件</strong>
                <span>{availability === 'available' ? '已检测到' : availability === 'missing' ? '未检测到' : '检测中'}</span>
              </div>
              <div className="auth-modal-environment-row">
                <strong>网络</strong>
                <span>
                  {networkStatus === 'supported'
                    ? `Chain ${configuredChainId} 就绪`
                    : networkStatus === 'unsupported'
                      ? `网络不匹配（当前 ${currentChainId ?? '未知'}，需要 ${configuredChainId}）`
                      : '签名时将自动校验链'}
                </span>
              </div>
            </div>
          </div>

          {errorMessage ? <p className="boundary-note">{errorMessage}</p> : null}

          <div className="auth-modal-actions">
            <button className="primary-action" disabled={isSubmitting} onClick={handleSubmit} type="button">
              {isSubmitting
                ? '请求签名中...'
                : isSignup
                  ? '签名并创建会话'
                  : '签名并继续'}
            </button>
            <button
              className="secondary-action"
              onClick={() => onSwitchMode(isSignup ? 'login' : 'signup')}
              type="button"
            >
              {isSignup ? '已有会话？切换到登录' : '需要新建会话？切换到注册'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
