import { useEffect, useRef, useState } from 'react'

function AnimatedScore({ value, extraClass, onClick }) {
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (value !== prev.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 700)
      prev.current = value
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <span
      className={`score-number ${extraClass} ${flash ? 'score-flash' : ''}`}
      onClick={onClick}
      title="Tap to edit"
    >
      {value}
    </span>
  )
}

const HALF_LABELS = ['1st', '2nd']

export default function Scoreboard({ patsScore, opponentScore, half, onSetScore }) {
  const [editing, setEditing] = useState(null) // 'pats' | 'opponent' | null
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  function openEdit(team, current) {
    setEditing(team)
    setEditValue(String(current))
    setTimeout(() => { inputRef.current?.select() }, 50)
  }

  function confirm() {
    const val = parseInt(editValue, 10)
    if (!isNaN(val) && val >= 0) onSetScore(editing, val)
    setEditing(null)
  }

  function handleKey(e) {
    if (e.key === 'Enter') confirm()
    if (e.key === 'Escape') setEditing(null)
  }

  const teamLabel = editing === 'pats' ? 'Pats' : 'Opponent'

  return (
    <>
      <div className="scoreboard">
        <div className="scoreboard-inner">
          <div className="score-block">
            <div className="score-team-name pats-name">PATS</div>
            <AnimatedScore
              value={patsScore}
              extraClass="pats-score-color score-tappable"
              onClick={() => openEdit('pats', patsScore)}
            />
          </div>

          <div className="scoreboard-center">
            <div className="half-badge">{HALF_LABELS[half - 1] ?? '1st'} HALF</div>
            <div className="score-colon">:</div>
          </div>

          <div className="score-block">
            <div className="score-team-name opponent-name">OPP</div>
            <AnimatedScore
              value={opponentScore}
              extraClass="opponent-score-color score-tappable"
              onClick={() => openEdit('opponent', opponentScore)}
            />
          </div>
        </div>
      </div>

      {editing && (
        <div className="score-edit-overlay" onClick={() => setEditing(null)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">{teamLabel} Score</div>
            <input
              ref={inputRef}
              className="score-edit-input"
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
            />
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirm}>Set Score</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
