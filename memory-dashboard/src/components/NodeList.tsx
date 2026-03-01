import { GraphNode } from '../lib/api'
import { CATEGORIES } from './Legend'

interface Props {
  nodes: GraphNode[]
  selectedNode: string | null
  onSelect: (id: string) => void
}

function getCategoryColor(category: string): string {
  return CATEGORIES.find((c) => c.name === category)?.color ?? '#64748b'
}

export default function NodeList({ nodes, selectedNode, onSelect }: Props) {
  // Group by category
  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const cat = node.data.category
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(node)
  }

  // Sort categories by CATEGORIES order
  const catOrder = CATEGORIES.map((c) => c.name)
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (catOrder.indexOf(a[0]) === -1 ? 99 : catOrder.indexOf(a[0])) -
              (catOrder.indexOf(b[0]) === -1 ? 99 : catOrder.indexOf(b[0]))
  )

  return (
    <div className="sidebar">
      {sortedGroups.map(([category, catNodes]) => (
        <div key={category} className="sidebar-group">
          <div className="sidebar-group-title">{category}</div>
          {catNodes
            .sort((a, b) => a.data.label.localeCompare(b.data.label))
            .map((node) => (
            <div key={node.data.id}>
              <div
                className={`sidebar-node${selectedNode === node.data.id ? ' active' : ''}`}
                onClick={() => onSelect(node.data.id)}
              >
                <div
                  className="sidebar-dot"
                  style={{ background: getCategoryColor(category) }}
                />
                <span className="sidebar-label">{node.data.label}</span>
              </div>
              <div className="sidebar-confidence">
                <div
                  className="sidebar-confidence-fill"
                  style={{
                    width: `${(node.data.confidence ?? 0.5) * 100}%`,
                    background: getCategoryColor(category),
                    opacity: 0.6,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
