import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityEvent,
  ArchiveEntry,
  AuditData,
  DeltaSummary,
  DreamsData,
  GraphElement,
  GraphNode,
  LatestBrief,
  PipelineJob,
  PipelineStatus,
  ProjectWorkingFile,
  SessionTraceSummary,
  StartupContext,
  WorkerLogSummary,
  fetchActivity,
  fetchArchive,
  fetchAudit,
  fetchAuditedDeltas,
  fetchDeltas,
  fetchDreams,
  fetchDreamsContext,
  fetchGraph,
  fetchLatestBrief,
  fetchLogs,
  fetchMap,
  fetchPipeline,
  fetchProjectWorkingFiles,
  fetchPriors,
  fetchSessionTraces,
  fetchSoma,
  fetchStartupContext,
  fetchStatus,
  fetchWorking,
  subscribeToEvents,
} from './lib/api'
import ActivityFeed from './components/ActivityFeed'
import DeltaInspector from './components/DeltaInspector'
import GraphView from './components/GraphView'
import KnowledgeView from './components/KnowledgeView'
import LogViewer from './components/LogViewer'
import MorningBriefView from './components/MorningBriefView'
import NodeDetail from './components/NodeDetail'
import NodeList from './components/NodeList'
import OverviewView from './components/OverviewView'
import PipelineCutoffsView from './components/PipelineCutoffsView'
import PipelineView from './components/PipelineView'
import ProjectWorkingFilesView from './components/ProjectWorkingFilesView'
import SessionTraceView from './components/SessionTraceView'
import StartupContextView from './components/StartupContextView'
import StatusBar from './components/StatusBar'

type ViewTab = 'overview' | 'brief' | 'memory' | 'diagnostics' | 'agent' | 'graph'

export default function App() {
  const [view, setView] = useState<ViewTab>('overview')
  const [elements, setElements] = useState<GraphElement[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [startupContext, setStartupContext] = useState<StartupContext | null>(null)
  const [latestBrief, setLatestBrief] = useState<LatestBrief | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [detailVersion, setDetailVersion] = useState(0)
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [deltas, setDeltas] = useState<DeltaSummary[]>([])
  const [dreams, setDreams] = useState<DreamsData | null>(null)
  const [mapContent, setMapContent] = useState('')
  const [priorsContent, setPriorsContent] = useState('')
  const [somaContent, setSomaContent] = useState('')
  const [workingContent, setWorkingContent] = useState('')
  const [dreamsContextContent, setDreamsContextContent] = useState('')
  const [auditedDeltas, setAuditedDeltas] = useState<DeltaSummary[]>([])
  const [auditData, setAuditData] = useState<AuditData>({ brief: null, report: null })
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([])
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJob[]>([])
  const [logs, setLogs] = useState<WorkerLogSummary[]>([])
  const [sessionTraces, setSessionTraces] = useState<SessionTraceSummary[]>([])
  const [projectWorkingFiles, setProjectWorkingFiles] = useState<ProjectWorkingFile[]>([])
  const selectedNodeRef = useRef(selectedNode)
  selectedNodeRef.current = selectedNode

  const loadGraph = useCallback(async () => {
    try {
      const [data, archive] = await Promise.all([fetchGraph(), fetchArchive()])
      setElements(data.elements)
      setNodes(data.elements.filter((el): el is GraphNode => el.group === 'nodes'))
      setArchiveEntries(archive)
    } catch (err) {
      console.error('Failed to load graph:', err)
    }
  }, [])

  const loadKnowledge = useCallback(async () => {
    const [mapResult, priorsResult, somaResult, workingResult, dreamsResult, startupResult, briefResult, projectWorkingResult] = await Promise.allSettled([
      fetchMap(),
      fetchPriors(),
      fetchSoma(),
      fetchWorking(),
      fetchDreamsContext(),
      fetchStartupContext(),
      fetchLatestBrief(),
      fetchProjectWorkingFiles(),
    ])
    setMapContent(mapResult.status === 'fulfilled' ? mapResult.value : '')
    setPriorsContent(priorsResult.status === 'fulfilled' ? priorsResult.value : '')
    setSomaContent(somaResult.status === 'fulfilled' ? somaResult.value : '')
    setWorkingContent(workingResult.status === 'fulfilled' ? workingResult.value : '')
    setDreamsContextContent(dreamsResult.status === 'fulfilled' ? dreamsResult.value : '')
    setStartupContext(startupResult.status === 'fulfilled' ? startupResult.value : null)
    setLatestBrief(briefResult.status === 'fulfilled' ? briefResult.value : null)
    setProjectWorkingFiles(projectWorkingResult.status === 'fulfilled' ? projectWorkingResult.value : [])
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchStatus())
    } catch (err) {
      console.error('Failed to load status:', err)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    try {
      setActivityEvents(await fetchActivity())
    } catch (err) {
      console.error('Failed to load activity:', err)
    }
  }, [])

  const loadChanges = useCallback(async () => {
    try {
      const [deltaResult, dreamsResult, auditedResult, auditResult] = await Promise.all([
        fetchDeltas(),
        fetchDreams(),
        fetchAuditedDeltas(),
        fetchAudit(),
      ])
      setDeltas(deltaResult)
      setDreams(dreamsResult)
      setAuditedDeltas(auditedResult)
      setAuditData(auditResult)
    } catch (err) {
      console.error('Failed to load changes:', err)
    }
  }, [])

  const loadPipeline = useCallback(async () => {
    try {
      const [jobResult, logResult, traceResult] = await Promise.all([
        fetchPipeline(),
        fetchLogs(),
        fetchSessionTraces(),
      ])
      setPipelineJobs(jobResult)
      setLogs(logResult)
      setSessionTraces(traceResult)
    } catch (err) {
      console.error('Failed to load pipeline/logs:', err)
    }
  }, [])

  useEffect(() => {
    loadGraph()
    loadKnowledge()
    loadStatus()
    loadActivity()
    loadChanges()
    loadPipeline()
  }, [loadActivity, loadChanges, loadGraph, loadKnowledge, loadPipeline, loadStatus])

  useEffect(() => {
    const unsub = subscribeToEvents((type) => {
      if (type === 'graph') {
        loadGraph()
        loadKnowledge()
      }
      if (type === 'status') {
        loadStatus()
        loadKnowledge()
      }
      if (type === 'activity') loadActivity()
      if (type === 'deltas') loadChanges()
      if (type === 'pipeline' || type === 'logs') loadPipeline()
      if (type === 'node' && selectedNodeRef.current) {
        setDetailVersion((value) => value + 1)
      }
    })
    return unsub
  }, [loadActivity, loadChanges, loadGraph, loadKnowledge, loadPipeline, loadStatus])

  const renderMainView = () => {
    switch (view) {
      case 'overview':
        return (
          <OverviewView
            status={status}
            latestBrief={latestBrief}
            jobs={pipelineJobs}
            onNavigate={(tab) => setView(tab)}
          />
        )
      case 'brief':
        return (
          <MorningBriefView
            brief={latestBrief}
            onOpenGraphNode={(path) => {
              setSelectedNode(path)
              setView('graph')
            }}
          />
        )
      case 'memory':
        return (
          <div className="split-workspace">
            <div className="workspace-pane wide">
              <div className="memory-stack">
                <StartupContextView context={startupContext} />
                <ProjectWorkingFilesView files={projectWorkingFiles} />
              </div>
            </div>
            <div className="workspace-pane">
              <div className="memory-stack">
                <div className="panel-card">
                  <div className="section-header">
                    <div>
                      <div className="section-title">Memory Layers</div>
                      <div className="section-subtitle">
                        Generated artifacts and distilled memory state.
                      </div>
                    </div>
                  </div>
                  <KnowledgeView
                    mapContent={mapContent}
                    priorsContent={priorsContent}
                    somaContent={somaContent}
                    workingContent={workingContent}
                    dreamsContextContent={dreamsContextContent}
                  />
                </div>
                <div className="panel-card">
                  <div className="section-header">
                    <div>
                      <div className="section-title">Recent Memory Changes</div>
                      <div className="section-subtitle">
                        Deltas, audited changes, and dream fragments for quick auditing.
                      </div>
                    </div>
                  </div>
                  <DeltaInspector
                    deltas={deltas}
                    dreams={dreams}
                    auditedDeltas={auditedDeltas}
                    auditBrief={auditData.brief}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      case 'diagnostics':
        return (
          <div className="split-workspace">
            <div className="workspace-pane wide">
              <div className="memory-stack">
                <div className="panel-card">
                  <div className="section-header">
                    <div>
                      <div className="section-title">Pipeline Cutoffs</div>
                      <div className="section-subtitle">
                        Live counters for when each stage will fire next.
                      </div>
                    </div>
                  </div>
                  <PipelineCutoffsView status={status} />
                </div>
                <div className="panel-card">
                  <div className="section-header">
                    <div>
                      <div className="section-title">Pipeline Diagnostics</div>
                      <div className="section-subtitle">
                        Queue activity, failures, attempts, and active work.
                      </div>
                    </div>
                  </div>
                  <PipelineView jobs={pipelineJobs} />
                </div>
                <div className="panel-card">
                  <div className="section-header">
                    <div>
                      <div className="section-title">Recent Activity</div>
                      <div className="section-subtitle">
                        Hook events and graph lifecycle events.
                      </div>
                    </div>
                  </div>
                  <ActivityFeed events={activityEvents} />
                </div>
              </div>
            </div>
            <div className="workspace-pane">
              <div className="panel-card diagnostics-log-card">
                <div className="section-header">
                  <div>
                    <div className="section-title">Worker Logs</div>
                    <div className="section-subtitle">
                      Full logs for debugging failed or suspicious jobs.
                    </div>
                  </div>
                </div>
                <LogViewer logs={logs} />
              </div>
            </div>
          </div>
        )
      case 'agent':
        return <SessionTraceView traces={sessionTraces} />
      case 'graph':
        return (
          <div className="graph-workspace">
            <NodeList
              nodes={nodes}
              archivedNodes={archiveEntries}
              selectedNode={selectedNode}
              onSelect={setSelectedNode}
            />
            <div className="graph-stage">
              <div className="graph-stage-header">
                <div>
                  <div className="section-title">Graph Explorer</div>
                  <div className="section-subtitle">Deep visualization and node topology drill-down.</div>
                </div>
              </div>
              <GraphView
                elements={elements}
                selectedNode={selectedNode}
                onSelect={setSelectedNode}
              />
            </div>
            <div className="detail-stage">
              <NodeDetail nodePath={selectedNode} version={detailVersion} onNavigate={setSelectedNode} />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="dashboard cockpit-shell">
      <StatusBar status={status} />
      <div className="cockpit-header">
        <div>
          <div className="cockpit-title">Memory Cockpit</div>
          <div className="cockpit-subtitle">
            Operator surface for runtime health, startup context, jobs, and graph memory.
          </div>
        </div>
        <div className="cockpit-tabs">
          {[
            ['overview', 'Overview'],
            ['brief', 'Brief'],
            ['memory', 'Memory'],
            ['diagnostics', 'Diagnostics'],
            ['agent', 'Agent'],
            ['graph', 'Graph'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`cockpit-tab${view === key ? ' active' : ''}`}
              onClick={() => setView(key as ViewTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="cockpit-main">{renderMainView()}</div>
      {view === 'overview' && (
        <div className="cockpit-footer">
          <div className="footer-section">
            <div className="footer-title">Recent Activity</div>
            <ActivityFeed events={activityEvents.slice(-12)} />
          </div>
        </div>
      )}
    </div>
  )
}
