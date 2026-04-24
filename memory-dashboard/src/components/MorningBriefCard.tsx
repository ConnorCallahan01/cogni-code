import { LatestBrief } from '../lib/api'

interface Props {
  brief: LatestBrief | null
}

function previewLines(lines: string[] | undefined, limit = 3): string[] {
  return (lines || []).slice(0, limit)
}

export default function MorningBriefCard({ brief }: Props) {
  if (!brief) {
    return (
      <div className="panel-card">
        <div className="section-header">
          <div>
            <div className="section-title">Morning Brief</div>
            <div className="section-subtitle">Daily restart guidance and coaching.</div>
          </div>
        </div>
        <div className="empty-section">No daily brief has been generated yet.</div>
      </div>
    )
  }

  const json = brief.json
  return (
    <div className="panel-card">
      <div className="section-header">
        <div>
          <div className="section-title">Morning Brief</div>
          <div className="section-subtitle">{brief.date} · latest daily restart guidance.</div>
        </div>
      </div>
      <div className="brief-section">
        <div className="brief-section-title">Start Here</div>
        {previewLines(json?.start_here, 3).map((line) => (
          <div key={line} className="brief-line">{line}</div>
        ))}
      </div>
      <div className="brief-section">
        <div className="brief-section-title">Open Loops</div>
        {previewLines(json?.open_loops, 3).map((line) => (
          <div key={line} className="brief-line">{line}</div>
        ))}
      </div>
      <div className="brief-section">
        <div className="brief-section-title">Agent Friction</div>
        {previewLines(json?.agent_friction, 3).map((line) => (
          <div key={line} className="brief-line">{line}</div>
        ))}
      </div>
      {json?.one_thing_today ? (
        <div className="brief-section emphasis">
          <div className="brief-section-title">One Thing Today</div>
          <div className="brief-line">{json.one_thing_today}</div>
        </div>
      ) : null}
    </div>
  )
}
