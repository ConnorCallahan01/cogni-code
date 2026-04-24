import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
import cise from 'cytoscape-cise'
import { GraphElement } from '../lib/api'

cytoscape.use(cise)

const CATEGORY_COLORS: Record<string, string> = {
  people: '#34d399',
  projects: '#4b82f0',
  architecture: '#a78bfa',
  patterns: '#f59e0b',
  meta: '#22d3ee',
  dreams: '#f472b6',
  concepts: '#e879f9',
  decisions: '#818cf8',
  preferences: '#f9a8d4',
  insight: '#67e8f9',
}

interface Props {
  elements: GraphElement[]
  selectedNode: string | null
  onSelect: (id: string) => void
}

export default function GraphView({ elements, selectedNode, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const initializedRef = useRef(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; gist: string } | null>(null)

  // Initialize Cytoscape once
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) =>
              CATEGORY_COLORS[ele.data('category')] ?? '#64748b',
            opacity: (ele: any) => {
              const confidence = ele.data('confidence') ?? 0.5
              const lastAccessed = ele.data('last_accessed')
              let staleFactor = 1
              if (lastAccessed) {
                const days = (Date.now() - new Date(lastAccessed).getTime()) / 86400000
                staleFactor = Math.max(0.5, 1 - days / 60)
              }
              return Math.max(0.3, (0.35 + confidence * 0.65) * staleFactor)
            },
            width: (ele: any) => {
              const confidence = ele.data('confidence') ?? 0.5
              const degree = ele.degree(false) || 1
              return 14 + confidence * 20 + Math.min(degree, 10) * 2
            },
            height: (ele: any) => {
              const confidence = ele.data('confidence') ?? 0.5
              const degree = ele.degree(false) || 1
              return 14 + confidence * 20 + Math.min(degree, 10) * 2
            },
            label: (ele: any) => {
              const confidence = ele.data('confidence') ?? 0.5
              const degree = ele.degree(false) || 0
              if (confidence >= 0.6 || degree >= 4) return ele.data('label')
              return ''
            },
            'font-size': '9px',
            color: '#cbd5e1',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-max-width': '120px',
            'text-wrap': 'ellipsis',
            'border-width': 0,
            'overlay-opacity': 0,
            'background-opacity': 0.9,
          } as any,
        },
        {
          selector: 'edge',
          style: {
            width: (ele: any) => 0.5 + (ele.data('weight') ?? 0.5) * 2,
            'line-color': '#1e2235',
            'target-arrow-color': '#1e2235',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.5,
            'curve-style': 'bezier',
            opacity: (ele: any) => 0.12 + (ele.data('weight') ?? 0.5) * 0.3,
          },
        },
        {
          selector: 'edge[?anti]',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3] as any,
            opacity: 0.5,
          },
        },
      ],
      layout: { name: 'preset' } as any,
      minZoom: 0.15,
      maxZoom: 3,
    })

    cyRef.current = cy
    initializedRef.current = true

    cy.on('tap', 'node', (e: EventObject) => {
      onSelectRef.current(e.target.id())
    })

    cy.on('mouseover', 'node', (e: EventObject) => {
      const node = e.target
      node.style('label', node.data('label'))
      node.style('font-size', '10px')
      node.style('color', '#f1f5f9')
      node.style('text-background-color', '#0f1117')
      node.style('text-background-opacity', 0.85)
      node.style('text-background-padding', '3px' as any)
      const pos = node.renderedPosition()
      setTooltip({
        x: pos.x + 20,
        y: pos.y - 10,
        title: node.data('label'),
        gist: node.data('gist') || '',
      })
    })

    cy.on('mouseout', 'node', (e: EventObject) => {
      const node = e.target
      const confidence = node.data('confidence') ?? 0.5
      const degree = node.degree(false) || 0
      if (confidence < 0.6 && degree < 4) {
        node.style('label', '')
      } else {
        node.style('label', node.data('label'))
      }
      node.style('font-size', '9px')
      node.style('color', '#cbd5e1')
      node.style('text-background-opacity', 0)
      setTooltip(null)
    })

    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) setTooltip(null)
    })

    return () => {
      cy.destroy()
      cyRef.current = null
      initializedRef.current = false
    }
  }, [])

  // Update elements
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || elements.length === 0) return

    const isFirstLoad = cy.elements().length === 0

    // Diff: remove stale
    const newIds = new Set(elements.map((el) => el.data.id))
    cy.elements().forEach((ele) => {
      if (!newIds.has(ele.id())) ele.remove()
    })

    // Add/update
    for (const el of elements) {
      const existing = cy.getElementById(el.data.id)
      if (existing.length) {
        existing.data(el.data)
      } else {
        cy.add(el as any)
      }
    }

    if (isFirstLoad) {
      // Build cluster arrays for CiSE: group node IDs by category
      // People goes first (index 0) — CiSE tends to center early clusters
      const clusterMap = new Map<string, string[]>()
      cy.nodes().forEach((node) => {
        const cat = node.data('category') || 'other'
        if (!clusterMap.has(cat)) clusterMap.set(cat, [])
        clusterMap.get(cat)!.push(node.id())
      })

      // Order: people first, then by size descending
      const orderedKeys = Array.from(clusterMap.keys()).sort((a, b) => {
        if (a === 'people') return -1
        if (b === 'people') return 1
        return (clusterMap.get(b)!.length) - (clusterMap.get(a)!.length)
      })
      const clusters = orderedKeys.map(k => clusterMap.get(k)!)

      // Phase 1: Run CiSE to get nice circular cluster shapes
      cy.layout({
        name: 'cise',
        clusters,
        animate: false,
        fit: true,
        padding: 50,
        nodeSeparation: 18,
        idealInterClusterEdgeLengthCoefficient: 2.0,
        allowNodesInsideCircle: true,
        maxRatioOfNodesInsideCircle: 0.25,
        springCoeff: () => 0.4,
        nodeRepulsion: () => 8000,
        gravity: 0.2,
        gravityRange: 3.8,
      } as any).run()

      // Phase 2: Reposition clusters onto a spaced ring to eliminate overlap
      // Compute each cluster's bounding box and centroid
      const clusterInfo = orderedKeys.map((cat) => {
        const nodeIds = clusterMap.get(cat)!
        const nodes = cy.nodes().filter((n: any) => nodeIds.includes(n.id()))
        const bb = nodes.boundingBox()
        return {
          cat,
          nodes,
          cx: (bb.x1 + bb.x2) / 2,
          cy: (bb.y1 + bb.y2) / 2,
          radius: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1) / 2,
        }
      })

      // Place people at center, others on a ring around it
      const peopleIdx = clusterInfo.findIndex((c) => c.cat === 'people')
      const otherClusters = clusterInfo.filter((c) => c.cat !== 'people')

      // Ring radius: sum of largest cluster radii + generous padding
      const maxClusterRadius = Math.max(...clusterInfo.map((c) => c.radius), 50)
      const ringRadius = maxClusterRadius * 2.5 + otherClusters.length * 25

      // Compute target positions: people at origin, others evenly on ring
      const targets = new Map<string, { tx: number; ty: number }>()
      targets.set('people', { tx: 0, ty: 0 })

      otherClusters.forEach((cluster, i) => {
        const angle = (2 * Math.PI * i) / otherClusters.length - Math.PI / 2
        targets.set(cluster.cat, {
          tx: Math.cos(angle) * ringRadius,
          ty: Math.sin(angle) * ringRadius,
        })
      })

      // Move each cluster from its current centroid to target position
      for (const cluster of clusterInfo) {
        const target = targets.get(cluster.cat)!
        const dx = target.tx - cluster.cx
        const dy = target.ty - cluster.cy
        cluster.nodes.forEach((node: any) => {
          const pos = node.position()
          node.position({ x: pos.x + dx, y: pos.y + dy })
        })
      }

      cy.fit(undefined, 50)
    }
  }, [elements])

  // Draw cluster labels via canvas overlay
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.nodes().length === 0) return

    const container = cy.container()
    if (!container) return

    const oldOverlay = container.querySelector('.cluster-labels-overlay') as HTMLCanvasElement
    if (oldOverlay) oldOverlay.remove()

    const canvas = document.createElement('canvas')
    canvas.className = 'cluster-labels-overlay'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '5'
    const dpr = window.devicePixelRatio || 1
    canvas.width = cy.width() * dpr
    canvas.height = cy.height() * dpr
    container.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    function drawLabels() {
      if (!ctx || !cy) return
      ctx.clearRect(0, 0, cy!.width(), cy!.height())

      // Compute bounding boxes per category
      const catBounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; count: number }>()
      cy!.nodes().forEach((node) => {
        const cat = node.data('category') || 'other'
        const pos = node.renderedPosition()
        if (!catBounds.has(cat)) {
          catBounds.set(cat, { minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y, count: 0 })
        }
        const b = catBounds.get(cat)!
        b.minX = Math.min(b.minX, pos.x)
        b.maxX = Math.max(b.maxX, pos.x)
        b.minY = Math.min(b.minY, pos.y)
        b.maxY = Math.max(b.maxY, pos.y)
        b.count++
      })

      for (const [cat, bounds] of catBounds) {
        if (bounds.count < 2) continue
        const color = CATEGORY_COLORS[cat] || '#64748b'
        const cx = (bounds.minX + bounds.maxX) / 2
        const cy = (bounds.minY + bounds.maxY) / 2
        const rx = (bounds.maxX - bounds.minX) / 2 + 30
        const ry = (bounds.maxY - bounds.minY) / 2 + 30

        // Draw subtle ellipse around cluster
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.max(rx, 20), Math.max(ry, 20), 0, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.08
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])

        // Category label above the cluster
        ctx.font = '600 11px "SF Mono", "Fira Code", monospace'
        ctx.fillStyle = color
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText(cat.toUpperCase(), cx, bounds.minY - 16)
      }
      ctx.globalAlpha = 1
    }

    drawLabels()
    cy.on('viewport', drawLabels)

    return () => {
      cy.off('viewport', drawLabels as any)
      canvas.remove()
    }
  }, [elements, selectedNode])

  // Selection highlighting
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.edges().forEach((edge) => {
      const isConnected =
        edge.data('source') === selectedNode || edge.data('target') === selectedNode
      const isAnti = edge.data('anti')
      const weight = edge.data('weight') ?? 0.5
      const baseWidth = 0.5 + weight * 2
      const activeColor = isAnti ? '#ef4444' : '#4b82f0'
      const defaultColor = isAnti ? '#ef4444' : '#1e2235'
      edge.style({
        'line-color': isConnected ? activeColor : defaultColor,
        'target-arrow-color': isConnected ? activeColor : defaultColor,
        opacity: isConnected ? 0.9 : (isAnti ? 0.5 : 0.12 + weight * 0.3),
        width: isConnected ? baseWidth + 1.5 : baseWidth,
      })
    })

    cy.nodes().forEach((node) => {
      const isSelected = node.id() === selectedNode
      const isNeighbor = selectedNode
        ? node.neighborhood().nodes().some((n: any) => n.id() === selectedNode)
        : false

      if (selectedNode) {
        node.style({
          'border-width': isSelected ? 3 : 0,
          'border-color': '#fff',
          opacity: isSelected || isNeighbor
            ? 1
            : Math.max(0.1, (node.data('confidence') ?? 0.5) * 0.2),
        })
        if (isSelected || isNeighbor) {
          node.style('label', node.data('label'))
        }
      } else {
        const confidence = node.data('confidence') ?? 0.5
        const degree = node.degree(false) || 0
        const lastAccessed = node.data('last_accessed')
        let staleFactor = 1
        if (lastAccessed) {
          const days = (Date.now() - new Date(lastAccessed).getTime()) / 86400000
          staleFactor = Math.max(0.5, 1 - days / 60)
        }
        node.style({
          'border-width': 0,
          opacity: Math.max(0.3, (0.35 + confidence * 0.65) * staleFactor),
          label: (confidence >= 0.6 || degree >= 4) ? node.data('label') : '',
        })
      }
    })
  }, [selectedNode])

  const navigateTo = useCallback((id: string) => {
    const cy = cyRef.current
    if (!cy) return
    const node = cy.getElementById(id)
    if (node.length) {
      cy.animate({
        center: { eles: node },
        zoom: Math.max(cy.zoom(), 1.2),
      } as any, { duration: 300 })
    }
  }, [])

  useEffect(() => {
    if (selectedNode) navigateTo(selectedNode)
  }, [selectedNode, navigateTo])

  return (
    <div className="graph-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {tooltip && (
        <div className="cy-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="cy-tooltip-title">{tooltip.title}</div>
          {tooltip.gist}
        </div>
      )}
    </div>
  )
}
