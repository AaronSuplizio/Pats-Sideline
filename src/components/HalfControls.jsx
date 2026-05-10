export default function HalfControls({ half, onSetHalf, isAdmin, halftimeActive, onToggleHalftime }) {
  return (
    <div className="half-selector">
      <button
        className={`btn btn-half ${half === 1 ? 'btn-half-active' : ''}`}
        onClick={() => onSetHalf(1)}
      >
        1st
      </button>
      <button
        className={`btn btn-halftime-inline${halftimeActive ? ' btn-halftime-inline-active' : ''}`}
        onClick={onToggleHalftime}
      >
        {halftimeActive ? 'END HT' : 'HALFTIME'}
      </button>
      <button
        className={`btn btn-half ${half === 2 ? 'btn-half-active' : ''}`}
        onClick={() => onSetHalf(2)}
      >
        2nd
      </button>
    </div>
  )
}
