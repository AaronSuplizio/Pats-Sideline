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

function PKCircleRow({ kicks, team, isAdmin, onSetKick, onOpenModal }) {
  // Admin always sees the next empty slot; non-admins only see filled circles (min 5)
  const displayCount = isAdmin ? Math.max(5, kicks.length + 1) : Math.max(5, kicks.length)

  return (
    <div className={`pk-circles-row pk-circles-row-${team}`}>
      {Array.from({ length: displayCount }, (_, i) => {
        const result = kicks[i]
        const isNext = i === kicks.length
        const isLastFilled = result != null && i === kicks.length - 1
        const clickable = isAdmin && (isNext || isLastFilled)

        return (
          <div
            key={i}
            className={[
              'pk-circle',
              result === 'goal' ? 'pk-circle-goal' : result === 'miss' ? 'pk-circle-miss' : 'pk-circle-empty',
              isAdmin && isNext ? 'pk-circle-next' : '',
              clickable ? 'pk-circle-clickable' : '',
            ].filter(Boolean).join(' ')}
            onClick={clickable ? () => {
              if (isLastFilled) onSetKick(team, i, null)
              else onOpenModal(team, i)
            } : undefined}
          />
        )
      })}
    </div>
  )
}

export default function Scoreboard({
  patsScore, opponentScore, half, onSetScore,
  halftimeActive, waterBreakActive, gameOver, pkMode,
  patsKicks, oppKicks, isAdmin, onSetKick,
  chatName, onSetName,
}) {
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [kickModal, setKickModal] = useState(null)
  const [namePromptOpen, setNamePromptOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState(false)
  const inputRef = useRef(null)
  const nameInputRef = useRef(null)

  const patsKicksArr = patsKicks ?? []
  const oppKicksArr = oppKicks ?? []
  const patsGoals = patsKicksArr.filter(k => k === 'goal').length
  const oppGoals = oppKicksArr.filter(k => k === 'goal').length

  function openEdit(team, current) {
    if (!chatName) {
      setPendingEdit({ team, current })
      setNameInput('')
      setNameError(false)
      setNamePromptOpen(true)
      setTimeout(() => nameInputRef.current?.focus(), 50)
      return
    }
    setEditing(team)
    setEditValue(String(current))
    setTimeout(() => { inputRef.current?.select() }, 50)
  }

  function confirmName() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError(true); return }
    onSetName(trimmed)
    setNamePromptOpen(false)
    if (pendingEdit) {
      setEditing(pendingEdit.team)
      setEditValue(String(pendingEdit.current))
      setTimeout(() => { inputRef.current?.select() }, 50)
      setPendingEdit(null)
    }
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

  const hasPkHistory = patsKicksArr.length > 0 || oppKicksArr.length > 0
  const showPkDisplay = pkMode || (gameOver && hasPkHistory)
  // Pulse only while PKs are live; freeze display (no pulse) once final
  const scoreboardClass = pkMode && !gameOver
    ? 'scoreboard scoreboard-pk-active'
    : showPkDisplay
    ? 'scoreboard scoreboard-pk-final'
    : 'scoreboard'

  return (
    <>
      <div className={scoreboardClass}>
        <div className="scoreboard-inner">
          <div className="score-block">
            <div className="score-team-name pats-name">PATS</div>
            <AnimatedScore
              value={patsScore}
              extraClass={`pats-score-color${isAdmin ? ' score-tappable' : ''}`}
              onClick={isAdmin ? () => openEdit('pats', patsScore) : undefined}
            />
          </div>

          <div className="scoreboard-center">
            {gameOver
              ? <div className="half-badge gameover-badge">FINAL</div>
              : pkMode
              ? <div className="half-badge pk-badge">PK</div>
              : halftimeActive
              ? <div className="half-badge halftime-badge">HALFTIME</div>
              : <div className="half-badge">{HALF_LABELS[half - 1] ?? '1st'} HALF</div>
            }
            <div className="score-colon">:</div>
            {waterBreakActive && <div className="half-badge waterbreak-badge">WATER BREAK</div>}
          </div>

          <div className="score-block">
            <div className="score-team-name opponent-name">OPP</div>
            <AnimatedScore
              value={opponentScore}
              extraClass={`opponent-score-color${isAdmin ? ' score-tappable' : ''}`}
              onClick={isAdmin ? () => openEdit('opponent', opponentScore) : undefined}
            />
          </div>
        </div>

        {showPkDisplay && (
          <div className="pk-display">
            <div className="pk-display-label">PENALTY KICKS</div>
            <div className="pk-circles-section">
              <PKCircleRow
                kicks={patsKicksArr}
                team="pats"
                isAdmin={isAdmin}
                onSetKick={onSetKick}
                onOpenModal={(team, index) => setKickModal({ team, index })}
              />
              <div className="pk-circles-numeric">
                <span className="pk-display-num pats-score-color">{patsGoals}</span>
                <span className="pk-display-dash">—</span>
                <span className="pk-display-num opponent-score-color">{oppGoals}</span>
              </div>
              <PKCircleRow
                kicks={oppKicksArr}
                team="opponent"
                isAdmin={isAdmin}
                onSetKick={onSetKick}
                onOpenModal={(team, index) => setKickModal({ team, index })}
              />
            </div>
          </div>
        )}
      </div>

      {namePromptOpen && (
        <div className="score-edit-overlay" onClick={() => setNamePromptOpen(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Enter Your Name</div>
            <div className="score-edit-subtitle">Required to edit the score</div>
            <input
              ref={nameInputRef}
              className="score-edit-input"
              type="text"
              placeholder="Your name"
              maxLength={30}
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setNameError(false) }}
              onKeyDown={e => { if (e.key === 'Enter') confirmName(); if (e.key === 'Escape') setNamePromptOpen(false) }}
              autoFocus
            />
            {nameError && <div className="admin-error">Please enter your name</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setNamePromptOpen(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmName}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="score-edit-overlay" onClick={() => setEditing(null)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">{editing === 'pats' ? 'Pats' : 'Opponent'} Score</div>
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

      {kickModal && (
        <div className="score-edit-overlay" onClick={() => setKickModal(null)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">
              {kickModal.team === 'pats' ? 'Pats' : 'Opponent'} — Kick #{kickModal.index + 1}
            </div>
            <div className="pk-kick-choices">
              <button
                className="btn-pk-choice btn-pk-choice-goal"
                onClick={() => { onSetKick(kickModal.team, kickModal.index, 'goal'); setKickModal(null) }}
              >
                ⚽ GOAL
              </button>
              <button
                className="btn-pk-choice btn-pk-choice-miss"
                onClick={() => { onSetKick(kickModal.team, kickModal.index, 'miss'); setKickModal(null) }}
              >
                ✗ MISS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
