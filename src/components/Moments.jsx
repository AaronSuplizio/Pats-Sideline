import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

const MOMENTS = [
  { id: 'goal',     label: 'Pats Goal!!!!',         emoji: '⚽', color: '#FF1493', vibrate: [150, 50, 150, 50, 150, 50, 400] },
  { id: 'gopats',   label: 'Gooooo Pats!',          emoji: '⭐', color: '#F5C200', vibrate: [100, 50, 100, 50, 100, 50, 300], ripple: true },
  { id: 'corner',   label: 'Pats Corner',           emoji: '🚩', color: '#0055A5', vibrate: [80, 40, 80] },
  { id: 'oppcorner',label: 'Opponent Corner',       emoji: '🏴', color: '#888888', vibrate: [80, 40, 80] },
  { id: 'fast',     label: 'Sooooo fast!',          emoji: '💨', color: '#69c0ff', vibrate: [80, 30, 200, 30, 80] },
  { id: 'footwork', label: 'Check the footwork!',   emoji: '👟', color: '#FF6B35', vibrate: [80, 30, 80, 30, 80] },
  { id: 'pass',     label: 'What a pass!',          emoji: '🎯', color: '#a855f7', vibrate: [150, 60, 200] },
  { id: 'save',     label: 'What a save!',          emoji: '🧤', color: '#22c55e', vibrate: [200, 50, 200, 50, 400] },
  { id: 'yellow',   label: 'Yellow Card!',          emoji: '🟨', color: '#FFD700', vibrate: [200, 60, 300] },
  { id: 'pk',       label: 'Penalty Kick',          emoji: '🥅', color: '#FF1493', vibrate: [300, 100, 300] },
]

const CONFETTI_COLORS = ['#FF1493', '#000000', '#ffffff', '#0055A5', '#cc007a']

function launchConfetti() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300;'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 80,
    w: 8 + Math.random() * 10,
    h: 5 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.2,
    gravity: 0.12 + Math.random() * 0.08,
  }))

  let frame
  let start = null
  const DURATION = 3000

  function draw(ts) {
    if (!start) start = ts
    const elapsed = ts - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const p of pieces) {
      p.vy += p.gravity
      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.fillStyle = p.color
      ctx.globalAlpha = elapsed > DURATION - 600
        ? Math.max(0, 1 - (elapsed - (DURATION - 600)) / 600)
        : 1
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }

    if (elapsed < DURATION) {
      frame = requestAnimationFrame(draw)
    } else {
      canvas.remove()
    }
  }

  frame = requestAnimationFrame(draw)
  return () => { cancelAnimationFrame(frame); canvas.remove() }
}

export default function Moments({ name }) {
  const [active, setActive] = useState(null)
  const channelRef = useRef(null)
  const timerRef = useRef(null)

  function showMoment(moment, from = null) {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (navigator.vibrate) navigator.vibrate(moment.vibrate)
    setActive({ ...moment, key: Date.now(), from })
    if (moment.id === 'goal') launchConfetti()
    timerRef.current = setTimeout(() => setActive(null), 2800)
  }

  function fireMoment(moment) {
    showMoment(moment, name)
    channelRef.current?.send({ type: 'broadcast', event: 'moment', payload: { id: moment.id, from: name } })
  }

  useEffect(() => {
    channelRef.current = supabase
      .channel('game_moments')
      .on('broadcast', { event: 'moment' }, ({ payload }) => {
        const moment = MOMENTS.find(m => m.id === payload.id)
        if (moment) showMoment(moment, payload.from || null)
      })
      .subscribe()

    return () => { supabase.removeChannel(channelRef.current) }
  }, [])

  return (
    <>
      <section className="moments-section">
        <div className="moments-label">GAME MOMENTS</div>
        <div className="moments-grid">
          {MOMENTS.map(moment => (
            <button
              key={moment.id}
              className="btn-moment"
              style={{ '--mc': moment.color }}
              onClick={() => fireMoment(moment)}
            >
              <span className="moment-emoji">{moment.emoji}</span>
              <span className="moment-label">{moment.label}</span>
            </button>
          ))}
        </div>
      </section>

      {active && createPortal(
        <div
          className={`moment-overlay${active.id === 'goal' ? ' goal-shake' : ''}${active.ripple ? ' ripple-anim' : ''}`}
          key={active.key}
          style={{ '--mc': active.color }}
        >
          {active.ripple && <>
            <div className="ripple-ring" style={{ '--delay': '0s' }} />
            <div className="ripple-ring" style={{ '--delay': '0.4s' }} />
            <div className="ripple-ring" style={{ '--delay': '0.8s' }} />
          </>}
          <div className="moment-overlay-content">
            <div className="moment-overlay-emoji">{active.emoji}</div>
            <div className="moment-overlay-text">{active.label}</div>
            {active.from && <div className="moment-overlay-from">From {active.from}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
