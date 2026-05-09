export default function HalfControls({ half, onSetHalf }) {
  return (
    <div className="half-selector">
      {[1, 2].map((h) => (
        <button
          key={h}
          className={`btn btn-half ${half === h ? 'btn-half-active' : ''}`}
          onClick={() => onSetHalf(h)}
        >
          {h === 1 ? '1st' : '2nd'}
        </button>
      ))}
    </div>
  )
}
