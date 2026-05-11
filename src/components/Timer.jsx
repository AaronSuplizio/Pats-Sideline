import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function Timer({ isAdmin, timerStartAt, timerElapsedMs, halfDurationMs, onTimerPatch, waterBreakActive, gameOver }) {
  const [isRunning, setIsRunning] = useState(false)
  const [displayMs, setDisplayMs] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editMinutes, setEditMinutes] = useState('')
  const [editSeconds, setEditSeconds] = useState('')
  const [editError, setEditError] = useState(false)
  const [durationEditing, setDurationEditing] = useState(false)
  const [editDurationMinutes, setEditDurationMinutes] = useState('')
  const [editDurationError, setEditDurationError] = useState(false)
  const tickRef = useRef(null)
  const channelRef = useRef(null)
  const minutesRef = useRef(null)
  const durationMinutesRef = useRef(null)
  const displayMsRef = useRef(0)
  const isRunningRef = useRef(false)

  useEffect(() => { displayMsRef.current = displayMs }, [displayMs])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  // Pause timer when water break activates (admin only — others sync via game_timer broadcast)
  useEffect(() => {
    if (!waterBreakActive || !isAdmin) return
    if (!isRunningRef.current) return
    const elapsed = displayMsRef.current
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(elapsed)
    broadcast({ action: 'pause', elapsedMs: elapsed })
    onTimerPatch({ timer_start_at: null, timer_elapsed_ms: elapsed })
  }, [waterBreakActive])

  // Stop timer when game is marked final (admin only) — preserve elapsed time
  useEffect(() => {
    if (!gameOver || !isAdmin) return
    if (!isRunningRef.current) return
    const elapsed = displayMsRef.current
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(elapsed)
    broadcast({ action: 'pause', elapsedMs: elapsed })
    onTimerPatch({ timer_start_at: null, timer_elapsed_ms: elapsed })
  }, [gameOver])

  function startTick(virtualStartAt) {
    clearInterval(tickRef.current)
    setIsRunning(true)
    setDisplayMs(Date.now() - virtualStartAt)
    tickRef.current = setInterval(() => {
      setDisplayMs(Date.now() - virtualStartAt)
    }, 250)
  }

  function applyPause(elapsedMs) {
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(elapsedMs)
  }

  // Sync from DB whenever props change — handles initial load, reconnects, and missed broadcasts
  useEffect(() => {
    const virtualStart = timerStartAt ? Number(timerStartAt) : null
    if (virtualStart) {
      startTick(virtualStart)
    } else {
      applyPause(timerElapsedMs ?? 0)
    }
  }, [timerStartAt, timerElapsedMs])

  // Broadcast channel for real-time sync between connected users
  useEffect(() => {
    channelRef.current = supabase
      .channel('game_timer')
      .on('broadcast', { event: 'timer' }, ({ payload }) => {
        if (payload.action === 'start') {
          startTick(Number(payload.startAt))
        } else if (payload.action === 'pause') {
          applyPause(payload.elapsedMs)
        } else if (payload.action === 'reset') {
          applyPause(0)
        }
      })
      .subscribe()
    return () => { clearInterval(tickRef.current); supabase.removeChannel(channelRef.current) }
  }, [])

  function broadcast(payload) {
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload })
  }

  function handleStart() {
    const virtualStartAt = Date.now() - displayMs
    startTick(virtualStartAt)
    broadcast({ action: 'start', startAt: virtualStartAt })
    onTimerPatch({ timer_start_at: virtualStartAt, timer_elapsed_ms: displayMs })
  }

  function handlePause() {
    const elapsed = displayMsRef.current
    applyPause(elapsed)
    broadcast({ action: 'pause', elapsedMs: elapsed })
    onTimerPatch({ timer_start_at: null, timer_elapsed_ms: elapsed })
  }

  function handleReset() {
    applyPause(0)
    broadcast({ action: 'reset' })
    onTimerPatch({ timer_start_at: null, timer_elapsed_ms: 0 })
  }

  function openEdit() {
    if (!isAdmin) return
    if (isRunning) handlePause()
    const totalSeconds = Math.floor(displayMsRef.current / 1000)
    setEditMinutes(String(Math.floor(totalSeconds / 60)))
    setEditSeconds(String(totalSeconds % 60))
    setEditError(false)
    setEditing(true)
    setTimeout(() => { minutesRef.current?.focus(); minutesRef.current?.select() }, 50)
  }

  function confirmEdit() {
    const m = parseInt(editMinutes, 10)
    const s = parseInt(editSeconds || '0', 10)
    if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s > 59) { setEditError(true); return }
    const ms = (m * 60 + s) * 1000
    setEditing(false)
    applyPause(ms)
    broadcast({ action: 'pause', elapsedMs: ms })
    onTimerPatch({ timer_start_at: null, timer_elapsed_ms: ms })
  }

  function openDurationEdit() {
    if (!isAdmin) return
    setEditDurationMinutes(String(Math.round((halfDurationMs ?? 35 * 60 * 1000) / 60000)))
    setEditDurationError(false)
    setDurationEditing(true)
    setTimeout(() => { durationMinutesRef.current?.focus(); durationMinutesRef.current?.select() }, 50)
  }

  function confirmDurationEdit() {
    const m = parseInt(editDurationMinutes, 10)
    if (isNaN(m) || m < 1 || m > 99) { setEditDurationError(true); return }
    setDurationEditing(false)
    onTimerPatch({ half_duration_ms: m * 60000 })
  }

  function handleMinutesKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  function handleSecondsKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  function handleDurationKey(e) {
    if (e.key === 'Enter') confirmDurationEdit()
    if (e.key === 'Escape') setDurationEditing(false)
  }

  const effectiveHalfDuration = halfDurationMs ?? 35 * 60 * 1000
  const remainingMs = effectiveHalfDuration - displayMs
  const inStoppage = remainingMs < 0

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">GAME TIME</div>
        <div
          className={`timer-display${isRunning ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
          onClick={openEdit}
          title={isAdmin ? 'Tap to edit' : undefined}
        >
          {formatElapsed(displayMs)}
        </div>
        {!gameOver && (
          <div className={`timer-remaining${inStoppage ? ' timer-stoppage' : ''}`}>
            {inStoppage
              ? `+${formatRemaining(-remainingMs)} STOPPAGE`
              : `${formatRemaining(remainingMs)} LEFT`}
          </div>
        )}
        {isAdmin && (
          <div className="timer-controls">
            <button
              className={`btn-timer-toggle ${isRunning ? 'btn-timer-pause' : 'btn-timer-start'}`}
              onClick={isRunning ? handlePause : handleStart}
            >
              {isRunning ? 'PAUSE' : 'START'}
            </button>
            <button className="btn-timer-reset" onClick={handleReset}>
              RESET
            </button>
          </div>
        )}
        {isAdmin && (
          <button className="btn-half-duration" onClick={openDurationEdit}>
            {Math.round(effectiveHalfDuration / 60000)} MIN HALVES
          </button>
        )}
      </div>

      {editing && (
        <div className="score-edit-overlay" onClick={() => setEditing(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Set Game Clock</div>
            <div className="timer-edit-fields">
              <div className="timer-edit-field">
                <input
                  ref={minutesRef}
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={editMinutes}
                  onChange={e => { setEditMinutes(e.target.value); setEditError(false) }}
                  onKeyDown={handleMinutesKey}
                  autoFocus
                />
                <div className="timer-edit-label">MIN ELAPSED</div>
              </div>
              <div className="timer-edit-colon">:</div>
              <div className="timer-edit-field">
                <input
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="59"
                  placeholder="00"
                  value={editSeconds}
                  onChange={e => { setEditSeconds(e.target.value); setEditError(false) }}
                  onKeyDown={handleSecondsKey}
                />
                <div className="timer-edit-label">SEC ELAPSED</div>
              </div>
            </div>
            {editError && <div className="admin-error">Enter valid minutes (0–99) and seconds (0–59)</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmEdit}>Set Clock</button>
            </div>
          </div>
        </div>
      )}

      {durationEditing && (
        <div className="score-edit-overlay" onClick={() => setDurationEditing(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Half Duration</div>
            <div className="timer-edit-fields">
              <div className="timer-edit-field">
                <input
                  ref={durationMinutesRef}
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  placeholder="35"
                  value={editDurationMinutes}
                  onChange={e => { setEditDurationMinutes(e.target.value); setEditDurationError(false) }}
                  onKeyDown={handleDurationKey}
                  autoFocus
                />
                <div className="timer-edit-label">MINUTES PER HALF</div>
              </div>
            </div>
            {editDurationError && <div className="admin-error">Enter a duration between 1 and 99 minutes</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setDurationEditing(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmDurationEdit}>Set Duration</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
