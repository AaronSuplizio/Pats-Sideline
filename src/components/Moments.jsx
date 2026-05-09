import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

const MOMENTS = [
  { id: 'touchdown',    label: 'Touchdown!',                  emoji: '🏈', color: '#69BE28', vibrate: [150, 50, 150, 50, 150, 50, 400] },
  { id: 'interception', label: 'Interception!',               emoji: '🙌', color: '#4a90d9', vibrate: [200, 60, 300] },
  { id: 'chains',       label: 'First Down, Move the Chains!',emoji: '⛓️', color: '#c0a060', vibrate: [80, 40, 80] },
  { id: 'defense',      label: 'Defense!',                    emoji: '🛡️', color: '#5b8dd9', vibrate: [100, 30, 100, 30, 100] },
  { id: 'wth',          label: 'What just happened?',         emoji: '🤮', color: '#9370db', vibrate: [500] },
  { id: 'fired-up',     label: "Let's get fired up!",         emoji: '🔥', color: '#ff6b35', vibrate: [80, 30, 200, 30, 80] },
]

const CONFETTI_COLORS = ['#69BE28', '#002244', '#ffffff', '#a8d858', '#001529']

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
    if (moment.id === 'touchdown') launchConfetti()
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
          className={`moment-overlay${active.id === 'touchdown' ? ' touchdown-shake' : ''}`}
          key={active.key}
          style={{ '--mc': active.color }}
        >
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
