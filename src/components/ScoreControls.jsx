const BUTTONS = [
  { label: '+1', sub: 'GOAL',  delta: 1 },
  { label: '−1', sub: 'UNDO', delta: -1, undo: true },
]

export default function ScoreControls({ team, onAdjust }) {
  return (
    <div className="score-buttons">
      {BUTTONS.map(({ label, sub, delta, undo }) => (
        <button
          key={label}
          className={`btn ${undo ? 'btn-undo' : 'btn-score'}`}
          onClick={() => onAdjust(team, delta)}
        >
          <span className="score-btn-value">{label}</span>
          <span className="score-btn-sub">{sub}</span>
        </button>
      ))}
    </div>
  )
}
