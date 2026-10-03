'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import TopBar from '../../components/TopBar'

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (secs < 60) return 'ਹੁਣੇ'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} ਮਿੰਟ ਪਹਿਲਾਂ`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ਘੰਟੇ ਪਹਿਲਾਂ`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ਦਿਨ ਪਹਿਲਾਂ`
  return new Date(dateStr).toLocaleDateString('pa-IN')
}

function FeedCard({ item, currentUserId, onLike, isActive }) {
  const router = useRouter()
  const [showLikers, setShowLikers] = useState(false)
  const [showViewers, setShowViewers] = useState(false)
  const [likePop, setLikePop] = useState(0)
  const longPressTimer = useRef(null)

  const likers = item.likers || []
  const viewers = item.viewers || []
  const isLiked = likers.some(l => l.user_id === currentUserId)

  function handleCardClick() {
    const topicId = item.angle?.topic?.id
    const angleId = item.angle?.id
    if (topicId) {
      router.push(`/topics/${topicId}?openAngle=${angleId}#shabad-${item.id}`)
    }
  }

  function handleLike(e) {
    e.stopPropagation()
    setLikePop(n => n + 1)   // retriggers the pop animation on every click
    onLike(item.id)          // fire-and-forget — UI already updates optimistically
  }

  function startLongPress(setter, count) {
    if (count > 0) longPressTimer.current = setTimeout(() => setter(true), 500)
  }
  function endLongPress() {
    clearTimeout(longPressTimer.current)
  }

  return (
    <div className={`feed-card${isActive ? ' is-active' : ' is-inactive'}`}>
      {/* Glass sheen overlay */}
      <div className="feed-card-sheen" />

      {/* Header row */}
      <div className="feed-card-header">
        <div className="flex items-center gap-3">
          <div className="feed-avatar">
            {(item.author?.full_name || item.author?.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: '#0c2540' }}>
              {item.author?.full_name || item.author?.username || 'ਅਣਜਾਣ'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(12,36,64,0.42)' }}>
              {timeAgo(item.created_at)}
            </p>
          </div>
        </div>
        <button
          onClick={handleCardClick}
          className="feed-nav-btn"
          title="ਵਿਸ਼ੇ ਵੱਲ ਜਾਓ"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Topic → Angle breadcrumb */}
      <div className="px-5 py-2.5 relative" style={{ zIndex: 2 }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="badge-royal" style={{ fontSize: '11px' }}>
            {item.angle?.topic?.title}
          </span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(12,36,64,0.28)" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="badge-gold" style={{ fontSize: '11px' }}>
            {item.angle?.title}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="divider-royal mx-5" />

      {/* Shabad text */}
      <div className="feed-shabad-body" onClick={handleCardClick}>
        <p className="gurbani-text whitespace-pre-wrap" style={{ color: '#0c2540', fontSize: '1.05rem', lineHeight: 2 }}>
          {item.shabad_text}
        </p>
      </div>

      {/* Translation / comment */}
      {item.comment && (
        <div className="feed-comment" onClick={handleCardClick}>
          <p className="text-sm leading-relaxed italic" style={{ color: 'rgba(12,36,64,0.62)', lineHeight: 1.75 }}>
            "{item.comment}"
          </p>
        </div>
      )}

      {/* Footer: like + view */}
      <div className="feed-card-footer" style={{ gap: '10px' }}>
        {/* Like */}
        <div className="relative">
          <button
            key={likePop}
            className={`feed-like-btn${isLiked ? ' liked' : ''}`}
            onClick={handleLike}
            onMouseEnter={() => likers.length > 0 && setShowLikers(true)}
            onMouseLeave={() => setShowLikers(false)}
            onTouchStart={() => startLongPress(setShowLikers, likers.length)}
            onTouchEnd={endLongPress}
            style={likePop > 0 ? { animation: 'likePopIn 0.32s ease-out' } : {}}
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🙏🏻</span>
            <span className="font-semibold text-sm ml-1.5">{likers.length}</span>
          </button>

          {showLikers && likers.length > 0 && (
            <div
              className="feed-likers-tooltip"
              onMouseEnter={() => setShowLikers(true)}
              onMouseLeave={() => setShowLikers(false)}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(12,36,64,0.45)', letterSpacing: '0.04em' }}>
                ਝੁਕਿਆ ਮੱਥਾ
              </p>
              {likers.map(l => (
                <div key={l.user_id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white', fontSize: '9px' }}
                  >
                    {(l.full_name || l.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs" style={{ color: '#0c2540' }}>
                    {l.full_name || l.username}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Views */}
        <div className="relative">
          <button
            className="feed-view-btn"
            onClick={e => { e.stopPropagation(); if (viewers.length > 0) setShowViewers(v => !v) }}
            onMouseEnter={() => viewers.length > 0 && setShowViewers(true)}
            onMouseLeave={() => setShowViewers(false)}
            onTouchStart={() => startLongPress(setShowViewers, viewers.length)}
            onTouchEnd={endLongPress}
            title="ਕਿੰਨਿਆਂ ਨੇ ਵੇਖਿਆ"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="font-semibold text-sm ml-1.5">{viewers.length}</span>
          </button>

          {showViewers && viewers.length > 0 && (
            <div
              className="feed-likers-tooltip"
              onMouseEnter={() => setShowViewers(true)}
              onMouseLeave={() => setShowViewers(false)}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(12,36,64,0.45)', letterSpacing: '0.04em' }}>
                ਵੇਖਣ ਵਾਲੇ
              </p>
              {viewers.map(v => (
                <div key={v.user_id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white', fontSize: '9px' }}
                  >
                    {(v.full_name || v.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs" style={{ color: '#0c2540' }}>
                    {v.full_name || v.username}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="feed-reel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke="rgba(26,95,143,0.5)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  )
}

export default function JhalakPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shabads, setShabads] = useState([])
  const [likes, setLikes] = useState({})
  const [views, setViews] = useState({})
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const tokenRef = useRef(null)
  const reelRef = useRef(null)
  const likeQueueRef = useRef({})     // shabadId -> { desired, running }
  const viewedRef = useRef(new Set()) // shabadIds already marked viewed this session
  const startIndexRef = useRef(0)
  const didInitScrollRef = useRef(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      setProfile(prof)
      setCurrentUserId(user.id)

      const { data: { session } } = await supabase.auth.getSession()
      tokenRef.current = session?.access_token

      const res = await fetch('/api/feed', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setShabads(data.shabads || [])
      setLikes(data.likes || {})
      setViews(data.views || {})
      startIndexRef.current = data.startIndex || 0
      setActiveIndex(data.startIndex || 0)
      // Anything already viewed shouldn't be re-posted this session
      for (const s of (data.shabads || [])) {
        if ((data.views?.[s.id] || []).some(v => v.user_id === user.id)) viewedRef.current.add(s.id)
      }

      setLoading(false)
    }
    init()
  }, [router])

  const feedItems = shabads.map(s => ({ ...s, likers: likes[s.id] || [], viewers: views[s.id] || [] }))

  // Active-card detection + initial positioning, driven by scroll position.
  // Using the nearest slide to the scroll offset guarantees exactly one active
  // card at all times (even mid-scroll), unlike a visibility-threshold observer.
  useEffect(() => {
    if (loading) return
    const root = reelRef.current
    if (!root) return

    function computeActive() {
      const list = root.querySelectorAll('[data-slide]')
      if (!list.length) return
      const pos = root.scrollTop
      let best = 0
      let bestDist = Infinity
      for (const el of list) {
        const d = Math.abs(el.offsetTop - pos)
        if (d < bestDist) { bestDist = d; best = Number(el.dataset.slide) }
      }
      setActiveIndex(best)
    }

    // Jump straight to the first unviewed card on the first load (no animation)
    if (!didInitScrollRef.current) {
      didInitScrollRef.current = true
      const target = root.querySelector(`[data-slide="${startIndexRef.current}"]`)
      if (target) root.scrollTop = target.offsetTop
    }
    computeActive()

    let raf = 0
    function onScroll() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(computeActive)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => { root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [loading, feedItems.length])

  // Mark the focused card as viewed (records who has seen it) — background, fire-and-forget
  useEffect(() => {
    if (loading) return
    const item = feedItems[activeIndex]
    if (!item || viewedRef.current.has(item.id)) return
    viewedRef.current.add(item.id)

    // optimistic: add me to this card's viewers
    setViews(prev => {
      const current = prev[item.id] || []
      if (current.some(v => v.user_id === currentUserId)) return prev
      return {
        ...prev,
        [item.id]: [...current, { user_id: currentUserId, full_name: profile?.full_name, username: profile?.username }],
      }
    })

    fetch(`/api/feed/${item.id}/view`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    }).catch(() => {})
  }, [activeIndex, loading])

  // Instant optimistic toggle; the backend is reconciled in the background.
  function handleLike(shabadId) {
    const currentlyLiked = (likes[shabadId] || []).some(l => l.user_id === currentUserId)
    const nextLiked = !currentlyLiked

    // 1. Update the UI immediately — no waiting on the network
    setLikes(prev => {
      const current = prev[shabadId] || []
      const without = current.filter(l => l.user_id !== currentUserId)
      if (nextLiked) {
        return {
          ...prev,
          [shabadId]: [...without, { user_id: currentUserId, full_name: profile?.full_name, username: profile?.username }],
        }
      }
      return { ...prev, [shabadId]: without }
    })

    // 2. Hand the desired state to the per-shabad background queue
    enqueueLikeSync(shabadId, nextLiked)
  }

  // Per-shabad FIFO queue: processes one request at a time, always syncing to the
  // latest desired state. Rapid clicks collapse to the final intent.
  async function enqueueLikeSync(shabadId, desired) {
    const q = likeQueueRef.current
    const entry = q[shabadId] || (q[shabadId] = { desired, running: false })
    entry.desired = desired

    if (entry.running) return
    entry.running = true

    try {
      while (true) {
        const want = entry.desired
        let ok = false
        try {
          const res = await fetch(`/api/feed/${shabadId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
            body: JSON.stringify({ liked: want }),
          })
          ok = res.ok
        } catch {
          ok = false
        }

        // Someone clicked again while we were waiting → process the new intent next
        if (entry.desired !== want) continue

        // Settled. On failure, revert the UI to the real (unchanged) state.
        if (!ok) {
          setLikes(prev => {
            const current = prev[shabadId] || []
            const without = current.filter(l => l.user_id !== currentUserId)
            if (!want) {
              return {
                ...prev,
                [shabadId]: [...without, { user_id: currentUserId, full_name: profile?.full_name, username: profile?.username }],
              }
            }
            return { ...prev, [shabadId]: without }
          })
        }
        break
      }
    } finally {
      q[shabadId].running = false
    }
  }

  if (loading) {
    return (
      <>
        <TopBar profile={null} />
        <LoadingScreen />
      </>
    )
  }

  if (feedItems.length === 0) {
    return (
      <>
        <TopBar profile={profile} />
        <div className="feed-reel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div className="glass-card-static rounded-2xl p-14 text-center">
            <div className="text-5xl mb-4">🌱</div>
            <p className="font-semibold text-lg mb-1 gurbani-text" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਸ਼ਬਦ ਨਹੀਂ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਕਿਸੇ ਵਿਸ਼ੇ ਵਿੱਚ ਸ਼ਬਦ ਜੋੜੋ</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar profile={profile} />

      <div className="feed-reel" ref={reelRef}>
        {feedItems.map((item, i) => (
          <div className="feed-slide" data-slide={i} key={item.id}>
            <FeedCard
              item={item}
              currentUserId={currentUserId}
              onLike={handleLike}
              isActive={i === activeIndex}
            />
          </div>
        ))}

        <div className="feed-slide feed-slide-end">
          <span style={{ color: 'rgba(12,36,64,0.3)', fontSize: '1.5rem' }}>ੴ</span>
        </div>
      </div>

      {/* Swipe hint */}
      {feedItems.length > 1 && (
        <div className="feed-scroll-hint">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(26,95,143,0.55)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10l5 5 5-5" />
            <path d="M7 5l5 5 5-5" opacity="0.5" />
          </svg>
        </div>
      )}
    </>
  )
}
