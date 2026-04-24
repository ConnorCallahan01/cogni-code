import { useState } from 'react'
import { DeltaSummary, DreamEntry, DreamsData, fetchDeltaDetail } from '../lib/api'

interface Props {
  deltas: DeltaSummary[]
  dreams: DreamsData | null
  auditedDeltas: DeltaSummary[]
  auditBrief: string | null
}

const DREAM_BUCKET_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  integrated: '#34d399',
  archived: '#64748b',
}

const DELTA_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  create_node: { label: 'CREATE', color: '#34d399', icon: '+' },
  update_stance: { label: 'STANCE', color: '#4b82f0', icon: '~' },
  update_confidence: { label: 'CONF', color: '#22d3ee', icon: '↑' },
  soma_signal: { label: 'SOMA', color: '#f472b6', icon: '⚡' },
  create_edge: { label: 'EDGE', color: '#a78bfa', icon: '→' },
  create_anti_edge: { label: 'ANTI', color: '#ef4444', icon: '⊘' },
}

function getDeltaConfig(type: string) {
  return DELTA_TYPE_CONFIG[type] ?? { label: type.toUpperCase(), color: '#64748b', icon: '?' }
}

function formatDeltaPath(delta: any): string {
  if (delta.path) return delta.path
  if (delta.from && delta.to) return `${delta.from} → ${delta.to}`
  return '—'
}

function formatDeltaDetail(delta: any): string {
  switch (delta.type) {
    case 'create_node':
      return delta.gist || delta.content?.slice(0, 150) || ''
    case 'update_stance':
      return delta.change || delta.content?.slice(0, 150) || ''
    case 'update_confidence': {
      const conf = delta.new_confidence ?? delta.confidence
      const reason = delta.reason || ''
      return conf != null ? `→ ${(conf * 100).toFixed(0)}%${reason ? ' — ' + reason : ''}` : reason
    }
    case 'soma_signal': {
      const parts: string[] = []
      if (delta.valence) parts.push(delta.valence)
      if (delta.intensity != null) parts.push(`intensity ${(delta.intensity * 100).toFixed(0)}%`)
      if (delta.marker) parts.push(delta.marker)
      if (delta.soma) {
        if (delta.soma.valence) parts.push(delta.soma.valence)
        if (delta.soma.intensity != null) parts.push(`intensity ${(delta.soma.intensity * 100).toFixed(0)}%`)
        if (delta.soma.marker) parts.push(delta.soma.marker)
      }
      return parts.join(' · ')
    }
    case 'create_edge':
      return `${delta.edge_type || 'relates_to'}${delta.weight != null ? ` (${delta.weight})` : ''}${delta.reasoning ? ' — ' + delta.reasoning : ''}`
    case 'create_anti_edge':
      return delta.reason || ''
    default:
      return ''
  }
}

interface ParsedDeltaData {
  session_id: string
  started_at?: string
  scribes: Array<{
    scribe_id: string
    summary: string
    completed_at?: string
    deltas: any[]
  }>
}

export default function DeltaInspector({ deltas, dreams, auditedDeltas, auditBrief }: Props) {
  const [expandedDelta, setExpandedDelta] = useState<string | null>(null)
  const [deltaDetail, setDeltaDetail] = useState<ParsedDeltaData | null>(null)

  const handleToggle = async (sessionId: string, audited = false) => {
    const key = audited ? `audited:${sessionId}` : sessionId
    if (expandedDelta === key) {
      setExpandedDelta(null)
      setDeltaDetail(null)
      return
    }
    setExpandedDelta(key)
    try {
      const data = await fetchDeltaDetail(sessionId, audited)
      setDeltaDetail(data)
    } catch {
      setDeltaDetail(null)
    }
  }

  const renderDelta = (delta: any, i: number) => {
    const cfg = getDeltaConfig(delta.type)
    const detail = formatDeltaDetail(delta)
    const nodePath = formatDeltaPath(delta)

    return (
      <div key={i} className="delta-card">
        <div className="delta-card-header">
          <span className="delta-type-badge" style={{ background: cfg.color, color: '#0f1117' }}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="delta-card-path">{nodePath}</span>
          {delta.project && <span className="delta-card-project">{delta.project}</span>}
        </div>
        {delta.title && <div className="delta-card-title">{delta.title}</div>}
        {detail && <div className="delta-card-detail">{detail.slice(0, 200)}</div>}
      </div>
    )
  }

  const renderScribe = (scribe: ParsedDeltaData['scribes'][0]) => (
    <div key={scribe.scribe_id} className="scribe-section">
      {scribe.summary && <div className="scribe-summary">{scribe.summary}</div>}
      <div className="scribe-deltas">
        {(scribe.deltas || []).map((d, i) => renderDelta(d, i))}
      </div>
    </div>
  )

  const renderDream = (dream: DreamEntry) => (
    <div key={dream.filename} className="dream-item">
      <div>
        <span
          className="dream-badge"
          style={{ background: DREAM_BUCKET_COLORS[dream.bucket] ?? '#64748b', color: '#0f1117' }}
        >
          {dream.type ?? dream.bucket}
        </span>
        {dream.confidence != null && (
          <span style={{ color: '#64748b', fontSize: 10 }}>conf {(dream.confidence * 100).toFixed(0)}%</span>
        )}
      </div>
      {(dream.fragment || dream.content) && (
        <div className="dream-text">{(dream.fragment || dream.content || '').slice(0, 200)}</div>
      )}
      {dream.dream_refs && dream.dream_refs.length > 0 && (
        <div className="dream-meta">{dream.dream_refs.length} referenced node{dream.dream_refs.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )

  return (
    <div className="delta-inspector">
      {auditBrief && (
        <>
          <div className="delta-section-title">Audit Brief</div>
          <div className="audit-brief">{auditBrief}</div>
        </>
      )}

      <div className="delta-section-title">Delta Files ({deltas.length})</div>
      {deltas.length === 0 ? (
        <div className="empty-section">No delta files yet</div>
      ) : (
        deltas.map((d) => {
          const key = d.sessionId
          return (
            <div key={d.filename} className="delta-file" onClick={() => handleToggle(d.sessionId)}>
              <div className="delta-file-header">
                <span className="delta-file-id">{d.sessionId.slice(0, 8)}...</span>
                <span className="delta-file-count">{d.deltas} delta{d.deltas !== 1 ? 's' : ''}</span>
              </div>
              {expandedDelta === key && deltaDetail && (
                <div className="delta-file-expanded" onClick={(e) => e.stopPropagation()}>
                  {(deltaDetail.scribes || []).map(renderScribe)}
                </div>
              )}
            </div>
          )
        })
      )}

      {auditedDeltas.length > 0 && (
        <>
          <div className="delta-section-title">Audited Deltas ({auditedDeltas.length})</div>
          {auditedDeltas.map((d) => {
            const key = `audited:${d.sessionId}`
            return (
              <div key={d.filename} className="delta-file audited" onClick={() => handleToggle(d.sessionId, true)}>
                <div className="delta-file-header">
                  <span className="delta-file-id">{d.sessionId.slice(0, 8)}...</span>
                  <span className="delta-file-count">{d.deltas} delta{d.deltas !== 1 ? 's' : ''}</span>
                </div>
                {expandedDelta === key && deltaDetail && (
                  <div className="delta-file-expanded" onClick={(e) => e.stopPropagation()}>
                    {(deltaDetail.scribes || []).map(renderScribe)}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {dreams && (
        <>
          {(['pending', 'integrated', 'archived'] as const).map((bucket) => {
            const items = dreams[bucket] ?? []
            return (
              <div key={bucket}>
                <div className="delta-section-title">
                  Dreams — {bucket} ({items.length})
                </div>
                {items.length === 0 ? (
                  <div className="empty-section">None</div>
                ) : (
                  items.map(renderDream)
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
