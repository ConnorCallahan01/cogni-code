import { useMemo, useState } from 'react'
import {
  ActivityEvent,
  DeltaSummary,
  DreamsData,
  PipelineJob,
  SessionTraceSummary,
  WorkerLogSummary,
} from '../lib/api'

type FilterType = 'all' | 'jobs' | 'events' | 'traces' | 'deltas'

interface TimelineEntry {
  id: string
  type: 'job' | 'event' | 'trace' | 'delta'
  timestamp: string
  title: string
  detail?: string
  state?: string
  stateLabel?: string
  meta?: Record<string, string>
  expandedContent?: string
  error?: string
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

interface Props {
  jobs: PipelineJob[]
  logs: WorkerLogSummary[]
  events: ActivityEvent[]
  traces: SessionTraceSummary[]
  deltas: DeltaSummary[]
  auditedDeltas: DeltaSummary[]
  auditBrief: string | null
  dreams: DreamsData | null
}

export default function ActivityView({
  jobs,
  logs,
  events,
  traces,
  deltas,
  auditedDeltas,
  auditBrief,
  dreams,
}: Props) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = []

    for (const job of jobs.slice(0, 20)) {
      const log = logs.find((l) => l.filename === job.logFilename)
      entries.push({
        id: `job-${job.id}`,
        type: 'job',
        timestamp: job.startedAt || job.createdAt,
        title: `${job.type}${job.payload?.project && job.payload.project !== 'global' ? ` (${job.payload.project})` : ''}`,
        state: job.displayState === 'noop' ? 'done' : job.displayState,
        stateLabel: job.displayState,
        detail: job.displayMessage || undefined,
        meta: {
          ...(job.durationMs > 0 ? { duration: formatDuration(job.durationMs) } : {}),
          ...(job.attempt > 1 ? { attempt: `${job.attempt}/${job.maxAttempts}` } : {}),
        },
        expandedContent: job.logTail || undefined,
        error: job.displayState === 'failed' ? job.lastError : undefined,
      })
    }

    for (const event of events.slice(0, 30)) {
      entries.push({
        id: `event-${event.timestamp}-${event.type}`,
        type: 'event',
        timestamp: event.timestamp,
        title: event.type,
        detail: event.message,
      })
    }

    for (const trace of traces.slice(0, 10)) {
      entries.push({
        id: `trace-${trace.sessionId}`,
        type: 'trace',
        timestamp: trace.updatedAt,
        title: `${trace.project || 'global'} session`,
        detail: `${trace.eventCount} events, ${trace.tools.length} tools`,
        meta: {
          session: trace.sessionId.slice(0, 8),
          ...(trace.cwd ? { cwd: trace.cwd.split('/').slice(-2).join('/') } : {}),
        },
      })
    }

    for (const delta of deltas.slice(0, 10)) {
      entries.push({
        id: `delta-${delta.filename}`,
        type: 'delta',
        timestamp: delta.timestamp || '',
        title: `Scribe delta`,
        detail: `${delta.scribes} scribes, ${delta.deltas} deltas`,
        meta: { session: delta.sessionId.slice(0, 8) },
      })
    }

    entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    return entries
  }, [jobs, logs, events, traces, deltas])

  const filtered = filter === 'all' ? timeline : timeline.filter((e) => {
    if (filter === 'jobs') return e.type === 'job'
    if (filter === 'events') return e.type === 'event'
    if (filter === 'traces') return e.type === 'trace'
    if (filter === 'deltas') return e.type === 'delta'
    return true
  })

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="activity-view">
      <div className="activity-filters">
        {([
          ['all', 'All'],
          ['jobs', 'Pipeline'],
          ['events', 'Events'],
          ['traces', 'Sessions'],
          ['deltas', 'Deltas'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`activity-filter${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {auditBrief && (
        <div className="audit-card">
          <div className="audit-card-label">Latest audit</div>
          {auditBrief}
        </div>
      )}

      {dreams && dreams.pending.length > 0 && (
        <div className="dreams-card">
          <div className="dreams-card-label">
            {dreams.pending.length} pending dream{dreams.pending.length > 1 ? 's' : ''}
          </div>
          {dreams.pending.slice(0, 3).map((d, i) => (
            <div key={i} className="dreams-card-text">
              {d.fragment || d.content?.slice(0, 120) || d.filename}
            </div>
          ))}
        </div>
      )}

      {dreams && dreams.pending.length > 0 && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'oklch(97% 0.015 350)',
          border: '1px solid oklch(90% 0.03 350)',
          borderRadius: 'var(--radius)',
          marginBottom: 'var(--space-4)',
        }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'oklch(55% 0.08 350)', marginBottom: 'var(--space-2)' }}>
            {dreams.pending.length} pending dream{dreams.pending.length > 1 ? 's' : ''}
          </div>
          {dreams.pending.slice(0, 3).map((d, i) => (
            <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)', marginBottom: 'var(--space-1)' }}>
              {d.fragment || d.content?.slice(0, 120) || d.filename}
            </div>
          ))}
        </div>
      )}

      <div className="timeline">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="timeline-entry"
            onClick={() => entry.expandedContent && toggleExpanded(entry.id)}
          >
            <div className="timeline-entry-header">
              <span className={`timeline-type ${entry.type}`}>{entry.type}</span>
              {entry.state && (
                <span className={`timeline-state ${entry.state}`}>{entry.stateLabel || entry.state}</span>
              )}
              <span className="timeline-time">{formatTime(entry.timestamp)}</span>
            </div>
            <div className="timeline-title">{entry.title}</div>
            {entry.detail && (
              <div className="timeline-detail">{entry.detail}</div>
            )}
            {entry.error && (
              <div className="timeline-error">{entry.error}</div>
            )}
            {entry.meta && Object.keys(entry.meta).length > 0 && (
              <div className="timeline-meta">
                {Object.entries(entry.meta).map(([k, v]) => (
                  <span key={k}>{k}: {v}</span>
                ))}
              </div>
            )}
            {expanded.has(entry.id) && entry.expandedContent && (
              <div className="timeline-expanded">
                <div className="timeline-log">{entry.expandedContent}</div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-title">No activity</div>
            <div className="empty-sub">Activity will appear here as the pipeline processes sessions.</div>
          </div>
        )}
      </div>
    </div>
  )
}
