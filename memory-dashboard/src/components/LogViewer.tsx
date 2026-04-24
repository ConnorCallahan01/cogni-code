import { useEffect, useState } from 'react'
import { WorkerLogDetail, WorkerLogSummary, fetchLogDetail } from '../lib/api'

interface Props {
  logs: WorkerLogSummary[]
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function prettifyStage(value: string | null | undefined): string {
  if (!value) return 'worker'
  return value.replace(/_/g, ' ')
}

export default function LogViewer({ logs }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<WorkerLogDetail | null>(null)

  useEffect(() => {
    if (!selected && logs[0]) {
      setSelected(logs[0].filename)
    }
  }, [logs, selected])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    fetchLogDetail(selected)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selected])

  if (logs.length === 0) {
    return (
      <div className="logs-view">
        <div className="pipeline-empty">No worker logs yet.</div>
      </div>
    )
  }

  return (
    <div className="logs-view">
      <div className="logs-list">
        {logs.map((log) => (
          <div
            key={log.filename}
            className={`log-list-item${selected === log.filename ? ' active' : ''}`}
            onClick={() => setSelected(log.filename)}
          >
            <div className="log-list-name">{prettifyStage(log.parsed?.stage)} · {log.parsed?.model || 'worker'}</div>
            <div className="log-list-subtitle">{log.parsed?.task || log.filename}</div>
            <div className="log-list-meta">
              <span>{(log.size / 1024).toFixed(1)}KB</span>
              <span>{formatTime(log.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="logs-detail">
        {detail ? (
          <>
            <div className="logs-detail-header">
              <span>{prettifyStage(detail.parsed?.stage)} · {detail.parsed?.model || 'worker'}</span>
              <span>{(detail.size / 1024).toFixed(1)}KB</span>
            </div>
            <div className="logs-detail-body">
              <div className="log-detail-sections">
                <div className="log-detail-card">
                  <div className="log-detail-title">Run Info</div>
                  <div className="log-detail-grid">
                    <div><span>Model</span><strong>{detail.parsed?.model || '—'}</strong></div>
                    <div><span>Session</span><strong>{detail.parsed?.sessionId || '—'}</strong></div>
                    <div><span>Sandbox</span><strong>{detail.parsed?.sandbox || '—'}</strong></div>
                    <div><span>Approval</span><strong>{detail.parsed?.approval || '—'}</strong></div>
                  </div>
                </div>
                {detail.parsed?.task ? (
                  <div className="log-detail-card">
                    <div className="log-detail-title">Task</div>
                    <div className="log-detail-text">{detail.parsed.task}</div>
                  </div>
                ) : null}
                {detail.parsed?.codexNotes?.length ? (
                  <div className="log-detail-card">
                    <div className="log-detail-title">Codex Notes</div>
                    <div className="log-detail-list">
                      {detail.parsed.codexNotes.map((note, index) => (
                        <div key={`${note}-${index}`} className="log-detail-line">{note}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.parsed?.recentSteps?.length ? (
                  <div className="log-detail-card">
                    <div className="log-detail-title">Recent Steps</div>
                    <div className="log-detail-list">
                      {detail.parsed.recentSteps.map((step, index) => (
                        <div key={`${step}-${index}`} className="log-detail-line">{step}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <pre className="pipeline-log log-detail-content">{detail.content}</pre>
            </div>
          </>
        ) : (
          <div className="pipeline-empty">Select a log to inspect it.</div>
        )}
      </div>
    </div>
  )
}
