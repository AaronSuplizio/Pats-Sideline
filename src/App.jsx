import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import Scoreboard from './components/Scoreboard'
import ScoreControls from './components/ScoreControls'
import HalfControls from './components/HalfControls'
import StatusBar from './components/StatusBar'
import Chat, { JoinPrompt } from './components/Chat'
import Moments from './components/Moments'
import Timer from './components/Timer'

const DEFAULT_GAME = {
  id: 1,
  pats_score: 0,
  opponent_score: 0,
  half: 1,
  timer_end_at: null,
  timer_elapsed_ms: 0,
  half_duration_ms: 35 * 60 * 1000,
  updated_at: null,
  game_over: false,
  halftime_active: false,
  pk_mode: false,
  pats_pk_score: 0,
  opponent_pk_score: 0,
  pats_pk_kicks: '[]',
  opponent_pk_kicks: '[]',
}

async function persist(patch, updatedBy = null) {
  const { error } = await supabase
    .from('game_state')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
  return error
}

export default function App() {
  const [game, setGame] = useState(() => ({
    ...DEFAULT_GAME,
    // Seed game_over from localStorage so the status is correct before DB fetch resolves
    game_over: localStorage.getItem('game_over_cache') === '1',
  }))
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const [chatHeight, setChatHeight] = useState(() => {
    const saved = parseInt(localStorage.getItem('chat_height'), 10)
    return isNaN(saved) ? 640 : Math.max(200, Math.min(900, saved))
  })
  const chatHeightRef = useRef(640)
  const [chatName, setChatName] = useState(() => localStorage.getItem('chat_name'))
  const [isRealAdmin] = useState(() => localStorage.getItem('admin_unlocked') === '1')
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('admin_unlocked') === '1')
  const [shareCopied, setShareCopied] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light')
  const [pkMomentTrigger, setPkMomentTrigger] = useState(null)
  const [pkOverlay, setPkOverlay] = useState(null)
  const themeChannelRef = useRef(null)
  const halftimeChannelRef = useRef(null)
  const gameOverChannelRef = useRef(null)
  const pkChannelRef = useRef(null)

  useEffect(() => {
    if (!pkOverlay) return
    const t = setTimeout(() => setPkOverlay(null), 2800)
    return () => clearTimeout(t)
  }, [pkOverlay])

  // Keep game_over cached in localStorage so it's correct immediately on next load
  useEffect(() => {
    localStorage.setItem('game_over_cache', game.game_over ? '1' : '0')
  }, [game.game_over])

  // Scroll to top when loading finishes (prevents mobile browser restoring scroll position)
  useEffect(() => {
    if (!loading) window.scrollTo(0, 0)
  }, [loading])

  useEffect(() => { chatHeightRef.current = chatHeight }, [chatHeight])

  function handleResizeTouchStart(e) {
    const startY = e.touches[0].clientY
    const startHeight = chatHeightRef.current
    function onMove(e) {
      const dy = startY - e.touches[0].clientY
      setChatHeight(Math.min(Math.max(startHeight + dy, 200), 900))
    }
    function onEnd() {
      localStorage.setItem('chat_height', Math.round(chatHeightRef.current))
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
  }

  async function shareApp() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: 'Pats Sideline', text: 'Follow the game live! ⚽', url })
    } else {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }

  function toggleGameOver() {
    const next = !game.game_over
    const patch = next
      ? { game_over: true, timer_end_at: null }
      : { game_over: false }
    setGame(prev => ({ ...prev, ...patch }))
    gameOverChannelRef.current?.send({ type: 'broadcast', event: 'gameover', payload: { active: next } })
    persist(patch)
  }

  function toggleHalftime() {
    const next = !game.halftime_active
    setGame(prev => ({ ...prev, halftime_active: next }))
    halftimeChannelRef.current?.send({ type: 'broadcast', event: 'halftime', payload: { active: next } })
    persist({ halftime_active: next })
  }

  function togglePkMode() {
    const next = !game.pk_mode
    const patch = next
      ? { pk_mode: true, pats_pk_score: 0, opponent_pk_score: 0, pats_pk_kicks: '[]', opponent_pk_kicks: '[]' }
      : { pk_mode: false }
    setGame(prev => ({ ...prev, ...patch }))
    pkChannelRef.current?.send({ type: 'broadcast', event: 'pkmode', payload: { active: next } })
    persist(patch)
  }

  function setPkKick(team, index, result) {
    const kicksKey = team === 'pats' ? 'pats_pk_kicks' : 'opponent_pk_kicks'
    const scoreKey = team === 'pats' ? 'pats_pk_score' : 'opponent_pk_score'
    const current = JSON.parse(game[kicksKey] || '[]')
    const next = result === null ? current.slice(0, index) : [...current.slice(0, index), result]
    const nextStr = JSON.stringify(next)
    const score = next.filter(k => k === 'goal').length
    setGame(prev => ({ ...prev, [kicksKey]: nextStr, [scoreKey]: score }))
    pkChannelRef.current?.send({ type: 'broadcast', event: 'pkkick', payload: { team, kicks: nextStr, score } })
    persist({ [kicksKey]: nextStr, [scoreKey]: score })
    if (result === 'goal' && team === 'pats') {
      setPkMomentTrigger({ id: 'goal', from: chatName, key: Date.now() })
    } else if (result === 'miss' && team === 'pats') {
      const overlay = { type: 'pats_miss', key: Date.now() }
      setPkOverlay(overlay)
      pkChannelRef.current?.send({ type: 'broadcast', event: 'pkoverlay', payload: { type: 'pats_miss' } })
    } else if (result === 'goal' && team === 'opponent') {
      const overlay = { type: 'opp_goal', key: Date.now() }
      setPkOverlay(overlay)
      pkChannelRef.current?.send({ type: 'broadcast', event: 'pkoverlay', payload: { type: 'opp_goal' } })
    } else if (result === 'miss' && team === 'opponent') {
      const overlay = { type: 'opp_miss', key: Date.now() }
      setPkOverlay(overlay)
      pkChannelRef.current?.send({ type: 'broadcast', event: 'pkoverlay', payload: { type: 'opp_miss' } })
    }
  }

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('app_theme', newTheme)
    themeChannelRef.current?.send({ type: 'broadcast', event: 'theme', payload: { theme: newTheme } })
  }

  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const [adminInput, setAdminInput] = useState('')
  const [adminError, setAdminError] = useState(false)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef(null)

  function handleTitleTap() {
    if (isAdmin) return
    tapCountRef.current += 1
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 1500)
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0
      setShowAdminPrompt(true)
    }
  }

  function submitAdminKey(e) {
    e?.preventDefault()
    if (adminInput === import.meta.env.VITE_ADMIN_KEY) {
      localStorage.setItem('admin_unlocked', '1')
      setIsAdmin(true)
      setShowAdminPrompt(false)
      setAdminInput('')
      setAdminError(false)
    } else {
      setAdminError(true)
    }
  }

  function closeAdminPrompt() {
    setShowAdminPrompt(false)
    setAdminInput('')
    setAdminError(false)
  }

  const fetchGame = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('game_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (fetchErr) {
      setDbError(`Read failed: ${fetchErr.message}`)
      setLoading(false)
      return
    }

    if (data) setGame(data)
    setLoading(false)
  }, [])

  const persistAs = useCallback((patch) => persist(patch, chatName), [chatName])

  const adjustScore = useCallback((team, delta) => {
    const key = team === 'pats' ? 'pats_score' : 'opponent_score'
    const current = team === 'pats' ? game.pats_score : game.opponent_score
    const newValue = Math.max(0, current + delta)
    const patch = {
      pats_score: game.pats_score,
      opponent_score: game.opponent_score,
      half: game.half,
      [key]: newValue,
    }
    setGame(prev => ({ ...prev, ...patch, updated_at: new Date().toISOString(), updated_by: chatName }))
    persistAs(patch).then(err => {
      if (err) { setDbError(`Save failed: ${err.message}`); fetchGame() }
    })
    if (team === 'pats' && delta > 0) {
      setPkMomentTrigger({ id: 'goal', from: chatName, key: Date.now() })
    }
  }, [game, chatName, fetchGame, persistAs])

  const setHalf = useCallback((h) => {
    const half = Math.min(2, Math.max(1, h))
    const patch = { pats_score: game.pats_score, opponent_score: game.opponent_score, half, halftime_active: false }
    setGame(prev => ({ ...prev, half, halftime_active: false, updated_at: new Date().toISOString(), updated_by: chatName }))
    halftimeChannelRef.current?.send({ type: 'broadcast', event: 'halftime', payload: { active: false } })
    persistAs(patch).then(err => {
      if (err) { setDbError(`Save failed: ${err.message}`); fetchGame() }
    })
  }, [game, chatName, fetchGame, persistAs])

  useEffect(() => {
    fetchGame()

    const channel = supabase
      .channel('game_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' },
        (payload) => { if (payload.new?.id === 1) setGame(payload.new) }
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [fetchGame])

  useEffect(() => {
    themeChannelRef.current = supabase
      .channel('game_theme')
      .on('broadcast', { event: 'theme' }, ({ payload }) => {
        setTheme(payload.theme)
        localStorage.setItem('app_theme', payload.theme)
      })
      .subscribe()
    return () => { supabase.removeChannel(themeChannelRef.current) }
  }, [])

  useEffect(() => {
    halftimeChannelRef.current = supabase
      .channel('game_halftime')
      .on('broadcast', { event: 'halftime' }, ({ payload }) => {
        setGame(prev => ({ ...prev, halftime_active: payload.active }))
      })
      .subscribe()
    return () => { supabase.removeChannel(halftimeChannelRef.current) }
  }, [])

  useEffect(() => {
    gameOverChannelRef.current = supabase
      .channel('game_over')
      .on('broadcast', { event: 'gameover' }, ({ payload }) => {
        setGame(prev => ({ ...prev, game_over: payload.active }))
      })
      .subscribe()
    return () => { supabase.removeChannel(gameOverChannelRef.current) }
  }, [])

  useEffect(() => {
    pkChannelRef.current = supabase
      .channel('game_pk')
      .on('broadcast', { event: 'pkmode' }, ({ payload }) => {
        setGame(prev => ({
          ...prev,
          pk_mode: payload.active,
          ...(payload.active ? { pats_pk_score: 0, opponent_pk_score: 0, pats_pk_kicks: '[]', opponent_pk_kicks: '[]' } : {}),
        }))
      })
      .on('broadcast', { event: 'pkkick' }, ({ payload }) => {
        setGame(prev => {
          const kicksKey = payload.team === 'pats' ? 'pats_pk_kicks' : 'opponent_pk_kicks'
          const scoreKey = payload.team === 'pats' ? 'pats_pk_score' : 'opponent_pk_score'
          return { ...prev, [kicksKey]: payload.kicks, [scoreKey]: payload.score }
        })
      })
      .on('broadcast', { event: 'pkoverlay' }, ({ payload }) => {
        setPkOverlay({ type: payload.type, key: Date.now() })
      })
      .subscribe()
    return () => { supabase.removeChannel(pkChannelRef.current) }
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div className="loading-text">Loading game...</div>
      </div>
    )
  }

  return (
    <div className={`app${theme === 'light' ? ' theme-light' : ''}`}>
      <header className="app-header">
        <div className="header-top">
          <h1 className="app-title" onClick={handleTitleTap} style={{ cursor: 'default', userSelect: 'none' }}>
            Pats Sideline{isAdmin && <span className="admin-badge">ADMIN</span>}
          </h1>
        </div>
        <StatusBar
          connected={connected}
          updatedAt={game.updated_at}
          updatedBy={game.updated_by}
          onShare={shareApp}
          shareCopied={shareCopied}
          isAdmin={isAdmin}
          isRealAdmin={isRealAdmin}
          onToggleAdminView={() => setIsAdmin(a => !a)}
          gameOver={game.game_over}
        />
      </header>

      {dbError && (
        <div className="db-error">
          ⚠ {dbError}
        </div>
      )}

      {showAdminPrompt && (
        <div className="score-edit-overlay" onClick={closeAdminPrompt}>
          <div className="score-edit-card" onClick={e => e.stopPropagation()}>
            <div className="score-edit-title">Admin Access</div>
            <form onSubmit={submitAdminKey}>
              <input
                className="score-edit-input"
                type="password"
                placeholder="Passphrase"
                value={adminInput}
                onChange={e => { setAdminInput(e.target.value); setAdminError(false) }}
                onKeyDown={e => { if (e.key === 'Escape') closeAdminPrompt() }}
                autoFocus
              />
            </form>
            {adminError && <div className="admin-error">Incorrect passphrase</div>}
            <div className="score-edit-actions">
              <button className="btn score-edit-cancel" onClick={closeAdminPrompt}>Cancel</button>
              <button className="btn score-edit-confirm" onClick={submitAdminKey}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      <main className="app-main">
        <div className="main-left">
          <Scoreboard
            patsScore={game.pats_score}
            opponentScore={game.opponent_score}
            half={game.half}
            halftimeActive={game.halftime_active}
            gameOver={game.game_over}
            pkMode={game.pk_mode}
            patsKicks={JSON.parse(game.pats_pk_kicks || '[]')}
            oppKicks={JSON.parse(game.opponent_pk_kicks || '[]')}
            isAdmin={isAdmin}
            onSetKick={setPkKick}
            onSetScore={(team, value) => {
              const key = team === 'pats' ? 'pats_score' : 'opponent_score'
              const patch = { pats_score: game.pats_score, opponent_score: game.opponent_score, half: game.half, [key]: value }
              setGame(prev => ({ ...prev, ...patch, updated_at: new Date().toISOString(), updated_by: chatName }))
              persistAs(patch).then(err => { if (err) { setDbError(`Save failed: ${err.message}`); fetchGame() } })
            }}
          />

          <Timer
            isAdmin={isAdmin}
            timerEndAt={game.timer_end_at}
            timerElapsedMs={game.timer_elapsed_ms}
            halfDurationMs={game.half_duration_ms}
            half={game.half}
            gameOver={game.game_over}
            pkMode={game.pk_mode}
            onTimerPatch={(patch) => {
              setGame(prev => ({ ...prev, ...patch }))
              persist(patch).then(err => { if (err) setDbError(`Timer save failed: ${err.message}`) })
            }}
          />

          <section className="controls-section">
            <div className="team-cards">
              <div className="team-card">
                <div className="team-card-name pats-label">PATS</div>
                <ScoreControls team="pats" onAdjust={adjustScore} />
              </div>
              <div className="team-card-divider" />
              <div className="team-card">
                <div className="team-card-name opponent-label">OPPONENT</div>
                <ScoreControls team="opponent" onAdjust={adjustScore} />
              </div>
            </div>

            <div className="half-card">
              <div className="half-card-label">HALF</div>
              <HalfControls
                half={game.half}
                onSetHalf={setHalf}
                isAdmin={isAdmin}
                halftimeActive={game.halftime_active}
                onToggleHalftime={toggleHalftime}
                pkMode={game.pk_mode}
                onTogglePkMode={togglePkMode}
              />
            </div>

            {isAdmin && (
              <div className="admin-box">
                <div className="admin-box-label">Admin</div>
                <div className="admin-box-row">
                  <button
                    className={`btn-gameover${game.game_over ? ' btn-gameover-active' : ''}`}
                    onClick={toggleGameOver}
                  >
                    {game.game_over ? 'CLEAR FINAL' : 'FINAL SCORE'}
                  </button>
                  <button className="btn-theme-toggle" onClick={toggleTheme}>
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>
              </div>
            )}

          </section>

          <Moments
            name={chatName}
            triggerMoment={pkMomentTrigger}
            onSetName={name => { localStorage.setItem('chat_name', name); setChatName(name) }}
          />
        </div>

        <div className="chat-resize-handle" onTouchStart={handleResizeTouchStart}>
          <div className="chat-resize-dots" />
        </div>

        <div className="main-right">
          <section className="chat-section" style={{ minHeight: chatHeight }}>
            {chatName ? (
              <Chat
                name={chatName}
                isAdmin={isAdmin}
                onChangeName={() => { localStorage.removeItem('chat_name'); localStorage.removeItem('admin_unlocked'); setChatName(null); setIsAdmin(false) }}
              />
            ) : (
              <JoinPrompt onJoin={name => { localStorage.setItem('chat_name', name); setChatName(name) }} />
            )}
          </section>
        </div>
      </main>

      {pkOverlay && createPortal(
        <div
          key={pkOverlay.key}
          className={`pk-outcome-overlay${pkOverlay.type === 'opp_miss' || pkOverlay.type === 'pats_miss' ? ' pk-outcome-big' : pkOverlay.type === 'opp_goal' ? ' pk-outcome-neutral' : ' pk-outcome-small'}`}
        >
          {(pkOverlay.type === 'opp_miss' || pkOverlay.type === 'pats_miss') && <div className="pk-outcome-emoji">❌</div>}
          <div className="pk-outcome-text">
            {pkOverlay.type === 'pats_miss' && 'PATS MISS!'}
            {pkOverlay.type === 'opp_goal' && 'Opponent Scores'}
            {pkOverlay.type === 'opp_miss' && 'OPPONENTS MISS!'}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
