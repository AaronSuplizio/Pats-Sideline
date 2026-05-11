import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const DEFAULT_HALF_MS = 35 * 60 * 1000

function formatTime(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function Timer({ isAdmin, timerEndAt, timerElapsedMs, halfDurationMs, onTimerPatch, gameOver, pkMode, half }) {
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  const [editing, setEditing] = useState(false)
  const [editMinutes, setEditMinutes] = useState('')
  const [editSeconds, setEditSeconds] = useState('')
  const [editError, setEditError] = useState(false)

  const [editingDuration, setEditingDuration] = useState(false)
  const [editDurationMinutes, setEditDurationMinutes] = useState('')
  const [editDurationError, setEditDurationError] = useState(false)

  const [editingTimeLeft, setEditingTimeLeft] = useState(false)
  const [editTimeLeftMinutes, setEditTimeLeftMinutes] = useState('')
  const [editTimeLeftSeconds, setEditTimeLeftSeconds] = useState('')
  const [editTimeLeftError, setEditTimeLeftError] = useState(false)

  const tickRef = useRef(null)
  const channelRef = useRef(null)
  const minutesRef = useRef(null)
  const timeLeftMinutesRef = useRef(null)
  const durationRef = useRef(null)
  const lastDbSyncRef = useRef({ endAt: null, elapsedMs: null })
  const elapsedMsRef = useRef(0)
  const isRunningRef = useRef(false)

  useEffect(() => { elapsedMsRef.current = elapsedMs }, [elapsedMs])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  const halfDurMs = halfDurationMs ?? DEFAULT_HALF_MS

  // Freeze timer for everyone when game is marked final
  useEffect(() => {
    if (!gameOver) return
    clearInterval(tickRef.current)
    setIsRunning(false)
    // Admin also broadcasts the precise elapsed and persists it
    if (isAdmin) {
      const elapsed = elapsedMsRef.current
      broadcast({ action: 'pause', elapsedMs: elapsed })
      onTimerPatch({ timer_end_at: null, timer_elapsed_ms: elapsed })
    }
  }, [gameOver])

  // Reset to 0 when PK mode activates (admin only)
  useEffect(() => {
    if (!pkMode || !isAdmin) return
    clearInterval(tickRef.current)
    setIsRunning(false)
    setElapsedMs(0)
    broadcast({ action: 'reset' })
    onTimerPatch({ timer_end_at: null, timer_elapsed_ms: 0 })
  }, [pkMode])

  // anchor = the virtual t=0 timestamp: Date.now() - elapsed = anchor
  function startTick(anchor) {
    clearInterval(tickRef.current)
    setIsRunning(true)
    setElapsedMs(Date.now() - anchor)
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - anchor)
    }, 250)
  }

  function applyPause(elapsed) {
    clearInterval(tickRef.current)
    setIsRunning(false)
    setElapsedMs(Math.max(0, elapsed))
  }

  // Sync from DB whenever timer_end_at or timer_elapsed_ms changes.
  // De-duped so broadcast updates (which already called startTick/applyPause)
  // don't trigger a redundant restart when the matching DB write arrives.
  useEffect(() => {
    if (timerEndAt === undefined && timerElapsedMs === undefined) return
    const endAt = timerEndAt ? Number(timerEndAt) : null
    const elapsed = timerElapsedMs ?? 0
    if (endAt === lastDbSyncRef.current.endAt && elapsed === lastDbSyncRef.current.elapsedMs) return
    lastDbSyncRef.current = { endAt, elapsedMs: elapsed }
    if (endAt) {
      startTick(endAt)
    } else {
      applyPause(elapsed)
    }
  }, [timerEndAt, timerElapsedMs])

  // Real-time broadcast sync
  useEffect(() => {
    channelRef.current = supabase
      .channel('game_timer')
      .on('broadcast', { event: 'timer' }, ({ payload }) => {
        if (payload.action === 'start') {
          startTick(Number(payload.anchor))
        } else if (payload.action === 'pause' || payload.action === 'set') {
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
    const anchor = Date.now() - elapsedMs
    startTick(anchor)
    broadcast({ action: 'start', anchor })
    onTimerPatch({ timer_end_at: anchor, timer_elapsed_ms: elapsedMs })
  }

  function handlePause() {
    const elapsed = Math.max(0, elapsedMs)
    applyPause(elapsed)
    broadcast({ action: 'pause', elapsedMs: elapsed })
    onTimerPatch({ timer_end_at: null, timer_elapsed_ms: elapsed })
  }

  function handleReset() {
    applyPause(0)
    broadcast({ action: 'reset' })
    onTimerPatch({ timer_end_at: null, timer_elapsed_ms: 0 })
  }

  function openEdit() {
    if (!isAdmin) return
    if (isRunningRef.current) handlePause()
    const offset = (!pkMode && half === 2) ? halfDurMs : 0
    const totalSeconds = Math.floor((elapsedMsRef.current + offset) / 1000)
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
    const offset = (!pkMode && half === 2) ? halfDurMs : 0
    const ms = Math.max(0, (m * 60 + s) * 1000 - offset)
    setEditing(false)
    applyPause(ms)
    broadcast({ action: 'set', elapsedMs: ms })
    onTimerPatch({ timer_end_at: null, timer_elapsed_ms: ms })
  }

  function openEditTimeLeft() {
    if (!isAdmin || isStoppage) return
    if (isRunningRef.current) handlePause()
    const remainingSeconds = halfDurSeconds - Math.floor(elapsedMsRef.current / 1000)
    setEditTimeLeftMinutes(String(Math.floor(Math.max(0, remainingSeconds) / 60)))
    setEditTimeLeftSeconds(String(Math.max(0, remainingSeconds) % 60))
    setEditTimeLeftError(false)
    setEditingTimeLeft(true)
    setTimeout(() => { timeLeftMinutesRef.current?.focus(); timeLeftMinutesRef.current?.select() }, 50)
  }

  function confirmTimeLeftEdit() {
    const m = parseInt(editTimeLeftMinutes, 10)
    const s = parseInt(editTimeLeftSeconds || '0', 10)
    if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s > 59) { setEditTimeLeftError(true); return }
    const remainingMs = (m * 60 + s) * 1000
    const ms = Math.max(0, halfDurMs - remainingMs)
    setEditingTimeLeft(false)
    applyPause(ms)
    broadcast({ action: 'set', elapsedMs: ms })
    onTimerPatch({ timer_end_at: null, timer_elapsed_ms: ms })
  }

  function openEditDuration() {
    setEditDurationMinutes(String(Math.round(halfDurMs / 60000)))
    setEditDurationError(false)
    setEditingDuration(true)
    setTimeout(() => { durationRef.current?.focus(); durationRef.current?.select() }, 50)
  }

  function confirmDurationEdit() {
    const m = parseInt(editDurationMinutes, 10)
    if (isNaN(m) || m < 1 || m > 99) { setEditDurationError(true); return }
    setEditingDuration(false)
    onTimerPatch({ half_duration_ms: m * 60 * 1000 })
  }

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const halfDurSeconds = Math.floor(halfDurMs / 1000)
  const isStoppage = elapsedSeconds >= halfDurSeconds
  const showSubtitle = !gameOver && !pkMode
  const subtitleMs = isStoppage
    ? (elapsedSeconds - halfDurSeconds) * 1000
    : (halfDurSeconds - elapsedSeconds) * 1000
  // H2 offsets display by one half duration (35:00 → 70:00 for 35-min halves)
  const halfOffset = (!pkMode && half === 2) ? halfDurMs : 0
  const displayMs = elapsedMs + halfOffset

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">UNOFFICIAL GAME CLOCK</div>
        <div
          className={`timer-display${isRunning ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
          onClick={openEdit}
          title={isAdmin ? 'Tap to edit' : undefined}
        >
          {formatTime(displayMs)}
        </div>

        {showSubtitle && (
          <div className="timer-countdown-section">
            <div className="timer-countdown-label">
              {isStoppage ? 'STOPPAGE' : 'TIME LEFT'}
            </div>
            <div
              className={`timer-countdown-display${isStoppage ? ' timer-countdown-stoppage' : ''}${isAdmin && !isStoppage ? ' timer-tappable' : ''}`}
              onClick={isAdmin && !isStoppage ? openEditTimeLeft : undefined}
              title={isAdmin && !isStoppage ? 'Tap to edit' : undefined}
            >
              {isStoppage ? `+${formatTime(subtitleMs)}` : formatTime(subtitleMs)}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="timer-controls">
            <button
              className={`btn-timer-toggle ${isRunning ? 'btn-timer-pause' : 'btn-timer-start'}`}
              onClick={isRunning ? handlePause : handleStart}
              disabled={gameOver}
            >
              {isRunning ? 'PAUSE' : elapsedSeconds === 0 ? 'START' : 'RESTART'}
            </button>
            <button className="btn-timer-reset" onClick={handleReset} disabled={gameOver}>
              RESET
            </button>
          </div>
        )}
        <button
          className="btn-half-duration"
          onClick={isAdmin ? openEditDuration : undefined}
          style={isAdmin ? undefined : { cursor: 'default', pointerEvents: 'none' }}
        >
          {Math.round(halfDurMs / 60000)} MIN HALVES
        </button>
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
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(false) }}
                  autoFocus
                />
                <div className="timer-edit-label">MIN</div>
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
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(false) }}
                />
                <div className="timer-edit-label">SEC</div>
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

      {editingTimeLeft && (
        <div className="score-edit-overlay" onClick={() => setEditingTimeLeft(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Set Time Left</div>
            <div className="timer-edit-fields">
              <div className="timer-edit-field">
                <input
                  ref={timeLeftMinutesRef}
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={editTimeLeftMinutes}
                  onChange={e => { setEditTimeLeftMinutes(e.target.value); setEditTimeLeftError(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') confirmTimeLeftEdit(); if (e.key === 'Escape') setEditingTimeLeft(false) }}
                  autoFocus
                />
                <div className="timer-edit-label">MIN</div>
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
                  value={editTimeLeftSeconds}
                  onChange={e => { setEditTimeLeftSeconds(e.target.value); setEditTimeLeftError(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') confirmTimeLeftEdit(); if (e.key === 'Escape') setEditingTimeLeft(false) }}
                />
                <div className="timer-edit-label">SEC</div>
              </div>
            </div>
            {editTimeLeftError && <div className="admin-error">Enter valid minutes (0–99) and seconds (0–59)</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setEditingTimeLeft(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmTimeLeftEdit}>Set Time Left</button>
            </div>
          </div>
        </div>
      )}

      {editingDuration && (
        <div className="score-edit-overlay" onClick={() => setEditingDuration(false)}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Half Duration</div>
            <div className="timer-edit-fields">
              <div className="timer-edit-field">
                <input
                  ref={durationRef}
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  placeholder="35"
                  value={editDurationMinutes}
                  onChange={e => { setEditDurationMinutes(e.target.value); setEditDurationError(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') confirmDurationEdit(); if (e.key === 'Escape') setEditingDuration(false) }}
                  autoFocus
                />
                <div className="timer-edit-label">MIN</div>
              </div>
            </div>
            {editDurationError && <div className="admin-error">Enter a valid duration (1–99 minutes)</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={() => setEditingDuration(false)}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={confirmDurationEdit}>Set Duration</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
