import { PipelineStatus } from '../lib/api'

interface Props {
  status: PipelineStatus | null
}

const stageLabels: Record<string, string> = {
  scribe: 'Scribe',
  working_update: 'Working Updater',
  auditor: 'Auditor',
  librarian: 'Librarian',
  dreamer: 'Dreamer',
  memory_analysis: 'Morning Brief',
}

function stageCounter(entry: NonNullable<Props['status']>['pipelineCutoffs'][number]): string {
  if (entry.stage === 'memory_analysis') {
    return entry.status === 'idle' ? 'done' : entry.status === 'ready' ? 'open' : 'scheduled'
  }
  if (entry.stage === 'scribe' && entry.threshold != null) {
    return `${entry.current}/${entry.threshold} msgs`
  }
  if (entry.stage === 'auditor' && entry.threshold != null) {
    return `${entry.current}/${entry.threshold} scribes`
  }
  if (entry.threshold == null) return '—'
  return `${entry.current}/${entry.threshold}`
}

function statusLabel(status: NonNullable<Props['status']>['pipelineCutoffs'][number]['status']): string {
  switch (status) {
    case 'counting':
      return 'Counting'
    case 'ready':
      return 'Ready'
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Blocked'
    case 'idle':
      return 'Idle'
  }
}

export default function PipelineCutoffsView({ status }: Props) {
  if (!status || !status.pipelineCutoffs?.length) {
    return <div className="empty-section">No pipeline cutoff data yet.</div>
  }

  return (
    <div className="cutoff-list">
      {status.pipelineCutoffs.map((entry) => (
        <div key={entry.stage} className={`cutoff-row status-${entry.status}`}>
          <div className="cutoff-main">
            <div className="cutoff-stage">{stageLabels[entry.stage] || entry.stage}</div>
            <div className="cutoff-detail">{entry.detail}</div>
          </div>
          <div className="cutoff-side">
            <div className="cutoff-counter">{stageCounter(entry)}</div>
            <div className="cutoff-status">{statusLabel(entry.status)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
