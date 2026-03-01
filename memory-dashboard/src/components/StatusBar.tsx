import { PipelineStatus } from '../lib/api'

interface Props {
  status: PipelineStatus | null
}

export default function StatusBar({ status }: Props) {
  return (
    <div className="status-bar">
      <span className="status-title">Memory Dashboard</span>

      <div className="status-item">
        <span className="status-indicator" style={{ background: '#34d399' }} />
        <span>Nodes: {status?.nodeCount ?? '—'}</span>
      </div>

      <div className="status-item">
        <span
          className={`status-indicator${status?.dirty ? ' active' : ''}`}
          style={{ background: status?.dirty ? '#34d399' : '#333' }}
        />
        <span>Dirty: {status?.dirty ? 'yes' : 'no'}</span>
      </div>

      <div className="status-item">
        <span
          className={`status-indicator${status?.scribePending ? ' active' : ''}`}
          style={{ background: status?.scribePending ? '#a78bfa' : '#333' }}
        />
        <span>Scribe: {status?.scribePending ?? 0}</span>
      </div>

      <div className="status-item">
        <span
          className={`status-indicator${status?.consolidationPending ? ' active' : ''}`}
          style={{ background: status?.consolidationPending ? '#f59e0b' : '#333' }}
        />
        <span>Consolidation: {status?.consolidationPending ? 'pending' : 'idle'}</span>
      </div>

      <div className="status-item">
        <span>Buffer: {status?.bufferCount ?? 0}/10</span>
      </div>
    </div>
  )
}
