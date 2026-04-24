import { ActivityEvent } from '../lib/api'

const TYPE_COLORS: Record<string, string> = {
  session: '#34d399',
  buffer: '#34d399',
  scribe: '#a78bfa',
  auditor: '#2dd4bf',
  librarian: '#4b82f0',
  mechanical: '#4b82f0',
  dreamer: '#f472b6',
  graph: '#f59e0b',
  git: '#22d3ee',
  system: '#64748b',
}

function dotColor(type: string): string {
  const prefix = type.split(':')[0]
  return TYPE_COLORS[prefix] ?? '#64748b'
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '--:--:--'
  }
}

interface Props {
  events: ActivityEvent[]
}

export default function ActivityFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="activity-feed">
        <div className="empty-section" style={{ padding: '20px 16px', textAlign: 'center' }}>
          No activity yet. Events appear when the memory pipeline runs.
        </div>
      </div>
    )
  }

  // Newest first
  const sorted = [...events].reverse()

  return (
    <div className="activity-feed">
      {sorted.map((ev, i) => (
        <div key={i} className="activity-row">
          <div className="activity-dot" style={{ background: dotColor(ev.type) }} />
          <span className="activity-time">{formatTime(ev.timestamp)}</span>
          <span className="activity-msg">{ev.message}</span>
        </div>
      ))}
    </div>
  )
}
