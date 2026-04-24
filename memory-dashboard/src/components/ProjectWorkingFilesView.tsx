import { useState } from 'react'
import { ProjectWorkingFile } from '../lib/api'

interface Props {
  files: ProjectWorkingFile[]
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

export default function ProjectWorkingFilesView({ files }: Props) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)

  return (
    <div className="panel-card">
      <div className="section-header">
        <div>
          <div className="section-title">Project WORKING Files</div>
          <div className="section-subtitle">
            Live repo handoffs for every project currently represented under `working/projects/`.
          </div>
        </div>
        <div className="context-total-tokens">{files.length} projects</div>
      </div>
      {files.length === 0 ? (
        <div className="empty-section">No project WORKING files yet.</div>
      ) : (
        <div className="startup-context-grid">
          {files.map((file) => (
            <div
              key={file.slug}
              className={`context-layer-card working-file-card${expandedSlug === file.slug ? ' is-expanded' : ''}`}
            >
              <div className="context-layer-header">
                <div>
                  <div className="context-layer-title">{file.project}</div>
                  <div className="context-layer-subtitle">{file.path}</div>
                </div>
                <div className="context-layer-meta">
                  <span>{file.sessionCount} sessions</span>
                  <span>{formatTime(file.updatedAt)}</span>
                  <button
                    type="button"
                    className="context-layer-action"
                    onClick={() => setExpandedSlug((current) => current === file.slug ? null : file.slug)}
                  >
                    {expandedSlug === file.slug ? 'Collapse' : 'Read Full'}
                  </button>
                </div>
              </div>
              <pre className={`context-layer-preview working-file-preview${expandedSlug === file.slug ? ' is-expanded' : ''}`}>
                {file.content.trim() || 'No project handoff content yet.'}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
