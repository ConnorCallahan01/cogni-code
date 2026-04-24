interface KnowledgeViewProps {
  mapContent: string
  priorsContent: string
  somaContent: string
  workingContent: string
  dreamsContextContent: string
}

const SECTIONS = [
  { key: 'priors', label: 'PRIORS.md', subtitle: 'Behavioral priors', prop: 'priorsContent' as const },
  { key: 'soma', label: 'SOMA.md', subtitle: 'Emotional engagement', prop: 'somaContent' as const },
  { key: 'map', label: 'MAP.md', subtitle: 'Knowledge index', prop: 'mapContent' as const },
  { key: 'working', label: 'WORKING.md', subtitle: 'Working memory', prop: 'workingContent' as const },
  { key: 'dreams', label: 'DREAMS.md', subtitle: 'Speculative fragments', prop: 'dreamsContextContent' as const },
]

export default function KnowledgeView(props: KnowledgeViewProps) {
  return (
    <div className="knowledge-view">
      {SECTIONS.map((s) => (
        <div key={s.key} className="detail-section">
          <div className="detail-section-title">
            {s.label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {s.subtitle}</span>
          </div>
          <div className="detail-content">{props[s.prop] || 'Not found'}</div>
        </div>
      ))}
    </div>
  )
}
