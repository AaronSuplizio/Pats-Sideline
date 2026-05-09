import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const DEFAULT_MS = 35 * 60 * 1000

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Accepts "35", "35:00", "12:30", etc.
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

export default function Timer({ isAdmin }) {
  const [running, setRunning] = useState(false)
  const [remainingMs, setRemainingMs] = useState(DEFAULT_MS)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(false)
  const endAtRef = useRef(null)
  const tickRef = useRef(null)
  const channelRef = useRef(null)
  const inputRef = useRef(null)

  function startTick(endAt) {
    endAtRef.current = endAt
    clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      const left = endAtRef.current - Date.now()
      if (left <= 0) {
        clearInterval(tickRef.current)
        setRemainingMs(0)
        setRunning(false)
        endAtRef.current = null
      } else {
        setRemainingMs(left)
      }
    }, 250)
  }

  function handleStart() {
    const endAt = Date.now() + remainingMs
    startTick(endAt)
    setRunning(true)
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { action: 'start', endAt } })
  }

  function handlePause() {
    clearInterval(tickRef.current)
    const left = endAtRef.current ? endAtRef.current - Date.now() : remainingMs
    const snapped = Math.max(0, left)
    endAtRef.current = null
    setRunning(false)
    setRemainingMs(snapped)
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { action: 'pause', remainingMs: snapped } })
  }

  function handleReset() {
    clearInterval(tickRef.current)
    endAtRef.current = null
    setRunning(false)
    setRemainingMs(DEFAULT_MS)
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { action: 'reset' } })
  }

  function openEdit() {
    if (!isAdmin) return
    // Pause first if running
    if (running) handlePause()
    setEditValue(formatTime(remainingMs))
    setEditError(false)
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 50)
  }

  function confirmEdit() {
    const ms = parseTimeInput(editValue)
    if (ms === null) { setEditError(true); return }
    setRemainingMs(ms)
    setEditing(false)
    channelRef.current?.send({ type: 'broadcast', event: 'timer', payload: { action: 'pause', remainingMs: ms } })
  }

  function handleEditKey(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  useEffect(() => {
    channelRef.current = supabase
      .channel('game_timer')
      .on('broadcast', { event: 'timer' }, ({ payload }) => {
        if (payload.action === 'start') {
          startTick(payload.endAt)
          setRunning(true)
        } else if (payload.action === 'pause') {
          clearInterval(tickRef.current)
          endAtRef.current = null
          setRunning(false)
          setRemainingMs(payload.remainingMs)
        } else if (payload.action === 'reset') {
          clearInterval(tickRef.current)
          endAtRef.current = null
          setRunning(false)
          setRemainingMs(DEFAULT_MS)
        }
      })
      .subscribe()

    return () => {
      clearInterval(tickRef.current)
      supabase.removeChannel(channelRef.current)
    }
  }, [])

  const isZero = remainingMs === 0

  return (
    <>
      <div className="timer-section">
        <div className="timer-label">UNOFFICIAL TIME</div>
        <div
          className={`timer-display${isZero ? ' timer-zero' : running ? ' timer-running' : ''}${isAdmin ? ' timer-tappable' : ''}`}
          onClick={openEdit}
          title={isAdmin ? 'Tap to edit' : undefined}
        >
          {formatTime(remainingMs)}
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
