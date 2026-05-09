export default function QuarterControls({ quarter, onSetQuarter }) {
  return (
    <div className="quarter-selector">
      {[1, 2, 3, 4].map((q) => (
        <button
          key={q}
          className={`btn btn-quarter ${quarter === q ? 'btn-quarter-active' : ''}`}
          onClick={() => onSetQuarter(q)}
        >
          Q{q}
        </button>
      ))}
    </div>
  )
}
