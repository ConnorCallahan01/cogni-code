import { Fragment, ReactNode, useMemo, useState } from 'react'
import { LatestBrief } from '../lib/api'

interface Props {
  brief: LatestBrief | null
  onOpenGraphNode?: (path: string) => void
}

function renderLines(lines: string[] | undefined, onOpenGraphNode?: (path: string) => void) {
  if (!lines || lines.length === 0) return <div className="empty-section">No entries.</div>
  return (
    <div className="brief-list">
      {lines.map((line) => (
        <div key={line} className="brief-line">{renderInline(line, onOpenGraphNode)}</div>
      ))}
    </div>
  )
}

function renderCodeBlocks(blocks: string[] | undefined) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="brief-code-blocks">
      {blocks.map((block, index) => (
        <pre key={`${block}-${index}`} className="brief-code-block">{block}</pre>
      ))}
    </div>
  )
}

function renderInline(text: string, onOpenGraphNode?: (path: string) => void): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>)
    }

    if (match[2] && match[3]) {
      const label = match[2]
      const href = match[3]
      if (href.startsWith('graph://') && onOpenGraphNode) {
        const path = href.replace(/^graph:\/\//, '')
        parts.push(
          <button
            key={`graph-${match.index}`}
            className="inline-graph-link"
            onClick={() => onOpenGraphNode(path)}
          >
            {label}
          </button>
        )
      } else {
        parts.push(
          <a
            key={`link-${match.index}`}
            className="inline-link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>
        )
      }
    } else if (match[4]) {
      parts.push(<code key={`code-${match.index}`} className="inline-code">{match[4]}</code>)
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>)
  }

  return parts
}

function renderMarkdown(markdown: string, onOpenGraphNode?: (path: string) => void) {
  const lines = markdown
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed || !/\d+\.\s/.test(trimmed)) return [line]
      if (/^\d+\.\s/.test(trimmed) && !/\s\d+\.\s/.test(trimmed)) return [line]

      const parts = trimmed.split(/(?=\d+\.\s)/g).map((part) => part.trim()).filter(Boolean)
      return parts.length > 1 ? parts : [line]
    })
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(<h1 key={`h1-${index}`} className="brief-h1">{trimmed.slice(2)}</h1>)
      index += 1
      continue
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(<h2 key={`h2-${index}`} className="brief-h2">{trimmed.slice(3)}</h2>)
      index += 1
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(<h3 key={`h3-${index}`} className="brief-h3">{trimmed.slice(4)}</h3>)
      index += 1
      continue
    }

    if (trimmed.includes('|')) {
      const tableLines: string[] = []
      while (index < lines.length && lines[index].trim().includes('|')) {
        tableLines.push(lines[index].trim())
        index += 1
      }

      const rows = tableLines
        .map((row) => row.trim())
        .filter((row) => row && !/^[:|\-\s]+$/.test(row))
        .map((row) => row.split('|').map((cell) => cell.trim()).filter(Boolean))
        .filter((cells) => cells.length > 0)

      if (rows.length > 0) {
        blocks.push(
          <div key={`table-${index}`} className="brief-table-wrap">
            <table className="brief-table">
              <tbody>
                {rows.map((cells, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {cells.map((cell, cellIndex) => (
                      <td key={`cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, onOpenGraphNode)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    if (trimmed.startsWith('```')) {
      const fence = trimmed
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && lines[index].trim() !== fence) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre key={`codeblock-${index}`} className="brief-code-block">
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    if (trimmed.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2))
        index += 1
      }
      blocks.push(
        <ul key={`ul-${index}`} className="brief-markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item, onOpenGraphNode)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index].trim()
        if (!current) break
        if (!/^\d+\.\s/.test(current)) break
        items.push(current.replace(/^\d+\.\s/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ol-${index}`} className="brief-markdown-list brief-markdown-ordered">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item, onOpenGraphNode)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (!current || current.startsWith('#') || current.startsWith('- ') || /^\d+\.\s/.test(current)) break
      paragraphLines.push(current)
      index += 1
    }
    blocks.push(
      <p key={`p-${index}`} className="brief-paragraph">
        {renderInline(paragraphLines.join(' '), onOpenGraphNode)}
      </p>
    )
  }

  return blocks
}

function downloadBriefMarkdown(brief: LatestBrief) {
  const blob = new Blob([brief.markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `morning-brief-${brief.date}.md`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function printBrief(brief: LatestBrief) {
  const printable = document.querySelector('.brief-markdown')?.innerHTML || ''
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Morning Brief ${brief.date}</title>
        <style>
          body {
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 40px;
            color: #0f172a;
            background: #ffffff;
            line-height: 1.6;
          }
          main {
            max-width: 860px;
            margin: 0 auto;
          }
          h1 {
            font-size: 32px;
            line-height: 1.15;
            margin: 0 0 10px;
          }
          h2 {
            font-size: 16px;
            margin: 28px 0 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          h3 {
            font-size: 14px;
            margin: 20px 0 8px;
          }
          p, li {
            font-size: 14px;
          }
          ul {
            padding-left: 20px;
          }
          code {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            border-radius: 6px;
            padding: 1px 5px;
          }
          pre {
            background: #0f172a;
            color: #e2e8f0;
            border-radius: 10px;
            padding: 16px;
            white-space: pre-wrap;
            word-break: break-word;
            overflow: hidden;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 16px;
          }
          td {
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
            vertical-align: top;
          }
          .meta {
            color: #475569;
            margin-bottom: 18px;
          }
        </style>
      </head>
      <body>
        <main>
          <div class="meta">${brief.date} · daily restart guidance and coaching.</div>
          ${printable}
        </main>
      </body>
    </html>
  `

  doc.open()
  doc.write(html)
  doc.close()

  const triggerPrint = () => {
    const win = iframe.contentWindow
    if (!win) return
    win.focus()
    win.print()
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  window.setTimeout(triggerPrint, 250)
}

export default function MorningBriefView({ brief, onOpenGraphNode }: Props) {
  const [showFullBrief, setShowFullBrief] = useState(false)
  const [showProjectDetails, setShowProjectDetails] = useState(false)

  if (!brief) {
    return <div className="panel-card">No morning brief has been generated yet.</div>
  }

  const json = brief.json
  const projectBreakdown = json?.project_breakdown
  const briefMeta = useMemo(() => {
    const activeProjects = projectBreakdown?.length || 0
    const openLoops = json?.open_loops?.length || 0
    const frictionCount = json?.agent_friction?.length || 0
    return { activeProjects, openLoops, frictionCount }
  }, [json, projectBreakdown])

  return (
    <div className="brief-view">
      <div className="memory-stack">
        <div className="panel-card brief-hero-card">
          <div className="section-header">
            <div>
              <div className="section-title">Morning Brief</div>
              <div className="section-subtitle">{brief.date} · daily restart guidance and coaching.</div>
            </div>
            <div className="brief-actions">
              <button
                className="brief-action-button"
                onClick={() => setShowFullBrief((value) => !value)}
              >
                {showFullBrief ? 'Hide full brief' : 'Show full brief'}
              </button>
              <button className="brief-action-button" onClick={() => downloadBriefMarkdown(brief)}>
                Download .md
              </button>
              <button className="brief-action-button primary" onClick={() => printBrief(brief)}>
                Print / Save PDF
              </button>
            </div>
          </div>
          <div className="brief-meta-strip">
            <div className="brief-meta-pill">{briefMeta.activeProjects || 1} project{briefMeta.activeProjects === 1 ? '' : 's'}</div>
            <div className="brief-meta-pill">{briefMeta.openLoops} open loop{briefMeta.openLoops === 1 ? '' : 's'}</div>
            <div className="brief-meta-pill">{briefMeta.frictionCount} friction point{briefMeta.frictionCount === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div className="panel-card brief-article-card">
          <div className="section-header">
            <div>
              <div className="section-title">Practice Focus</div>
              <div className="section-subtitle">The single highest-leverage improvement from this brief.</div>
            </div>
          </div>
          {json?.one_thing_today ? (
            <div className="brief-focus-text">{renderInline(json.one_thing_today, onOpenGraphNode)}</div>
          ) : (
            <div className="empty-section">No single coaching focus was generated for this brief.</div>
          )}
        </div>

        <div className="brief-grid">
          <div className="panel-card">
            <div className="section-title">Start Here</div>
            {renderLines((json?.start_here || []).slice(0, 3), onOpenGraphNode)}
          </div>
          <div className="panel-card">
            <div className="section-title">Open Loops</div>
            {renderLines((json?.open_loops || []).slice(0, 4), onOpenGraphNode)}
          </div>
          <div className="panel-card">
            <div className="section-title">Agent Friction</div>
            {renderLines((json?.agent_friction || []).slice(0, 3), onOpenGraphNode)}
          </div>
          <div className="panel-card">
            <div className="section-title">Suggested CLAUDE.md Updates</div>
            {renderLines((json?.suggested_claude_updates || []).slice(0, 3), onOpenGraphNode)}
          </div>
        </div>

        {showFullBrief ? (
          <div className="panel-card brief-article-card">
            <div className="section-header">
              <div>
                <div className="section-title">Full Brief</div>
                <div className="section-subtitle">Complete generated markdown for deeper review.</div>
              </div>
            </div>
            <div className="brief-markdown">
              {renderMarkdown(brief.markdown, onOpenGraphNode)}
            </div>
          </div>
        ) : null}

        {projectBreakdown && projectBreakdown.length > 0 ? (
          <div className="panel-card">
            <div className="section-header">
              <div>
                <div className="section-title">Project Details</div>
                <div className="section-subtitle">Repo-specific loops, friction, and CLAUDE.md guidance when you want to dig deeper.</div>
              </div>
              <button
                className="brief-action-button"
                onClick={() => setShowProjectDetails((value) => !value)}
              >
                {showProjectDetails ? 'Hide project details' : 'Show project details'}
              </button>
            </div>
            <div className="project-brief-summary">
              {projectBreakdown.map((entry) => {
                const openLoopCount = entry.open_loops?.length || 0
                const frictionCount = entry.agent_friction?.length || 0
                const claudeUpdateCount = entry.suggested_claude_updates?.length || entry.suggested_claude_update_blocks?.length || 0
                return (
                  <div key={`summary-${entry.project}`} className="project-summary-card">
                    <div className="project-summary-head">
                      <div className="project-brief-title">{entry.project}</div>
                    </div>
                    <div className="project-summary-pills">
                      <span className="brief-meta-pill">{openLoopCount} open loop{openLoopCount === 1 ? '' : 's'}</span>
                      <span className="brief-meta-pill">{frictionCount} friction point{frictionCount === 1 ? '' : 's'}</span>
                      <span className="brief-meta-pill">{claudeUpdateCount} CLAUDE.md update{claudeUpdateCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {showProjectDetails ? (
              <div className="project-brief-grid">
                {projectBreakdown.map((entry) => (
                  <div key={entry.project} className="project-brief-card">
                    <div className="project-brief-title">{entry.project}</div>
                    {entry.claude_file_path ? (
                      <div className="project-brief-path">{entry.claude_file_path}</div>
                    ) : null}
                    <div className="project-brief-section">
                      <div className="project-brief-label">Yesterday</div>
                      {renderLines(entry.yesterday, onOpenGraphNode)}
                    </div>
                    <div className="project-brief-section">
                      <div className="project-brief-label">Open Loops</div>
                      {renderLines(entry.open_loops, onOpenGraphNode)}
                    </div>
                    <div className="project-brief-section">
                      <div className="project-brief-label">Agent Friction</div>
                      {renderLines(entry.agent_friction, onOpenGraphNode)}
                    </div>
                    <div className="project-brief-section">
                      <div className="project-brief-label">CLAUDE.md Updates</div>
                      {renderLines(entry.suggested_claude_updates, onOpenGraphNode)}
                      {renderCodeBlocks(entry.suggested_claude_update_blocks)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
