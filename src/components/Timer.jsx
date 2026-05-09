import { useState, useEffect, useRef } from 'react'

const DEFAULT_MS = 35 * 60 * 1000

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parseTimeInput(str) {
  const trimmed = str.trim()
  if (trimmed.includes(':')) {
    const [m, s] = trimmed.split(':').map(Number)
    if (isNaN(m) || isNaN(s) || s > 59) return null
    return (m * 60 + s) * 1000
  }
  const m = Number(trimmed)
  if (isNaN(m) || m < 0) return null
  return m * 60 * 1000
}

export default function Timer({ isAdmin, timerEndAt, timerRemainingMs, onTimerPatch }) {
  const remaining = timerRemainingMs ?? DEFAULT_MS
  const [displayMs, setDisplayMs] = useState(
    timerEndAt ? Math.max(0, timerEndAt - Date.now()) : remaining
  )
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(false)
  const tickRef = useRef(null)
  const inputRef = useRef(null)

  // Sync with DB state whenever props change
  useEffect(() => {
    clearInterval(tickRef.current)
    const endAt = timerEndAt ? Number(timerEndAt) : null
    if (endAt && endAt > Date.now()) {
      setDisplayMs(Math.max(0, endAt - Date.now()))
      tickRef.current = setInterval(() => {
        const left = endAt - Date.now()
        if (left <= 0) {
          clearInterval(tickRef.current)
          setDisplayMs(0)
        } else {
          setDisplayMs(left)
        }
      }, 250)
    } else {
      setDisplayMs(timerRemainingMs ?? DEFAULT_MS)
    }
    return () => clearInterval(tickRef.current)
  }, [timerEndAt, timerRemainingMs])

  const endAtNum = timerEndAt ? Number(timerEndAt) : null
  const running = !!(endAtNum && endAtNum > Date.now())
  const isZero = displayMs === 0

  function handleStart() {
    const endAt = Date.now() + displayMs
    onTimerPatch({ timer_end_at: endAt, timer_remaining_ms: displayMs })
  }

  function handlePause() {
    const left = Math.max(0, endAtNum ? endAtNum - Date.now() : displayMs)
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: left })
  }

  function handleReset() {
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: DEFAULT_MS })
  }

  function openEdit() {
    if (!isAdmin) return
    if (running) handlePause()
    setEditValue(formatTime(displayMs))
    setEditError(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 50)
  }

  function confirmEdit() {
    const ms = parseTimeInput(editValue)
    if (ms === null) { setEditError(true); return }
    setEditing(false)
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: ms })
  }

  function handleEditKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">UNOFFICIAL TIME</div>
        <div
          className={`timer-display${isZero ? ' timer-zero' : running ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
          onClick={openEdit}
          title={isAdmin ? 'Tap to edit' : undefined}
        >
          {formatTime(displayMs)}
        </div>
        {isAdmin && (
          <div className="timer-controls">
            <button
              className={`btn-timer-toggle ${running ? 'btn-timer-pause' : 'btn-timer-start'}`}
              onClick={running ? handlePause : handleStart}
              disabled={isZero && !running}
            >
              {running ? 'PAUSE' : 'START'}
            </button>
            <button className="btn-timer-reset" onClick={handleReset}>
              RESET
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="score-edit-overlay" onClick={() => setEditing(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Set Time</div>
            <input
              ref={inputRef}
              className="score-edit-input"
              type="text"
              inputMode="numeric"
              placeholder="MM:SS"
              value={editValue}
              onChange={e => { setEditValue(e.target.value); setEditError(false) }}
              onKeyDown={handleEditKey}
              autoFocus
            />
            {editError && <div className="admin-error">Enter time as MM:SS or minutes</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmEdit}>Set Time</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
