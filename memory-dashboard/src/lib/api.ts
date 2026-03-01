export interface GraphNode {
  group: 'nodes'
  data: {
    id: string
    label: string
    category: string
    gist: string
    confidence: number
    soma_intensity: number
    tags: string[]
    project: string | null
    access_count: number
    updated: string
    last_accessed: string
  }
}

export interface GraphEdge {
  group: 'edges'
  data: {
    id: string
    source: string
    target: string
    weight?: number
    edgeType?: string
    anti?: boolean
    reason?: string
  }
}

export type GraphElement = GraphNode | GraphEdge

export interface GraphData {
  elements: GraphElement[]
  nodeCount: number
}

export interface NodeDetail {
  frontmatter: Record<string, any>
  content: string
  raw: string
  indexEntry?: Record<string, any>
}

export interface PipelineStatus {
  dirty: any | null
  consolidationPending: any | null
  bufferCount: number
  scribePending: number
  nodeCount: number
}

export interface ActivityEvent {
  type: string
  message: string
  details?: Record<string, unknown>
  timestamp: string
}

export interface DeltaSummary {
  filename: string
  sessionId: string
  scribes: number
  deltas: number
  timestamp: string | null
}

export interface DreamEntry {
  filename: string
  bucket: string
  type?: string
  fragment?: string
  content?: string
  confidence?: number
  dream_refs?: string[]
  [key: string]: unknown
}

export interface DreamsData {
  pending: DreamEntry[]
  integrated: DreamEntry[]
  archived: DreamEntry[]
}

export async function fetchActivity(limit = 200): Promise<ActivityEvent[]> {
  const res = await fetch(`/api/activity?limit=${limit}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchDeltas(): Promise<DeltaSummary[]> {
  const res = await fetch('/api/deltas')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchDeltaDetail(sessionId: string): Promise<any> {
  const res = await fetch(`/api/deltas/${sessionId}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchDreams(): Promise<DreamsData> {
  const res = await fetch('/api/dreams')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch('/api/graph')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchNode(path: string): Promise<NodeDetail> {
  const res = await fetch(`/api/node/${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchStatus(): Promise<PipelineStatus> {
  const res = await fetch('/api/status')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchMap(): Promise<string> {
  const res = await fetch('/api/map')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.text()
}

export function subscribeToEvents(onEvent: (type: string) => void): () => void {
  const es = new EventSource('/api/events')
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'connected') {
        // Reconnected — refresh everything
        onEvent('graph')
        onEvent('status')
        return
      }
      onEvent(data.type)
    } catch {}
  }
  return () => es.close()
}
