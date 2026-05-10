import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import Scoreboard from './components/Scoreboard'
import ScoreControls from './components/ScoreControls'
import HalfControls from './components/HalfControls'
import StatusBar from './components/StatusBar'
import Chat, { JoinPrompt } from './components/Chat'
import Moments from './components/Moments'
import Timer from './components/Timer'

const DEFAULT_GAME = { id: 1, pats_score: 0, opponent_score: 0, half: 1, timer_end_at: null, timer_remaining_ms: 35 * 60 * 1000, updated_at: null }

async function persist(patch, updatedBy = null) {
  const { error } = await supabase
    .from('game_state')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
  return error
}

export default function App() {
  const [game, setGame] = useState(DEFAULT_GAME)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const [chatName, setChatName] = useState(() => localStorage.getItem('chat_name'))
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('admin_unlocked') === '1')
  const [shareCopied, setShareCopied] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light')
  const themeChannelRef = useRef(null)
  const [halftimeActive, setHalftimeActive] = useState(false)
  const halftimeChannelRef = useRef(null)
  const [waterBreakActive, setWaterBreakActive] = useState(false)
  const waterBreakChannelRef = useRef(null)
  const [playStoppedActive, setPlayStoppedActive] = useState(false)
  const playStoppedChannelRef = useRef(null)
  const [gameOver, setGameOver] = useState(false)
  const gameOverChannelRef = useRef(null)

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

  function togglePlayStopped() {
    const next = !playStoppedActive
    setPlayStoppedActive(next)
    playStoppedChannelRef.current?.send({ type: 'broadcast', event: 'playstopped', payload: { active: next } })
  }

  function toggleWaterBreak() {
    const next = !waterBreakActive
    setWaterBreakActive(next)
    waterBreakChannelRef.current?.send({ type: 'broadcast', event: 'waterbreak', payload: { active: next } })
  }

  function toggleGameOver() {
    const next = !gameOver
    setGameOver(next)
    gameOverChannelRef.current?.send({ type: 'broadcast', event: 'gameover', payload: { active: next } })
  }

  function toggleHalftime() {
    const next = !halftimeActive
    setHalftimeActive(next)
    halftimeChannelRef.current?.send({ type: 'broadcast', event: 'halftime', payload: { active: next } })
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

  const optimisticUpdate = useCallback(async (patch) => {
    setDbError(null)
    setGame(prev => ({ ...prev, ...patch, updated_at: new Date().toISOString() }))
    const error = await persist(patch)
    if (error) {
      setDbError(`Save failed: ${error.message}`)
      fetchGame()
    }
  }, [fetchGame])

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
  }, [game, chatName, fetchGame, persistAs])

  const setHalf = useCallback((h) => {
    const half = Math.min(2, Math.max(1, h))
    const patch = { pats_score: game.pats_score, opponent_score: game.opponent_score, half }
    setGame(prev => ({ ...prev, half, updated_at: new Date().toISOString(), updated_by: chatName }))
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
        setHalftimeActive(payload.active)
      })
      .subscribe()

    return () => { supabase.removeChannel(halftimeChannelRef.current) }
  }, [])

  useEffect(() => {
    waterBreakChannelRef.current = supabase
      .channel('game_waterbreak')
      .on('broadcast', { event: 'waterbreak' }, ({ payload }) => {
        setWaterBreakActive(payload.active)
      })
      .subscribe()

    return () => { supabase.removeChannel(waterBreakChannelRef.current) }
  }, [])

  useEffect(() => {
    playStoppedChannelRef.current = supabase
      .channel('game_playstopped')
      .on('broadcast', { event: 'playstopped' }, ({ payload }) => {
        setPlayStoppedActive(payload.active)
      })
      .subscribe()

    return () => { supabase.removeChannel(playStoppedChannelRef.current) }
  }, [])

  useEffect(() => {
    gameOverChannelRef.current = supabase
      .channel('game_over')
      .on('broadcast', { event: 'gameover' }, ({ payload }) => {
        setGameOver(payload.active)
      })
      .subscribe()

    return () => { supabase.removeChannel(gameOverChannelRef.current) }
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
          {isAdmin && (
            <button className="btn-theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </button>
          )}
        </div>
        <StatusBar
          connected={connected}
          updatedAt={game.updated_at}
          updatedBy={game.updated_by}
          onShare={shareApp}
          shareCopied={shareCopied}
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
            halftimeActive={halftimeActive}
            waterBreakActive={waterBreakActive}
            playStoppedActive={playStoppedActive}
            gameOver={gameOver}
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
            timerRemainingMs={game.timer_remaining_ms}
            waterBreakActive={waterBreakActive}
            gameOver={gameOver}
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
                halftimeActive={halftimeActive}
                onToggleHalftime={toggleHalftime}
              />
            </div>

            {isAdmin && (
              <div className="admin-box">
                <div className="admin-box-label">Admin</div>
                <div className="game-state-btns">
                  <button
                    className={`btn-playstopped${playStoppedActive ? ' btn-playstopped-active' : ''}`}
                    onClick={togglePlayStopped}
                  >
                    {playStoppedActive ? 'RESUMED' : 'STOPPED: INJURY'}
                  </button>
                  <button
                    className={`btn-waterbreak${waterBreakActive ? ' btn-waterbreak-active' : ''}`}
                    onClick={toggleWaterBreak}
                  >
                    {waterBreakActive ? 'RESUMED' : 'STOPPED: WATER'}
                  </button>
                </div>
                <button
                  className={`btn-gameover${gameOver ? ' btn-gameover-active' : ''}`}
                  onClick={toggleGameOver}
                >
                  {gameOver ? 'CLEAR FINAL' : 'FINAL SCORE'}
                </button>
              </div>
            )}

          </section>

          <Moments name={chatName} />
        </div>

        <div className="main-right">
          <section className="chat-section">
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

    </div>
  )
}
