import { useState, useMemo } from 'react'
import { GraphNode, ArchiveEntry } from '../lib/api'
import { CATEGORIES } from './Legend'

interface Props {
  nodes: GraphNode[]
  archivedNodes: ArchiveEntry[]
  selectedNode: string | null
  onSelect: (id: string) => void
}

function getCategoryColor(category: string): string {
  return CATEGORIES.find((c) => c.name === category)?.color ?? '#64748b'
}

interface TreeNode {
  name: string
  fullPath: string
  children: Map<string, TreeNode>
  leaf: GraphNode | null
}

function buildTree(nodes: GraphNode[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', children: new Map(), leaf: null }

  for (const node of nodes) {
    const parts = node.data.id.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join('/'),
          children: new Map(),
          leaf: null,
        })
      }
      current = current.children.get(part)!
    }
    current.leaf = node
  }

  return root
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    // Folders (has children) before leaves, then alphabetical
    const aIsFolder = a.children.size > 0
    const bIsFolder = b.children.size > 0
    if (aIsFolder && !bIsFolder) return -1
    if (!aIsFolder && bIsFolder) return 1
    return a.name.localeCompare(b.name)
  })
}

interface FolderProps {
  node: TreeNode
  depth: number
  selectedNode: string | null
  onSelect: (id: string) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}

function Folder({ node, depth, selectedNode, onSelect, expanded, onToggle }: FolderProps) {
  const isExpanded = expanded.has(node.fullPath)
  const children = sortedChildren(node)
  const hasChildren = children.length > 0
  const category = node.fullPath.split('/')[0]
  const color = getCategoryColor(category)

  // If this node is both a folder AND a leaf (has content + children)
  const isLeaf = node.leaf != null
  const isFolderOnly = hasChildren && !isLeaf
  const isLeafOnly = !hasChildren && isLeaf

  if (isLeafOnly) {
    return (
      <div>
        <div
          className={`sidebar-node${selectedNode === node.leaf!.data.id ? ' active' : ''}`}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => onSelect(node.leaf!.data.id)}
        >
          <div className="sidebar-dot" style={{ background: color }} />
          <span className="sidebar-label">{node.name}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        className={`sidebar-folder${isLeaf && selectedNode === node.leaf!.data.id ? ' active' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => {
          if (isFolderOnly) {
            onToggle(node.fullPath)
          } else if (isLeaf) {
            onSelect(node.leaf!.data.id)
          }
        }}
      >
        {hasChildren && (
          <span
            className="folder-chevron"
            onClick={(e) => { e.stopPropagation(); onToggle(node.fullPath) }}
          >
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        <span className="sidebar-label">{node.name}</span>
        {hasChildren && (
          <span className="folder-count">{children.length}</span>
        )}
      </div>
      {isExpanded && children.map((child) => (
        <Folder
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          selectedNode={selectedNode}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

export default function NodeList({ nodes, archivedNodes, selectedNode, onSelect }: Props) {
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const archiveTree = useMemo(() => {
    // Build fake GraphNodes from archive entries for the tree builder
    const fakeNodes: GraphNode[] = archivedNodes.map((a) => ({
      group: 'nodes',
      data: {
        id: a.path,
        label: a.path.split('/').pop() || a.path,
        category: a.path.split('/')[0],
        gist: a.gist,
        confidence: a.confidence,
        soma_intensity: 0,
        tags: a.tags,
        project: null,
        access_count: 0,
        updated: a.archived_date || '',
        last_accessed: '',
      },
    }))
    return buildTree(fakeNodes)
  }, [archivedNodes])

  // Start with top-level categories expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const child of tree.children.values()) {
      initial.add(child.fullPath)
    }
    return initial
  })

  const handleToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const topLevel = sortedChildren(tree)
  const archiveTopLevel = sortedChildren(archiveTree)

  return (
    <div className="sidebar">
      {topLevel.map((child) => (
        <div key={child.fullPath} className="sidebar-group">
          <div
            className="sidebar-group-title"
            onClick={() => handleToggle(child.fullPath)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span className="folder-chevron-top">
              {expanded.has(child.fullPath) ? '▾' : '▸'}
            </span>
            {child.name}
            <span className="folder-count-top">{child.children.size}</span>
          </div>
          {expanded.has(child.fullPath) && sortedChildren(child).map((sub) => (
            <Folder
              key={sub.fullPath}
              node={sub}
              depth={1}
              selectedNode={selectedNode}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={handleToggle}
            />
          ))}
        </div>
      ))}
      {archiveTopLevel.length > 0 && (
        <div className="sidebar-group sidebar-archive-group">
          <div
            className="sidebar-group-title"
            onClick={() => handleToggle('__archive__')}
            style={{ cursor: 'pointer', userSelect: 'none', opacity: 0.5 }}
          >
            <span className="folder-chevron-top">
              {expanded.has('__archive__') ? '▾' : '▸'}
            </span>
            archive
            <span className="folder-count-top">{archivedNodes.length}</span>
          </div>
          {expanded.has('__archive__') && archiveTopLevel.map((child) => (
            <div key={`archive-${child.fullPath}`} className="sidebar-archive-entries">
              <div
                className="sidebar-group-title"
                onClick={() => handleToggle(`__archive__/${child.fullPath}`)}
                style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 24, opacity: 0.5 }}
              >
                <span className="folder-chevron-top">
                  {expanded.has(`__archive__/${child.fullPath}`) ? '▾' : '▸'}
                </span>
                {child.name}
                <span className="folder-count-top">{child.children.size}</span>
              </div>
              {expanded.has(`__archive__/${child.fullPath}`) && sortedChildren(child).map((sub) => (
                <div key={`archive-${sub.fullPath}`} className="sidebar-archive-entries">
                  <Folder
                    node={sub}
                    depth={2}
                    selectedNode={selectedNode}
                    onSelect={onSelect}
                    expanded={expanded}
                    onToggle={handleToggle}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
