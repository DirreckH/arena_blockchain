import { Link } from 'react-router-dom'
import { useAuthSession } from '../../features/auth/auth-session'
import { useWalletEnvironment } from '../../features/auth/wallet-environment'
import { useRulesIntro } from './RulesIntroContext'

function describeNetwork(chainId: number | null) {
  if (chainId === null) {
    return '未检测到网络'
  }

  return `已连接 Chain ID ${chainId}`
}

export function WalletStatusCard() {
  const { isAuthenticated, identity, sessionMode, configuredChainId } = useAuthSession()
  const { availability, networkStatus, connectedWalletAddress, currentChainId } = useWalletEnvironment()
  const { openAuthModal } = useRulesIntro()

  const rows = [
    {
      label: '会话',
      value: !isAuthenticated
        ? '匿名'
        : sessionMode === 'demo'
          ? '已激活'
          : '已签名',
      detail: !isAuthenticated
        ? '未连接钱包'
        : identity
          ? `钱包 ${identity.walletAddress}`
          : '认证会话已激活',
    },
    {
      label: '钱包插件',
      value: availability === 'available' ? '已检测到' : availability === 'missing' ? '未检测到' : '检测中',
      detail: availability === 'missing'
        ? '请安装或解锁注入式钱包以使用真实地址签名'
        : connectedWalletAddress
          ? `注入账户 ${connectedWalletAddress}`
          : '需要时可连接钱包',
    },
    {
      label: '网络',
      value: networkStatus === 'supported'
        ? '已支持'
        : networkStatus === 'unsupported'
          ? '网络不匹配'
          : '未知',
      detail: networkStatus === 'unsupported'
        ? `${describeNetwork(currentChainId)}，需要 Chain ID ${configuredChainId}。`
        : networkStatus === 'supported'
          ? `已就绪，Chain ID ${configuredChainId}`
          : '签名时将自动校验链',
    },
  ]

  return (
    <section className="account-menu-panel wallet-status-card">
      <div className="account-menu-panel-head">
        <h2>钱包就绪状态</h2>
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
            连接钱包
          </button>
        ) : (
          <Link className="secondary-action" to="/zh/activity">
            查看账户活动
          </Link>
        )}
      </div>
    </section>
  )
}
