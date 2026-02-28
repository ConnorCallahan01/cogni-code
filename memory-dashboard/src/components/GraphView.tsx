import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
import { GraphElement } from '../lib/api'

const CATEGORY_COLORS: Record<string, string> = {
  people: '#34d399',
  projects: '#4b82f0',
  architecture: '#a78bfa',
  patterns: '#f59e0b',
  meta: '#22d3ee',
  dreams: '#f472b6',
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
            label: 'data(label)',
            'background-color': (ele: any) =>
              CATEGORY_COLORS[ele.data('category')] ?? '#64748b',
            width: (ele: any) => 20 + (ele.data('confidence') ?? 0.5) * 20,
            height: (ele: any) => 20 + (ele.data('confidence') ?? 0.5) * 20,
            'font-size': '10px',
            color: '#e2e8f0',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'border-width': 0,
            'overlay-opacity': 0,
          } as any,
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#2e3348',
            'target-arrow-color': '#2e3348',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.6,
          },
        },
        {
          selector: 'edge[?anti]',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3] as any,
            opacity: 0.7,
          },
        },
      ],
      layout: { name: 'preset' } as any,
    })

    cyRef.current = cy
    initializedRef.current = true

    cy.on('tap', 'node', (e: EventObject) => {
      onSelectRef.current(e.target.id())
    })

    cy.on('mouseover', 'node', (e: EventObject) => {
      const node = e.target
      const pos = node.renderedPosition()
      setTooltip({
        x: pos.x + 20,
        y: pos.y - 10,
        title: node.data('label'),
        gist: node.data('gist') || '',
      })
    })

    cy.on('mouseout', 'node', () => {
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

  // Update elements without destroying the instance
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || elements.length === 0) return

    const isFirstLoad = cy.elements().length === 0

    // Diff: remove elements that no longer exist
    const newIds = new Set(elements.map((el) => el.data.id))
    cy.elements().forEach((ele) => {
      if (!newIds.has(ele.id())) ele.remove()
    })

    // Add/update elements
    for (const el of elements) {
      const existing = cy.getElementById(el.data.id)
      if (existing.length) {
        existing.data(el.data)
      } else {
        cy.add(el as any)
      }
    }

    // Only run layout on first load
    if (isFirstLoad) {
      cy.layout({
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 32000,
        idealEdgeLength: () => 200,
        gravity: 0.15,
        padding: 60,
        nodeOverlap: 30,
      } as any).run()
    }
  }, [elements])

  // Update selection highlighting
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.edges().forEach((edge) => {
      const isConnected =
        edge.data('source') === selectedNode || edge.data('target') === selectedNode
      const isAnti = edge.data('anti')
      const activeColor = isAnti ? '#ef4444' : '#4b82f0'
      const defaultColor = isAnti ? '#ef4444' : '#2e3348'
      edge.style({
        'line-color': isConnected ? activeColor : defaultColor,
        'target-arrow-color': isConnected ? activeColor : defaultColor,
        opacity: isConnected ? 1 : (isAnti ? 0.7 : 0.6),
        width: isConnected ? 2.5 : 1.5,
      })
    })

    cy.nodes().forEach((node) => {
      node.style({
        'border-width': node.id() === selectedNode ? 3 : 0,
        'border-color': '#fff',
      })
    })
  }, [selectedNode])

  // Navigate to node
  const navigateTo = useCallback((id: string) => {
    const cy = cyRef.current
    if (!cy) return
    const node = cy.getElementById(id)
    if (node.length) {
      cy.animate({ center: { eles: node }, zoom: cy.zoom() } as any)
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
