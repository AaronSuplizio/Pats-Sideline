const BUTTONS = [
  { label: '+6', sub: 'TD',   delta: 6 },
  { label: '+1', sub: 'PAT',  delta: 1 },
  { label: '−1', sub: 'ADJUST', delta: -1, undo: true },
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
