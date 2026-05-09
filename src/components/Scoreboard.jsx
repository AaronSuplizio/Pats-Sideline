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

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']

export default function Scoreboard({ seahawksScore, opponentScore, quarter, onSetScore }) {
  const [editing, setEditing] = useState(null) // 'seahawks' | 'opponent' | null
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

  const teamLabel = editing === 'seahawks' ? 'Seahawks' : 'Opponent'

  return (
    <>
      <div className="scoreboard">
        <div className="scoreboard-inner">
          <div className="score-block">
            <div className="score-team-name seahawks-name">SEAHAWKS</div>
            <AnimatedScore
              value={seahawksScore}
              extraClass="seahawks-score-color score-tappable"
              onClick={() => openEdit('seahawks', seahawksScore)}
            />
          </div>

          <div className="scoreboard-center">
            <div className="quarter-badge">{QUARTER_LABELS[quarter - 1] ?? `Q${quarter}`}</div>
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
              max="999"
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
