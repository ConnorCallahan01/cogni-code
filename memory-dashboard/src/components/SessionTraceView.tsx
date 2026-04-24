import { useMemo, useState } from 'react'
import { SessionTraceSummary } from '../lib/api'

interface Props {
  traces: SessionTraceSummary[]
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function classifyAccessKind(toolName: string): string {
  const normalized = toolName.trim().toLowerCase()
  if (!normalized) return 'tool'
  if (normalized.startsWith('mcp__')) return 'mcp'
  if (['read', 'view', 'open', 'cat'].includes(normalized)) return 'read'
  if (['write', 'edit', 'multiedit', 'apply_patch'].includes(normalized)) return 'write'
  if (['grep', 'glob', 'find', 'search'].includes(normalized)) return 'search'
  if (['bash', 'exec', 'exec_command', 'sh', 'shell'].includes(normalized)) return 'execute'
  return 'tool'
}

function getStatusLabel(event: SessionTraceSummary['lastEvents'][number]): string {
  if (event.type === 'assistant_text') return event.kind === 'final' ? 'final' : 'visible'
  if (event.type === 'tool_pre') return 'started'
  if (typeof event.success === 'boolean') return event.success ? 'ok' : 'error'
  return 'finished'
}

function getPrimaryLabel(event: SessionTraceSummary['lastEvents'][number]): string {
  if (event.type === 'assistant_text') return 'assistant'
  return event.toolName || 'tool'
}

function getAccessLabel(event: SessionTraceSummary['lastEvents'][number]): string {
  if (event.type === 'assistant_text') {
    return event.kind === 'final' ? 'final' : 'intermediate'
  }
  return (event.accessKind || classifyAccessKind(event.toolName || '')).toUpperCase()
}

export default function SessionTraceView({ traces }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const selected = useMemo(
    () => traces.find((trace) => trace.sessionId === selectedSessionId) || traces[0] || null,
    [selectedSessionId, traces]
  )
  const orderedEvents = useMemo(
    () => (selected ? [...selected.lastEvents].reverse() : []),
    [selected]
  )

  if (traces.length === 0) {
    return <div className="panel-card">No session traces captured yet.</div>
  }

  return (
    <div className="trace-workspace">
      <div className="trace-list panel-card">
        <div className="section-header">
          <div>
            <div className="section-title">Session Traces</div>
            <div className="section-subtitle">Recent Claude sessions with tool-level history.</div>
          </div>
        </div>
        <div className="trace-session-list">
          {traces.map((trace) => (
            <button
              key={trace.sessionId}
              className={`trace-session-row${selected?.sessionId === trace.sessionId ? ' active' : ''}`}
              onClick={() => setSelectedSessionId(trace.sessionId)}
            >
              <div className="trace-session-head">
                <span>{trace.project}</span>
                <span>{formatTime(trace.updatedAt)}</span>
              </div>
              <div className="trace-session-sub">{trace.tools.join(', ') || 'No tools'}</div>
              <div className="trace-session-sub">{trace.eventCount} events</div>
            </button>
          ))}
        </div>
      </div>

      <div className="trace-detail">
        <div className="panel-card">
          <div className="section-header">
            <div>
              <div className="section-title">Session Detail</div>
              <div className="section-subtitle">
                {selected?.project} · {selected ? formatTime(selected.updatedAt) : '—'}
              </div>
            </div>
          </div>
          {selected ? (
            <>
              <div className="key-value-grid">
                <div className="kv-row"><span>Session</span><span>{selected.sessionId}</span></div>
                <div className="kv-row"><span>CWD</span><span>{selected.cwd || '—'}</span></div>
                <div className="kv-row"><span>Tools</span><span>{selected.tools.join(', ') || '—'}</span></div>
                <div className="kv-row"><span>Targets</span><span>{selected.targets.join(', ') || '—'}</span></div>
              </div>
              <div className="trace-event-list">
                {orderedEvents.map((event, index) => (
                  <div key={`${event.timestamp}-${index}`} className="trace-event-card">
                    <div className="trace-event-head">
                      <span>{event.type === 'assistant_text' ? 'ASSISTANT' : event.type.replace('tool_', '').toUpperCase()}</span>
                      <span>{getPrimaryLabel(event)}</span>
                      <span>{getAccessLabel(event)}</span>
                      <span>{getStatusLabel(event).toUpperCase()}</span>
                    </div>
                    <div className="trace-event-sub">{formatTime(event.timestamp)}</div>
                    {event.text ? (
                      <pre className="trace-preview">{event.text}</pre>
                    ) : null}
                    {event.commandPreview ? (
                      <pre className="trace-preview">{event.commandPreview}</pre>
                    ) : null}
                    {event.targetPaths && event.targetPaths.length > 0 ? (
                      <div className="trace-targets">{event.targetPaths.join(', ')}</div>
                    ) : null}
                    {event.argsPreview ? (
                      <pre className="trace-preview">{JSON.stringify(event.argsPreview, null, 2)}</pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-section">No session selected.</div>
          )}
        </div>
      </div>
    </div>
  )
}
