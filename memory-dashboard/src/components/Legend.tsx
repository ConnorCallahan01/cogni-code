const CATEGORIES = [
  { name: 'people', color: '#34d399' },
  { name: 'projects', color: '#4b82f0' },
  { name: 'architecture', color: '#a78bfa' },
  { name: 'patterns', color: '#f59e0b' },
  { name: 'meta', color: '#22d3ee' },
  { name: 'dreams', color: '#f472b6' },
]

export default function Legend() {
  return (
    <div className="legend">
      {CATEGORIES.map((cat) => (
        <div key={cat.name} className="legend-item">
          <div className="legend-dot" style={{ background: cat.color }} />
          <span>{cat.name}</span>
        </div>
      ))}
    </div>
  )
}

export { CATEGORIES }
