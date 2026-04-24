const CATEGORIES = [
  { name: 'people', color: '#34d399' },
  { name: 'projects', color: '#4b82f0' },
  { name: 'architecture', color: '#a78bfa' },
  { name: 'patterns', color: '#f59e0b' },
  { name: 'concepts', color: '#e879f9' },
  { name: 'decisions', color: '#818cf8' },
  { name: 'preferences', color: '#f9a8d4' },
  { name: 'meta', color: '#22d3ee' },
  { name: 'dreams', color: '#f472b6' },
]

export type CenterTab = 'graph' | 'knowledge'

interface LegendProps {
  centerTab: CenterTab
  onCenterTab: (tab: CenterTab) => void
}

export default function Legend({ centerTab, onCenterTab }: LegendProps) {
  return (
    <div className="legend">
      <div className="legend-tabs">
        <div
          className={`legend-tab${centerTab === 'graph' ? ' active' : ''}`}
          onClick={() => onCenterTab('graph')}
        >
          Graph
        </div>
        <div
          className={`legend-tab${centerTab === 'knowledge' ? ' active' : ''}`}
          onClick={() => onCenterTab('knowledge')}
        >
          Knowledge
        </div>
      </div>
      {centerTab === 'graph' && (
        <div className="legend-categories">
          {CATEGORIES.map((cat) => (
            <div key={cat.name} className="legend-item">
              <div className="legend-dot" style={{ background: cat.color }} />
              <span>{cat.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { CATEGORIES }
