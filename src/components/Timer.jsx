import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

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

export default function Timer({ isAdmin, timerEndAt, timerRemainingMs, onTimerPatch, waterBreakActive }) {
  const [isRunning, setIsRunning] = useState(false)
  const [displayMs, setDisplayMs] = useState(DEFAULT_MS)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(false)
  const tickRef = useRef(null)
  const channelRef = useRef(null)
  const inputRef = useRef(null)
  const syncedRef = useRef(false)
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

  // Sync initial state from DB (runs once when DB data arrives via props)
  useEffect(() => {
    if (syncedRef.current) return
    if (timerEndAt === undefined && timerRemainingMs === undefined) return
    syncedRef.current = true
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
    setEditValue(formatTime(displayMs))
    setEditError(false)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 50)
  }

  function confirmEdit() {
    const ms = parseTimeInput(editValue)
    if (ms === null) { setEditError(true); return }
    setEditing(false)
    applyPause(ms)
    broadcast({ action: 'pause', remainingMs: ms })
    onTimerPatch({ timer_end_at: null, timer_remaining_ms: ms })
  }

  function handleEditKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  const isZero = displayMs === 0

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">UNOFFICIAL TIME</div>
        <div
          className={`timer-display${isZero ? ' timer-zero' : isRunning ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
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
