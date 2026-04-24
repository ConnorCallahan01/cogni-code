import { PipelineStatus } from '../lib/api'

interface Props {
  status: PipelineStatus | null
}

export default function StatusBar({ status }: Props) {
  const docker = status?.runtime.docker
  const dockerRunning = docker?.state?.Running === true
  const dockerHealthy = docker?.state?.Health?.Status === 'healthy'
  const codexReady = docker?.codexAuth?.ready === true
  const warningCount = status?.warnings.length ?? 0

  return (
    <div className="status-bar">
      <span className="status-title">Memory Cockpit</span>

      <div className="status-item">
        <span
          className={`status-indicator${dockerRunning ? ' active' : ''}`}
          style={{ background: dockerRunning ? '#34d399' : '#444' }}
        />
        <span>{dockerRunning ? (dockerHealthy ? 'Healthy' : 'Running') : 'Stopped'}</span>
      </div>

      <div className="status-item">
        <span>Project: {status?.activeProject ?? '—'}</span>
      </div>

      <div className="status-item">
        <span>Runtime: {status?.runtime.mode ?? '—'}</span>
      </div>

      <div className="status-item">
        <span>Jobs: {status?.runningJobs ?? 0} running / {status?.failedJobs ?? 0} failed</span>
      </div>

      <div className="status-item">
        <span>Dreams: {status?.pendingDreams ?? 0}</span>
      </div>

      <div className={`status-item${warningCount > 0 ? ' warning' : ''}`}>
        <span>Warnings: {warningCount}</span>
      </div>

      <div className={`status-item${codexReady ? '' : ' warning'}`}>
        <span>Codex: {codexReady ? 'ready' : 'not ready'}</span>
      </div>
    </div>
  )
}
