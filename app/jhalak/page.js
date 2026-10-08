'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, useIsomorphicLayoutEffect } from '../../lib/clientCache'
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

function FeedCard({ item, isActive }) {
  const router = useRouter()

  function handleCardClick() {
    const topicId = item.angle?.topic?.id
    const angleId = item.angle?.id
    if (topicId) {
      router.push(`/topics/${topicId}?openAngle=${angleId}#shabad-${item.id}`)
    }
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
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="feed-reel" style={{ overflow: 'hidden' }}>
      <div className="feed-slide">
        <div className="feed-card is-active" style={{ cursor: 'default' }}>
          <div className="feed-card-sheen" />

          {/* Header */}
          <div className="feed-card-header">
            <div className="flex items-center gap-3">
              <div className="sk-box" style={{ width: 40, height: 40, borderRadius: '9999px' }} />
              <div>
                <div className="sk-box" style={{ width: 120, height: 13, marginBottom: 7 }} />
                <div className="sk-box" style={{ width: 64, height: 10 }} />
              </div>
            </div>
            <div className="sk-box" style={{ width: 34, height: 34, borderRadius: 12 }} />
          </div>

          {/* Breadcrumb */}
          <div className="px-5 py-2.5 flex gap-2">
            <div className="sk-box" style={{ width: 80, height: 20, borderRadius: 9999 }} />
            <div className="sk-box" style={{ width: 96, height: 20, borderRadius: 9999 }} />
          </div>

          <div className="divider-royal mx-5" />

          {/* Shabad lines */}
          <div className="feed-shabad-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="sk-box" style={{ width: '100%', height: 16 }} />
            <div className="sk-box" style={{ width: '85%', height: 16 }} />
            <div className="sk-box" style={{ width: '92%', height: 16 }} />
            <div className="sk-box" style={{ width: '60%', height: 16 }} />
          </div>

          {/* Comment */}
          <div className="feed-comment" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sk-box" style={{ width: '100%', height: 11 }} />
            <div className="sk-box" style={{ width: '70%', height: 11 }} />
          </div>

          {/* Footer */}
          <div className="feed-card-footer">
            <div className="sk-box" style={{ width: 72, height: 38, borderRadius: 12 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function JhalakPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shabads, setShabads] = useState([])
  const [views, setViews] = useState({})
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const tokenRef = useRef(null)
  const reelRef = useRef(null)
  const viewedRef = useRef(new Set()) // shabadIds already marked viewed this session
  const startIndexRef = useRef(0)
  const didInitScrollRef = useRef(false)

  // Seed profile from cache so the top bar (score/avatar) paints instantly.
  // Feed data itself is always loaded fresh — stale read/unread order would mislead.
  useIsomorphicLayoutEffect(() => {
    const p = getCache('profile')
    if (p) setProfile(p)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      setProfile(prof)
      setCache('profile', prof)
      setCurrentUserId(user.id)

      const { data: { session } } = await supabase.auth.getSession()
      tokenRef.current = session?.access_token

      const res = await fetch('/api/feed', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setShabads(data.shabads || [])
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

  const feedItems = shabads.map(s => ({ ...s, viewers: views[s.id] || [] }))

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

    // Tell the nav badge to decrement locally (no extra API call)
    window.dispatchEvent(new CustomEvent('shabad:viewed'))

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
