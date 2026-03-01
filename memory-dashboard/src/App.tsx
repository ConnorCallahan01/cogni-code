import { useEffect, useState, useCallback, useRef } from 'react'
import {
  fetchGraph,
  fetchStatus,
  fetchActivity,
  fetchDeltas,
  fetchDreams,
  subscribeToEvents,
  GraphNode,
  GraphElement,
  PipelineStatus,
  ActivityEvent,
  DeltaSummary,
  DreamsData,
} from './lib/api'
import GraphView from './components/GraphView'
import NodeDetail from './components/NodeDetail'
import NodeList from './components/NodeList'
import Legend from './components/Legend'
import StatusBar from './components/StatusBar'
import ActivityFeed from './components/ActivityFeed'
import DeltaInspector from './components/DeltaInspector'

type PanelTab = 'inspect' | 'activity' | 'deltas'

export default function App() {
  const [elements, setElements] = useState<GraphElement[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [detailVersion, setDetailVersion] = useState(0)
  const [panelTab, setPanelTab] = useState<PanelTab>('activity')
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [deltas, setDeltas] = useState<DeltaSummary[]>([])
  const [dreams, setDreams] = useState<DreamsData | null>(null)
  const selectedNodeRef = useRef(selectedNode)
  selectedNodeRef.current = selectedNode

  const loadGraph = useCallback(async () => {
    try {
      const data = await fetchGraph()
      setElements(data.elements)
      setNodes(
        data.elements.filter((el): el is GraphNode => el.group === 'nodes')
      )
    } catch (err) {
      console.error('Failed to load graph:', err)
    }
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

  const loadDeltas = useCallback(async () => {
    try {
      const [d, dr] = await Promise.all([fetchDeltas(), fetchDreams()])
      setDeltas(d)
      setDreams(dr)
    } catch (err) {
      console.error('Failed to load deltas/dreams:', err)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadGraph()
    loadStatus()
    loadActivity()
    loadDeltas()
  }, [loadGraph, loadStatus, loadActivity, loadDeltas])

  // SSE subscription
  useEffect(() => {
    const unsub = subscribeToEvents((type) => {
      if (type === 'graph') loadGraph()
      if (type === 'status') loadStatus()
      if (type === 'activity') loadActivity()
      if (type === 'deltas') loadDeltas()
      if (type === 'node' && selectedNodeRef.current) {
        setDetailVersion((v) => v + 1)
      }
    })
    return unsub
  }, [loadGraph, loadStatus, loadActivity, loadDeltas])

  const handleSelect = useCallback((id: string) => {
    setSelectedNode(id)
    setPanelTab('inspect')
  }, [])

  return (
    <div className="dashboard">
      <StatusBar status={status} />
      <div className="main-content">
        <NodeList
          nodes={nodes}
          selectedNode={selectedNode}
          onSelect={handleSelect}
        />
        <div className="graph-area">
          <Legend />
          <GraphView
            elements={elements}
            selectedNode={selectedNode}
            onSelect={handleSelect}
          />
        </div>
        <div className="right-panel">
          <div className="panel-tabs">
            <div
              className={`panel-tab${panelTab === 'inspect' ? ' active' : ''}`}
              onClick={() => setPanelTab('inspect')}
            >
              Inspect
            </div>
            <div
              className={`panel-tab${panelTab === 'activity' ? ' active' : ''}`}
              onClick={() => setPanelTab('activity')}
            >
              Activity
            </div>
            <div
              className={`panel-tab${panelTab === 'deltas' ? ' active' : ''}`}
              onClick={() => setPanelTab('deltas')}
            >
              Deltas
            </div>
          </div>
          <div className="panel-body">
            {panelTab === 'inspect' && (
              <NodeDetail
                nodePath={selectedNode}
                version={detailVersion}
                onNavigate={handleSelect}
              />
            )}
            {panelTab === 'activity' && (
              <ActivityFeed events={activityEvents} />
            )}
            {panelTab === 'deltas' && (
              <DeltaInspector deltas={deltas} dreams={dreams} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
