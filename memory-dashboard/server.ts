import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { watch } from 'chokidar'
import matter from 'gray-matter'

const app = express()
const PORT = 3001
const GRAPH_ROOT = join(homedir(), '.graph-memory')

app.use(cors({ origin: 'http://localhost:5173' }))

// --- Helpers ---

function readIndex() {
  const indexPath = join(GRAPH_ROOT, '.index.json')
  if (!existsSync(indexPath)) return []
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8'))
  } catch {
    return []
  }
}

function readNodeFile(nodePath: string) {
  const nodesDir = join(GRAPH_ROOT, 'nodes')
  const fullPath = resolve(nodesDir, nodePath.endsWith('.md') ? nodePath : `${nodePath}.md`)
  // Path traversal protection
  if (!fullPath.startsWith(nodesDir)) return null
  if (!existsSync(fullPath)) return null
  const raw = readFileSync(fullPath, 'utf-8')
  const { data, content } = matter(raw)
  return { frontmatter: data, content: content.trim(), raw }
}

function safeJsonParse(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function countFilesInDir(dir: string): number {
  if (!existsSync(dir)) return 0
  return readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.md') || String(f).endsWith('.json'))
    .length
}

// --- Routes ---

// Full graph for Cytoscape
app.get('/api/graph', (_req, res) => {
  try {
    const index = readIndex()
    const cytoscapeElements: any[] = []

    for (const node of index) {
      cytoscapeElements.push({
        group: 'nodes',
        data: {
          id: node.path,
          label: node.path.split('/').pop(),
          category: node.path.split('/')[0],
          gist: node.gist,
          confidence: node.confidence ?? 0.5,
          soma_intensity: node.soma_intensity ?? 0,
          tags: node.tags ?? [],
          project: node.project ?? null,
          access_count: node.access_count ?? 0,
          updated: node.updated,
          last_accessed: node.last_accessed,
        },
      })
    }

    // Collect edges from index
    for (const node of index) {
      const edges = node.edges ?? []
      for (const edge of edges) {
        const target = typeof edge === 'string' ? edge : edge.target
        const weight = typeof edge === 'string' ? 0.5 : (edge.weight ?? 0.5)
        const type = typeof edge === 'string' ? 'relates_to' : (edge.type ?? 'relates_to')
        // Only add edge if target exists in index
        if (index.some((n: any) => n.path === target)) {
          cytoscapeElements.push({
            group: 'edges',
            data: {
              id: `${node.path}->${target}`,
              source: node.path,
              target: target,
              weight,
              edgeType: type,
            },
          })
        }
      }

      // Anti-edges
      const antiEdges = node.anti_edges ?? []
      for (const ae of antiEdges) {
        const target = typeof ae === 'string' ? ae : ae.target
        if (target && index.some((n: any) => n.path === target)) {
          cytoscapeElements.push({
            group: 'edges',
            data: {
              id: `${node.path}-x->${target}`,
              source: node.path,
              target: target,
              anti: true,
              reason: typeof ae === 'string' ? '' : ae.reason || '',
            },
          })
        }
      }
    }

    res.json({ elements: cytoscapeElements, nodeCount: index.length })
  } catch (err) {
    console.error('Error in /api/graph:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Full node detail
app.get('/api/node/:path(*)', (req, res) => {
  try {
    const nodePath = req.params.path
    const node = readNodeFile(nodePath)
    if (!node) return res.status(404).json({ error: 'Node not found' })

    // Also get index entry for extra metadata
    const index = readIndex()
    const indexEntry = index.find((n: any) => n.path === nodePath)

    res.json({ ...node, indexEntry })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Pipeline status
app.get('/api/status', (_req, res) => {
  try {
    const dirtyPath = join(GRAPH_ROOT, '.dirty-session')
    const consolidationPath = join(GRAPH_ROOT, '.consolidation-pending')
    const bufferDir = join(GRAPH_ROOT, '.buffer')
    const scribePendingPath = join(GRAPH_ROOT, '.scribe-pending')

    const dirty = existsSync(dirtyPath) ? safeJsonParse(dirtyPath) : null
    const consolidationPending = existsSync(consolidationPath) ? safeJsonParse(consolidationPath) : null

    // Count actual messages in conversation.jsonl (not file count)
    const conversationLog = join(bufferDir, 'conversation.jsonl')
    let bufferCount = 0
    if (existsSync(conversationLog)) {
      const content = readFileSync(conversationLog, 'utf-8').trim()
      bufferCount = content ? content.split('\n').filter(Boolean).length : 0
    }

    const scribePending = existsSync(scribePendingPath) ? 1 : 0

    const index = readIndex()

    res.json({
      dirty,
      consolidationPending,
      bufferCount,
      scribePending,
      nodeCount: index.length,
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Activity feed — last N events from JSONL log
app.get('/api/activity', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000)
    const logPath = join(GRAPH_ROOT, '.logs', 'activity.jsonl')
    if (!existsSync(logPath)) return res.json([])
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean)
    const tail = lines.slice(-limit)
    const events = tail.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    res.json(events)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delta files listing
app.get('/api/deltas', (_req, res) => {
  try {
    const deltasDir = join(GRAPH_ROOT, '.deltas')
    if (!existsSync(deltasDir)) return res.json([])
    const files = readdirSync(deltasDir).filter((f) => f.endsWith('.json'))
    const summaries = files.map((f) => {
      const data = safeJsonParse(join(deltasDir, f))
      if (!data) return null
      return {
        filename: f,
        sessionId: data.sessionId ?? f.replace('.json', ''),
        scribes: Array.isArray(data.scribes) ? data.scribes.length : 0,
        deltas: Array.isArray(data.deltas) ? data.deltas.length : (Array.isArray(data.scribes) ? data.scribes.reduce((n: number, s: any) => n + (s.deltas?.length ?? 0), 0) : 0),
        timestamp: data.timestamp ?? data.created ?? null,
      }
    }).filter(Boolean)
    res.json(summaries)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Single delta file detail
app.get('/api/deltas/:sessionId', (req, res) => {
  try {
    const deltasDir = join(GRAPH_ROOT, '.deltas')
    const filePath = join(deltasDir, `${req.params.sessionId}.json`)
    const resolved = resolve(filePath)
    if (!resolved.startsWith(resolve(deltasDir))) return res.status(403).json({ error: 'Forbidden' })
    if (!existsSync(resolved)) return res.status(404).json({ error: 'Not found' })
    res.json(safeJsonParse(resolved))
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Dreams listing grouped by bucket
app.get('/api/dreams', (_req, res) => {
  try {
    const dreamsDir = join(GRAPH_ROOT, 'dreams')
    const buckets = ['pending', 'integrated', 'archived']
    const result: Record<string, any[]> = {}
    for (const bucket of buckets) {
      const dir = join(dreamsDir, bucket)
      if (!existsSync(dir)) { result[bucket] = []; continue }
      const files = readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.md'))
      result[bucket] = files.map((f) => {
        if (f.endsWith('.json')) {
          const data = safeJsonParse(join(dir, f))
          return data ? { filename: f, bucket, ...data } : { filename: f, bucket }
        }
        const raw = readFileSync(join(dir, f), 'utf-8')
        const { data, content } = matter(raw)
        return { filename: f, bucket, ...data, content: content.trim().slice(0, 500) }
      })
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Raw MAP.md
app.get('/api/map', (_req, res) => {
  try {
    const mapPath = join(GRAPH_ROOT, 'MAP.md')
    if (!existsSync(mapPath)) return res.status(404).json({ error: 'MAP.md not found' })
    res.type('text/plain').send(readFileSync(mapPath, 'utf-8'))
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// --- SSE for real-time updates ---

const clients = new Set<express.Response>()
let debounceTimer: ReturnType<typeof setTimeout> | null = null

app.get('/api/events', (_req, res) => {
  if (clients.size >= 20) {
    res.status(503).json({ error: 'Too many connections' })
    return
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('data: {"type":"connected"}\n\n')
  clients.add(res)
  _req.on('close', () => clients.delete(res))
})

function broadcast(type: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const msg = `data: ${JSON.stringify({ type })}\n\n`
    for (const client of clients) {
      client.write(msg)
    }
  }, 500)
}

// Watch graph-memory for changes
const watcher = watch(GRAPH_ROOT, {
  ignoreInitial: true,
  ignored: /(^|[\/\\])\.git(\/|$)/,
  depth: 4,
})

watcher
  .on('add', (path) => {
    if (path.includes('activity.jsonl')) {
      broadcast('activity')
    } else if (path.includes('.deltas/') || path.includes('dreams/')) {
      broadcast('deltas')
    } else if (path.includes('.dirty-session') || path.includes('.consolidation-pending') || path.includes('.scribe-pending')) {
      broadcast('status')
    } else if (path.endsWith('.md') || path.endsWith('.json')) {
      broadcast('graph')
    }
  })
  .on('change', (path) => {
    if (path.includes('activity.jsonl')) {
      broadcast('activity')
    } else if (path.includes('.deltas/') || path.includes('dreams/')) {
      broadcast('deltas')
    } else if (path.includes('.index.json') || path.includes('MAP.md')) {
      broadcast('graph')
    } else if (path.includes('.dirty-session') || path.includes('.consolidation-pending')) {
      broadcast('status')
    } else if (path.endsWith('.md')) {
      broadcast('node')
    }
  })
  .on('unlink', (path) => {
    if (path.includes('.deltas/') || path.includes('dreams/')) {
      broadcast('deltas')
    } else if (path.includes('.dirty-session') || path.includes('.consolidation-pending') || path.includes('.scribe-pending')) {
      broadcast('status')
    } else if (path.endsWith('.md')) {
      broadcast('graph')
    }
  })

app.listen(PORT, () => {
  console.log(`Memory API running on http://localhost:${PORT}`)
})
