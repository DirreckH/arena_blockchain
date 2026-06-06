import type { ComponentType } from 'react'
import type { LoadState } from '../../features/arena/ops-console-data'
import { opsCopy } from '../../features/arena/ops-copy'
import type {
  BackendRuntimeContractChecklistItemViewModel,
  BackendRuntimeContractCommandSetViewModel,
  BackendRuntimeContractViewModel,
  InternalAuditEventViewModel,
  ValidationChainRuntimeReadinessViewModel,
} from '../../features/arena/internal-ops.types'
import type { ErrorStateKind } from './ops-shared'

type OpsHealthRuntimeContractPanelProps = {
  readiness: { state: LoadState<ValidationChainRuntimeReadinessViewModel>; refresh: () => void }
  contract: { state: LoadState<BackendRuntimeContractViewModel>; refresh: () => void }
  LoadingComponent: ComponentType
  ErrorComponent: ComponentType<{
    kind: ErrorStateKind
    message: string
    onRetry?: () => void
    statusCode?: number | null
  }>
  StringListComponent: ComponentType<{ title: string; items: string[] }>
  CommandSequenceComponent: ComponentType<{ title: string; items: string[] }>
  CommandGroupsComponent: ComponentType<{ commands: BackendRuntimeContractCommandSetViewModel }>
  ChecklistListComponent: ComponentType<{ items: BackendRuntimeContractChecklistItemViewModel[] }>
  AuditListComponent: ComponentType<{
    title: string
    items: InternalAuditEventViewModel[]
    emptyMessage: string
  }>
  formatDate: (value: unknown) => string
}

export function OpsHealthRuntimeContractPanel({
  readiness,
  contract,
  LoadingComponent,
  ErrorComponent,
  StringListComponent,
  CommandSequenceComponent,
  CommandGroupsComponent,
  ChecklistListComponent,
  AuditListComponent,
  formatDate,
}: OpsHealthRuntimeContractPanelProps) {
  return (
    <section className="detail-panel">
      <div className="ops-section">
        <p className="ops-section-title">{opsCopy.runtimeContract.title}</p>
        {readiness.state.status === 'loading' || contract.state.status === 'loading' ? <LoadingComponent /> : null}
        {readiness.state.status === 'error' ? <ErrorComponent kind={readiness.state.kind} message={readiness.state.message} onRetry={readiness.refresh} statusCode={readiness.state.statusCode} /> : null}
        {contract.state.status === 'error' ? <ErrorComponent kind={contract.state.kind} message={contract.state.message} onRetry={contract.refresh} statusCode={contract.state.statusCode} /> : null}
        {readiness.state.status === 'ok' ? (
          <>
            <div className="ops-kv-grid">
              <span className="ops-kv-label">{opsCopy.runtimeContract.readinessKv.readiness}</span><span>{readiness.state.data.status}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.readinessKv.chain}</span><span>{readiness.state.data.chainId}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.readinessKv.validationEnv}</span><span>{readiness.state.data.validationEnvironment}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.readinessKv.runbook}</span><span>{readiness.state.data.runbookPath}</span>
            </div>
            <StringListComponent title={opsCopy.runtimeContract.requiredEnvKeys} items={readiness.state.data.requiredEnvKeys} />
            <StringListComponent title={opsCopy.runtimeContract.optionalEnvKeys} items={readiness.state.data.optionalEnvKeys} />
            <CommandSequenceComponent title={opsCopy.runtimeContract.readinessPreflight} items={readiness.state.data.preflightCommands} />
            <div className="ops-list-stack">
              {readiness.state.data.operatorActions.map((item) => (
                <div className="ops-list-card" key={`${item.dependency}-${item.summary}`}>
                  <strong>{item.dependency}</strong>
                  <p className="ops-muted">{item.summary}</p>
                  <StringListComponent title={opsCopy.runtimeContract.envKeys} items={item.envKeys} />
                  <StringListComponent title={opsCopy.runtimeContract.commands} items={item.commands} />
                </div>
              ))}
            </div>
          </>
        ) : null}
        {contract.state.status === 'ok' ? (
          <>
            <div className="ops-kv-grid" style={{ marginTop: 16 }}>
              <span className="ops-kv-label">{opsCopy.runtimeContract.contractKv.releaseReadiness}</span><span>{contract.state.data.releaseReadiness.status}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.contractKv.gates}</span><span>{contract.state.data.releaseReadiness.completedGateCount}/{contract.state.data.releaseReadiness.totalGateCount}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.contractKv.rehearsal}</span><span>{contract.state.data.validationRehearsal.status}</span>
              <span className="ops-kv-label">{opsCopy.runtimeContract.contractKv.generatedAt}</span><span>{formatDate(contract.state.data.generatedAt)}</span>
            </div>
            <StringListComponent title={opsCopy.runtimeContract.releaseBlockers} items={contract.state.data.releaseReadiness.blockingDependencies} />
            <CommandGroupsComponent commands={contract.state.data.commands} />
            <ChecklistListComponent items={contract.state.data.releaseChecklist} />
            <div className="ops-list-card" style={{ marginTop: 16 }}>
              <strong>{opsCopy.runtimeContract.rehearsalGlobalContract}</strong>
              <div className="ops-kv-grid">
                <span className="ops-kv-label">{opsCopy.runtimeContract.rehearsalKv.status}</span><span>{contract.state.data.validationRehearsal.status}</span>
                <span className="ops-kv-label">{opsCopy.runtimeContract.rehearsalKv.targetOutcome}</span><span>{contract.state.data.validationRehearsal.targetOutcome}</span>
                <span className="ops-kv-label">{opsCopy.runtimeContract.rehearsalKv.runbook}</span><span>{contract.state.data.validationRehearsal.runbookPath}</span>
              </div>
              <StringListComponent title={opsCopy.runtimeContract.blockingDependencies} items={contract.state.data.validationRehearsal.blockingDependencies} />
              <div className="ops-list-stack">
                {contract.state.data.validationRehearsal.steps.map((step) => (
                  <div className="ops-list-card" key={step.id}>
                    <strong>{step.id}</strong>
                    <p className="ops-muted">{step.summary}</p>
                    <CommandSequenceComponent title={opsCopy.runtimeContract.commands} items={step.commands} />
                    <StringListComponent title={opsCopy.runtimeContract.evidence} items={step.evidence} />
                  </div>
                ))}
              </div>
            </div>
            <AuditListComponent
              emptyMessage={opsCopy.runtimeContract.alertsEmpty}
              items={contract.state.data.recentAlerts}
              title={opsCopy.runtimeContract.alertsTitle}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
