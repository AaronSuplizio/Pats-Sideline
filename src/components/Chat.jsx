import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

function formatAge(isoString) {
  const s = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function JoinPrompt({ onJoin }) {
  const [nameInput, setNameInput] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (trimmed) onJoin(trimmed)
  }

  return (
    <div className="chat-join">
      <p className="chat-join-title">Parent Chat</p>
      <p className="chat-join-sub">Enter your name to join the sideline chat</p>
      <form className="chat-join-form" onSubmit={handleSubmit}>
        <input
          className="chat-name-input"
          type="text"
          placeholder="Your name"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          maxLength={30}
          autoFocus
        />
        <button className="btn btn-join" type="submit" disabled={!nameInput.trim()}>
          Join Chat
        </button>
      </form>
    </div>
  )
}

const FONT_SIZES = [13, 15, 17, 20, 24, 28, 34]

export default function Chat({ name, isAdmin, onChangeName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const lastSentRef = useRef(0)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [activeMsgId, setActiveMsgId] = useState(null)
  const [fontIdx, setFontIdx] = useState(() => {
    const saved = parseInt(localStorage.getItem('chat_font_idx'), 10)
    return isNaN(saved) ? 1 : Math.min(Math.max(saved, 0), FONT_SIZES.length - 1)
  })
  const bottomRef = useRef(null)

  function changeFontSize(delta) {
    setFontIdx(prev => {
      const next = Math.min(Math.max(prev + delta, 0), FONT_SIZES.length - 1)
      localStorage.setItem('chat_font_idx', next)
      return next
    })
  }

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data)
      })

    const channel = supabase
      .channel('chat_messages_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          setTimeout(scrollToBottom, 50)
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [scrollToBottom])

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    const now = Date.now()
    if (now - lastSentRef.current < 2000) {
      setSendError('Slow down — wait a moment before sending again.')
      return
    }
    lastSentRef.current = now
    setSending(true)
    setSendError(null)
    setInput('')

    const tempId = `temp-${Date.now()}`
    const optimistic = { id: tempId, name, message: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    setTimeout(scrollToBottom, 50)

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ name, message: text })
      .select()
      .single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setSendError(`Send failed: ${error.message}`)
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? data : m))
    }
    setSending(false)
  }

  async function deleteMessage(id) {
    setMessages(prev => prev.filter(m => m.id !== id))
    await supabase.from('chat_messages').delete().eq('id', id)
  }

  async function clearAllMessages() {
    setConfirmingClear(false)
    setMessages([])
    await supabase.from('chat_messages').delete().gte('id', 0)
  }

  function toggleActive(msgId) {
    setActiveMsgId(prev => prev === msgId ? null : msgId)
  }

  return (
    <div className="chat" style={{ fontSize: FONT_SIZES[fontIdx] + 'px' }}>
      <div className="chat-header">
        <span className="chat-title">Parent Chat</span>
        <div className="chat-header-right">
          <div className="chat-font-controls">
            <button className="btn-font-size" onClick={() => changeFontSize(-1)} disabled={fontIdx === 0}>A−</button>
            <button className="btn-font-size" onClick={() => changeFontSize(1)} disabled={fontIdx === FONT_SIZES.length - 1}>A+</button>
          </div>
          {isAdmin && (
            confirmingClear ? (
              <span className="chat-clear-confirm">
                <span className="chat-clear-confirm-label">Clear all?</span>
                <button className="btn btn-clear-yes" onClick={clearAllMessages}>Yes</button>
                <button className="btn btn-clear-no" onClick={() => setConfirmingClear(false)}>No</button>
              </span>
            ) : (
              <button className="btn btn-clear-chat" onClick={() => setConfirmingClear(true)}>
                Clear Chat
              </button>
            )
          )}
          <button className="chat-change-name" onClick={onChangeName}>
            {name} · change
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet — say something! 👋</p>
        )}
        {messages.map(msg => {
          const isMyMsg = msg.name === name && typeof msg.id === 'number'
          const canDelete = isMyMsg || isAdmin
          const isActive = msg.id === activeMsgId
          return (
            <div
              key={msg.id}
              className={`chat-msg ${isMyMsg ? 'chat-msg-mine' : ''} ${isActive ? 'chat-msg-active' : ''}`}
              onClick={canDelete ? () => toggleActive(msg.id) : undefined}
            >
              <div className="chat-msg-meta">
                <span className="chat-msg-name">{msg.name}</span>
                <span className="chat-msg-time">{formatAge(msg.created_at)}</span>
              </div>
              <div className="chat-msg-bubble">{msg.message}</div>
              {canDelete && (
                <button
                  className="chat-delete-btn"
                  onClick={e => { e.stopPropagation(); deleteMessage(msg.id) }}
                >
                  {isMyMsg ? 'Unsend' : 'Delete'}
                </button>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && <div className="chat-error">{sendError}</div>}

      <form className="chat-input-row" onSubmit={sendMessage}>
        <input
          className="chat-input"
          type="text"
          placeholder="Message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={280}
        />
        <button className="btn btn-send" type="submit" disabled={!input.trim() || sending}>
          Send
        </button>
      </form>
    </div>
  )
}

export { JoinPrompt }
