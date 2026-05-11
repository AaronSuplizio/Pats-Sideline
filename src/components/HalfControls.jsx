export default function HalfControls({ half, onSetHalf, isAdmin, halftimeActive, onToggleHalftime, pkMode, onTogglePkMode }) {
  return (
    <div className="half-selector">
      <button
        className={`btn btn-half ${half === 1 && !halftimeActive ? 'btn-half-active' : ''}`}
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
        className={`btn btn-half ${half === 2 && !halftimeActive ? 'btn-half-active' : ''}`}
        onClick={() => onSetHalf(2)}
      >
        2nd
      </button>
      {isAdmin && (
        <button
          className={`btn btn-half-pk${pkMode ? ' btn-half-pk-active' : ''}`}
          onClick={onTogglePkMode}
        >
          PKs
        </button>
      )}
    </div>
  )
}
