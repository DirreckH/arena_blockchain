import { useOpsAccess } from '../features/arena/ops-console-data'
import { useAuthSession } from '../features/auth/auth-session'
import { OpsWorkspaceView } from './OpsWorkspaceView'

export function OpsConsolePage() {
  const access = useOpsAccess()
  const { openAuthModal } = useAuthSession() as ReturnType<typeof useAuthSession> & {
    openAuthModal?: (mode: string) => void
  }

  if (access.kind === 'unauthenticated') {
    return (
      <div className="ops-gate">
        <h2>运营工作区</h2>
        <p>请登录后访问。</p>
        {openAuthModal ? (
          <button className="ops-btn ops-btn-primary" onClick={() => openAuthModal('login')} type="button">
            登录
          </button>
        ) : null}
      </div>
    )
  }

  if (access.kind === 'forbidden') {
    return (
      <div className="ops-gate">
        <h2>运营工作区</h2>
        <p>需要 operator / admin / system 角色。</p>
      </div>
    )
  }

  return <OpsWorkspaceView token={access.token} />
}
