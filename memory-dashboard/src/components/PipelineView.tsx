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

const agentColors: Record<string, string> = {
  scribe: '#a78bfa',
  working_update: '#fbbf24',
  auditor: '#2dd4bf',
  librarian: '#4b82f0',
  dreamer: '#f472b6',
  skillforge: '#fb923c',
  skillforge_refresh: '#f97316',
  memory_analysis: '#38bdf8',
}

function jobContext(job: PipelineJob): string | null {
  const p = job.payload ?? {}
  const project = (p.project as string) || null
  const workingMd = (p.projectWorkingMd as string) || null

  if (job.type === 'scribe') {
    return project && project !== 'global' ? project : null
  }

  if (job.type === 'working_update') {
    if (project && project !== 'global') {
      const mdName = workingMd ? (workingMd.split('/').pop() || workingMd) : `${project.replace('/', '__')}.md`
      return `${project} · ${mdName}`
    }
    return null
  }

  if (job.type === 'auditor' || job.type === 'librarian' || job.type === 'dreamer') {
    return project && project !== 'global' ? project : 'whole graph'
  }

  return project && project !== 'global' ? project : null
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
      {jobs.map((job, i) => {
        const ctx = jobContext(job)
        return (
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
                  {job.type.replace(/_/g, ' ')}
                </span>
                <span className="pipeline-agent-status">
                  {job.displayState}
                </span>
                {ctx && (
                  <span className="pipeline-agent-context">{ctx}</span>
                )}
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
                <div className="pipeline-payload">
                  {Object.entries(job.payload ?? {}).map(([key, val]) => {
                    if (val == null) return null
                    const display = typeof val === 'string'
                      ? (val.length > 80 ? val.slice(0, 77) + '...' : val)
                      : String(val)
                    const filename = typeof val === 'string' ? val.split('/').pop() || val : null
                    return (
                      <div key={key} className="pipeline-payload-row">
                        <span className="pipeline-payload-key">{key}</span>
                        <span className="pipeline-payload-val" title={typeof val === 'string' ? val : undefined}>
                          {filename && filename !== display ? filename : display}
                        </span>
                      </div>
                    )
                  })}
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
        )
      })}
    </div>
  )
}
