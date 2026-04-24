import { useState } from 'react'
import { PipelineJob } from '../lib/api'

interface Props {
  jobs: PipelineJob[]
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statusColor(job: PipelineJob): string {
  if (job.displayState === 'running') return '#34d399'
  if (job.displayState === 'done') return '#4b82f0'
  if (job.displayState === 'noop') return '#94a3b8'
  if (job.displayState === 'failed') return '#ef4444'
  return '#f59e0b'
}

function statusLabel(job: PipelineJob): string {
  return job.displayState
}

const agentColors: Record<string, string> = {
  scribe: '#a78bfa',
  working_update: '#fbbf24',
  auditor: '#2dd4bf',
  librarian: '#4b82f0',
  dreamer: '#f472b6',
}

export default function PipelineView({ jobs }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  if (jobs.length === 0) {
    return (
      <div className="pipeline-view">
        <div className="pipeline-empty">No pipeline agents have run yet.</div>
      </div>
    )
  }

  return (
    <div className="pipeline-view">
      {jobs.map((job, i) => (
        <div key={job.id} className="pipeline-agent">
          <div
            className="pipeline-agent-header"
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <div className="pipeline-agent-left">
              <span
                className={`pipeline-dot${job.displayState === 'running' ? ' pulse' : ''}`}
                style={{ background: statusColor(job) }}
              />
              <span
                className="pipeline-agent-name"
                style={{ color: agentColors[job.type] || '#e2e8f0' }}
              >
                {job.type}
              </span>
              <span className="pipeline-agent-status">
                {statusLabel(job)}
              </span>
            </div>
            <div className="pipeline-agent-right">
              <span className="pipeline-agent-duration">
                {formatDuration(job.durationMs)}
              </span>
              <span className="pipeline-agent-time">
                {formatTime(job.startedAt)}
              </span>
              <span className="pipeline-expand">
                {expandedIdx === i ? '▾' : '▸'}
              </span>
            </div>
          </div>
          {expandedIdx === i && (
            <div className="pipeline-agent-detail">
              <div className="pipeline-meta">
                <span>state: {job.displayState}</span>
                <span>attempt: {job.attempt}/{job.maxAttempts}</span>
                <span>pid: {job.workerPid ?? '—'}</span>
                <span>trigger: {job.triggerSource}</span>
                <span>log: {(job.logSize / 1024).toFixed(1)}KB</span>
              </div>
              {job.displayMessage && (
                <div className={job.displayState === 'noop' ? 'pipeline-note' : 'pipeline-error'}>
                  {job.displayMessage}
                </div>
              )}
              {job.logTail && (
                <pre className="pipeline-log">{job.logTail}</pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
