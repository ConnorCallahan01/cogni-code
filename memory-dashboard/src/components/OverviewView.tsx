import { PipelineStatus, LatestBrief, PipelineJob } from '../lib/api'

interface Props {
  status: PipelineStatus | null
  latestBrief: LatestBrief | null
  jobs: PipelineJob[]
  onNavigate: (tab: 'brief' | 'memory' | 'diagnostics' | 'agent' | 'graph') => void
}

function formatRuntime(status: PipelineStatus | null): string {
  const docker = status?.runtime.docker
  if (!status) return 'loading'
  if (!docker?.state?.Running) return 'stopped'
  return docker.state?.Health?.Status === 'healthy' ? 'healthy' : 'running'
}

export default function OverviewView({ status, latestBrief, jobs, onNavigate }: Props) {
  const runningJob = jobs.find((job) => job.state === 'running') || null
  const briefStart = latestBrief?.json?.start_here ?? []

  return (
    <div className="overview-view">
      <div className="overview-hero">
        <div className="hero-card">
          <div className="hero-label">Runtime</div>
          <div className="hero-value">{status?.runtime.mode ?? '—'}</div>
          <div className="hero-subvalue">{formatRuntime(status)}</div>
        </div>
        <div className="hero-card">
          <div className="hero-label">Queue</div>
          <div className="hero-value">{status ? `${status.queuedJobs}/${status.runningJobs}` : '—'}</div>
          <div className="hero-subvalue">queued / running</div>
        </div>
        <div className="hero-card">
          <div className="hero-label">Context</div>
          <div className="hero-value">{status?.nodeCount ?? '—'}</div>
          <div className="hero-subvalue">active nodes</div>
        </div>
        <div className="hero-card">
          <div className="hero-label">Warnings</div>
          <div className="hero-value">{status?.warnings.length ?? 0}</div>
          <div className="hero-subvalue">{status?.warnings[0] ?? 'all quiet'}</div>
        </div>
      </div>

      <div className="overview-focus-grid">
        <div className="panel-card">
          <div className="section-header">
            <div>
              <div className="section-title">Start Here</div>
              <div className="section-subtitle">Today’s highest-signal restart guidance.</div>
            </div>
            <button className="link-chip" onClick={() => onNavigate('brief')}>Open Brief</button>
          </div>
          {briefStart.length > 0 ? (
            <div className="brief-list">
              {briefStart.slice(0, 3).map((line) => (
                <div key={line} className="brief-line">{line}</div>
              ))}
            </div>
          ) : (
            <div className="empty-section">No morning brief guidance yet.</div>
          )}
        </div>

        <div className="panel-card">
          <div className="section-header">
            <div>
              <div className="section-title">System Health</div>
              <div className="section-subtitle">Core runtime status without the noise.</div>
            </div>
            <button className="link-chip" onClick={() => onNavigate('diagnostics')}>Open Diagnostics</button>
          </div>
          <div className="key-value-grid">
            <div className="kv-row"><span>Project</span><span>{status?.activeProject ?? '—'}</span></div>
            <div className="kv-row"><span>Container</span><span>{formatRuntime(status)}</span></div>
            <div className="kv-row"><span>Codex auth</span><span>{status?.runtime.docker?.codexAuth?.ready ? 'ready' : 'not ready'}</span></div>
            <div className="kv-row"><span>Failed jobs</span><span>{status?.failedJobs ?? 0}</span></div>
            <div className="kv-row"><span>No-op jobs</span><span>{status?.noopJobs ?? 0}</span></div>
            <div className="kv-row"><span>Dreams</span><span>{status?.pendingDreams ?? 0}</span></div>
          </div>
        </div>

        <div className="panel-card">
          <div className="section-header">
            <div>
              <div className="section-title">Where To Dig</div>
              <div className="section-subtitle">Jump directly into the right surface for the question you have.</div>
            </div>
          </div>
          <div className="overview-links">
            <button className="overview-link-card" onClick={() => onNavigate('brief')}>
              <span>Brief</span>
              <span>Daily guidance, trends, and coaching.</span>
            </button>
            <button className="overview-link-card" onClick={() => onNavigate('memory')}>
              <span>Memory</span>
              <span>Startup context, prompt layers, and recent memory changes.</span>
            </button>
            <button className="overview-link-card" onClick={() => onNavigate('diagnostics')}>
              <span>Diagnostics</span>
              <span>Jobs, logs, failures, and runtime health.</span>
            </button>
            <button className="overview-link-card" onClick={() => onNavigate('agent')}>
              <span>Agent</span>
              <span>Tool-by-tool traces, file targets, and execution path.</span>
            </button>
            <button className="overview-link-card" onClick={() => onNavigate('graph')}>
              <span>Graph</span>
              <span>Deep topology drill-down and node inspection.</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overview-status-strip panel-card">
        <div className="overview-status-item">
          <span>Current job</span>
          <strong>{runningJob ? `${runningJob.type} · ${runningJob.displayState}` : 'idle'}</strong>
        </div>
        <div className="overview-status-item">
          <span>Archive</span>
          <strong>{status?.archiveCount ?? 0} archived</strong>
        </div>
        <div className="overview-status-item">
          <span>Buffer</span>
          <strong>{status?.bufferCount ?? 0} messages</strong>
        </div>
        <div className="overview-status-item">
          <span>Graph root</span>
          <strong>{status?.graphRoot ?? '—'}</strong>
        </div>
      </div>
    </div>
  )
}
