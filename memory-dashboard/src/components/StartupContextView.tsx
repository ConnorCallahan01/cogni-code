import { StartupContext } from '../lib/api'

interface Props {
  context: StartupContext | null
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function previewContent(content: string, max = 280, emptyLabel = 'Not loaded'): string {
  const trimmed = content.trim()
  if (!trimmed) return emptyLabel
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export default function StartupContextView({ context }: Props) {
  if (!context) {
    return <div className="panel-card">Loading startup context…</div>
  }

  return (
    <div className="startup-context-view">
      <div className="panel-card">
        <div className="section-header">
          <div>
            <div className="section-title">Claude Startup Context</div>
            <div className="section-subtitle">
              Full injected memory stack for the active project, plus pinned procedures.
            </div>
          </div>
          <div className="context-total-tokens">{context.totalTokens.toLocaleString()} tokens</div>
        </div>
        <div className="startup-context-grid">
          {context.layers.map((layer) => (
            <div key={layer.id} className="context-layer-card">
              <div className="context-layer-header">
                <div>
                  <div className="context-layer-title">{layer.label}</div>
                  <div className="context-layer-subtitle">{layer.subtitle}</div>
                </div>
                <div className="context-layer-meta">
                  <span>{layer.owner}</span>
                  <span>{layer.tokens} tok</span>
                </div>
              </div>
              <div className="context-layer-stats">
                <span>Injected: {layer.injected ? 'yes' : 'no'}</span>
                <span>Updated: {formatTime(layer.updatedAt)}</span>
              </div>
              <pre className="context-layer-preview">
                {previewContent(
                  layer.content,
                  340,
                  layer.id.startsWith('working')
                    ? 'No recent activity for this scope yet.'
                    : 'Not loaded'
                )}
              </pre>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="section-header">
          <div>
            <div className="section-title">Pinned Procedures</div>
            <div className="section-subtitle">
              Pinned nodes injected alongside the generated artifacts.
            </div>
          </div>
          <div className="context-total-tokens">{context.pinnedNodes.length} nodes</div>
        </div>
        {context.pinnedNodes.length === 0 ? (
          <div className="empty-section">
            {context.allPinnedNodeCount === 0
              ? 'No pinned nodes exist in the graph index right now.'
              : `No pinned nodes match the active project (${context.activeProject}).`}
          </div>
        ) : (
          <div className="pinned-node-list">
            {context.pinnedNodes.map((node) => (
              <div key={node.path} className="pinned-node-card">
                <div className="pinned-node-header">
                  <div className="pinned-node-title">{node.title}</div>
                  <div className="pinned-node-tokens">{node.tokens} tok</div>
                </div>
                <div className="pinned-node-path">{node.path}</div>
                <div className="pinned-node-gist">{node.gist || 'No gist'}</div>
                <div className="pinned-node-preview">{previewContent(node.contentPreview, 200)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
