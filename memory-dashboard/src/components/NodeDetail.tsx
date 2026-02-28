import { useEffect, useState } from 'react'
import { fetchNode, NodeDetail as NodeDetailType } from '../lib/api'

interface Props {
  nodePath: string | null
  version?: number
  onNavigate: (path: string) => void
}

function getCategoryColor(path: string): string {
  const cat = path.split('/')[0]
  const map: Record<string, string> = {
    people: '#34d399',
    projects: '#4b82f0',
    architecture: '#a78bfa',
    patterns: '#f59e0b',
    meta: '#22d3ee',
    dreams: '#f472b6',
  }
  return map[cat] ?? '#64748b'
}

export default function NodeDetail({ nodePath, version, onNavigate }: Props) {
  const [detail, setDetail] = useState<NodeDetailType | null>(null)

  useEffect(() => {
    if (!nodePath) { setDetail(null); return }
    fetchNode(nodePath).then(setDetail).catch(() => setDetail(null))
  }, [nodePath, version])

  if (!nodePath) {
    return (
      <div className="detail-panel">
        <div className="empty-detail">Click a node to inspect</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="detail-panel">
        <div className="empty-detail">Loading...</div>
      </div>
    )
  }

  const fm = detail.frontmatter
  const edges = fm.edges ?? []
  const antiEdges = fm.anti_edges ?? []
  const soma = fm.soma

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-title">{fm.title ?? nodePath.split('/').pop()}</div>
        <div className="detail-path">{nodePath}</div>
      </div>

      <div className="detail-gist">{fm.gist ?? '—'}</div>

      {/* Confidence */}
      <div className="detail-section">
        <div className="detail-section-title">Confidence</div>
        <div className="confidence-bar">
          <div
            className="confidence-fill"
            style={{
              width: `${(fm.confidence ?? 0.5) * 100}%`,
              background: getCategoryColor(nodePath),
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
          {((fm.confidence ?? 0.5) * 100).toFixed(0)}% · decay {fm.decay_rate ?? 0.05}/session
        </div>
      </div>

      {/* Soma */}
      {soma && (
        <div className="detail-section">
          <div className="detail-section-title">Soma Marker</div>
          <div className="soma-marker">
            <span>{soma.valence === 'positive' ? '⚡' : soma.valence === 'negative' ? '⚠️' : '◉'}</span>
            <span>
              {soma.marker ?? 'emotional signal'} — intensity {soma.intensity ?? '?'}
            </span>
          </div>
        </div>
      )}

      {/* Tags */}
      {fm.tags?.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Tags</div>
          <div className="detail-tags">
            {fm.tags.map((t: string) => (
              <span key={t} className="detail-tag">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Edges */}
      {edges.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Edges</div>
          {edges.map((edge: any) => {
            const target = typeof edge === 'string' ? edge : edge.target
            const type = typeof edge === 'string' ? '' : edge.type
            const weight = typeof edge === 'string' ? '' : edge.weight
            return (
              <div
                key={target}
                className="detail-edge"
                onClick={() => onNavigate(target)}
              >
                → {target}
                {type && <span style={{ color: '#64748b' }}> ({type}{weight ? `, w=${weight}` : ''})</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Anti-edges */}
      {antiEdges.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title" style={{ color: '#ef4444' }}>Anti-Edges</div>
          {antiEdges.map((ae: any) => {
            const target = typeof ae === 'string' ? ae : ae.target
            const reason = typeof ae === 'string' ? '' : ae.reason
            return (
              <div
                key={target}
                className="detail-edge"
                onClick={() => onNavigate(target)}
                style={{ color: '#ef4444' }}
              >
                ⊘ {target}
                {reason && <span style={{ color: '#9ca3af' }}> ({reason})</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Meta */}
      <div className="detail-section">
        <div className="detail-section-title">Metadata</div>
        <div className="detail-meta">
          {fm.project && <div>Project: {fm.project}</div>}
          <div>Created: {fm.created ?? '—'}</div>
          <div>Updated: {fm.updated ?? '—'}</div>
          <div>Last accessed: {fm.last_accessed ?? '—'}</div>
          <div>Access count: {fm.access_count ?? 0}</div>
        </div>
      </div>

      {/* Body content */}
      {detail.content && (
        <div className="detail-section">
          <div className="detail-section-title">Content</div>
          <div className="detail-content">{detail.content}</div>
        </div>
      )}
    </div>
  )
}
