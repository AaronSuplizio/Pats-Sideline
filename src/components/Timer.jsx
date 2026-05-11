import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const DEFAULT_MS = 35 * 60 * 1000

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}


export default function Timer({ isAdmin, timerEndAt, timerRemainingMs, onTimerPatch, waterBreakActive, gameOver }) {
  const [isRunning, setIsRunning] = useState(false)
  const [displayMs, setDisplayMs] = useState(DEFAULT_MS)
  const [editing, setEditing] = useState(false)
  const [editMinutes, setEditMinutes] = useState('')
  const [editSeconds, setEditSeconds] = useState('')
  const [editError, setEditError] = useState(false)
  const tickRef = useRef(null)
  const channelRef = useRef(null)
  const minutesRef = useRef(null)
  const displayMsRef = useRef(DEFAULT_MS)
  const isRunningRef = useRef(false)

  useEffect(() => { displayMsRef.current = displayMs }, [displayMs])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  // Pause timer when water break activates (admin only — others sync via game_timer broadcast)
  useEffect(() => {
    if (!waterBreakActive || !isAdmin) return
    if (!isRunningRef.current) return
    const left = Math.max(0, displayMsRef.current)
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(left)
    broadcast({ action: 'pause', remainingMs: left })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: left })
  }, [waterBreakActive])

  // Zero out and stop timer when game is marked final (admin only)
  useEffect(() => {
    if (!gameOver || !isAdmin) return
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(0)
    broadcast({ action: 'pause', remainingMs: 0 })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: 0 })
  }, [gameOver])

  function startTick(endAt) {
    clearInterval(tickRef.current)
    setIsRunning(true)
    setDisplayMs(Math.max(0, endAt - Date.now()))
    tickRef.current = setInterval(() => {
      const left = endAt - Date.now()
      if (left <= 0) {
        clearInterval(tickRef.current)
        setDisplayMs(0)
        setIsRunning(false)
      } else {
        setDisplayMs(left)
      }
    }, 250)
  }

  function applyPause(ms) {
    clearInterval(tickRef.current)
    setIsRunning(false)
    setDisplayMs(ms)
  }

  // Sync from DB whenever props change — handles initial load, reconnects, and missed broadcasts
  useEffect(() => {
    const endAt = timerEndAt ? Number(timerEndAt) : null
    if (endAt && endAt > Date.now()) {
      startTick(endAt)
    } else {
      applyPause(timerRemainingMs ?? DEFAULT_MS)
    }
  }, [timerEndAt, timerRemainingMs])

  // Broadcast channel for real-time sync between connected users
  useEffect(() => {
    channelRef.current = supabase
      .channel('game_timer')
      .on('broadcast', { event: 'timer' }, ({ payload }) => {
        if (payload.action === 'start') {
          startTick(Number(payload.endAt))
        } else if (payload.action === 'pause') {
          applyPause(payload.remainingMs)
        } else if (payload.action === 'reset') {
          applyPause(DEFAULT_MS)
        }
      })
      .subscribe()
    return () => { clearInterval(tickRef.current); supabase.removeChannel(channelRef.current) }
  }, [])

  function broadcast(payload) {
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload })
  }

  function handleStart() {
    const endAt = Date.now() + displayMs
    startTick(endAt)
    broadcast({ action: 'start', endAt })
    onTimerPatch({ timer_end_at: endAt, timer_remaining_ms: displayMs })
  }

  function handlePause() {
    const left = Math.max(0, displayMs)
    applyPause(left)
    broadcast({ action: 'pause', remainingMs: left })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: left })
  }

  function handleReset() {
    applyPause(DEFAULT_MS)
    broadcast({ action: 'reset' })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: DEFAULT_MS })
  }

  function openEdit() {
    if (!isAdmin) return
    if (isRunning) handlePause()
    const totalSeconds = Math.max(0, Math.ceil(displayMsRef.current / 1000))
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
    broadcast({ action: 'pause', remainingMs: ms })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: ms })
  }

  function handleMinutesKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  function handleSecondsKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  const isZero = displayMs === 0

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">UNOFFICIAL TIME</div>
        <div
          className={`timer-display${isZero && !gameOver ? ' timer-zero' : isRunning ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
          onClick={openEdit}
          title={isAdmin ? 'Tap to edit' : undefined}
        >
          {formatTime(displayMs)}
        </div>
        {isAdmin && (
          <div className="timer-controls">
            <button
              className={`btn-timer-toggle ${isRunning ? 'btn-timer-pause' : 'btn-timer-start'}`}
              onClick={isRunning ? handlePause : handleStart}
              disabled={isZero && !isRunning}
            >
              {isRunning ? 'PAUSE' : 'START'}
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
            <div className="timer-edit-fields">
              <div className="timer-edit-field">
                <input
                  ref={minutesRef}
                  className="score-edit-input timer-edit-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  placeholder="35"
                  value={editMinutes}
                  onChange={e => { setEditMinutes(e.target.value); setEditError(false) }}
                  onKeyDown={handleMinutesKey}
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
                  onKeyDown={handleSecondsKey}
                />
                <div className="timer-edit-label">SEC</div>
              </div>
            </div>
            {editError && <div className="admin-error">Enter valid minutes (0–99) and seconds (0–59)</div>}
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
