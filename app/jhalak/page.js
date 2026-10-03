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
  const [likeAnimating, setLikeAnimating] = useState(false)
  const inFlightRef = useRef(false)
  const longPressTimer = useRef(null)

  const likers = item.likers || []
  const isLiked = likers.some(l => l.user_id === currentUserId)

  function handleCardClick() {
    const topicId = item.angle?.topic?.id
    const angleId = item.angle?.id
    if (topicId) {
      router.push(`/topics/${topicId}?openAngle=${angleId}#shabad-${item.id}`)
    }
  }

  async function handleLike(e) {
    e.stopPropagation()
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLikeAnimating(true)
    try {
      await onLike(item.id)
    } finally {
      setLikeAnimating(false)
      inFlightRef.current = false
    }
  }

  function handleTouchStart() {
    if (likers.length > 0) {
      longPressTimer.current = setTimeout(() => setShowLikers(true), 550)
    }
  }
  function handleTouchEnd() {
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

      {/* Footer: like button */}
      <div className="feed-card-footer">
        <div className="relative">
          <button
            className={`feed-like-btn${isLiked ? ' liked' : ''}`}
            onClick={handleLike}
            onMouseEnter={() => likers.length > 0 && setShowLikers(true)}
            onMouseLeave={() => setShowLikers(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={likeAnimating ? { animation: 'likePopIn 0.32s ease-out' } : {}}
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
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const tokenRef = useRef(null)
  const likingRef = useRef(new Set())
  const reelRef = useRef(null)
  const loadMoreRef = useRef(null)
  const PAGE = 15

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

      const res = await fetch(`/api/feed?limit=${PAGE}&offset=0`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setShabads(data.shabads || [])
      setLikes(data.likes || {})
      if ((data.shabads || []).length < PAGE) setHasMore(false)

      setLoading(false)
    }
    init()
  }, [router])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const res = await fetch(`/api/feed?limit=${PAGE}&offset=${shabads.length}`, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
    const data = await res.json()
    setShabads(prev => [...prev, ...(data.shabads || [])])
    setLikes(prev => ({ ...prev, ...(data.likes || {}) }))
    if ((data.shabads || []).length < PAGE) setHasMore(false)
    setLoadingMore(false)
  }
  loadMoreRef.current = loadMore

  const feedItems = shabads.map(s => ({ ...s, likers: likes[s.id] || [] }))

  // Track which card is centered in the reel → it becomes the active (focused) card
  useEffect(() => {
    if (loading) return
    const root = reelRef.current
    if (!root) return
    const slides = root.querySelectorAll('[data-slide]')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.55) {
            setActiveIndex(Number(e.target.dataset.slide))
          }
        }
      },
      { root, threshold: [0.55, 0.8] }
    )
    slides.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [loading, feedItems.length])

  // Pre-load the next page a few cards before the end
  useEffect(() => {
    if (!loading && activeIndex >= feedItems.length - 3) loadMoreRef.current?.()
  }, [activeIndex, feedItems.length, loading])

  async function handleLike(shabadId) {
    if (likingRef.current.has(shabadId)) return
    likingRef.current.add(shabadId)
    try {
      const res = await fetch(`/api/feed/${shabadId}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      })
      const data = await res.json()
      setLikes(prev => {
        const current = prev[shabadId] || []
        if (data.liked) {
          const newLiker = { user_id: currentUserId, ...(data.liker || {}) }
          const deduped = current.filter(l => l.user_id !== currentUserId)
          return { ...prev, [shabadId]: [...deduped, newLiker] }
        }
        return { ...prev, [shabadId]: current.filter(l => l.user_id !== currentUserId) }
      })
    } finally {
      likingRef.current.delete(shabadId)
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

        {!hasMore && (
          <div className="feed-slide feed-slide-end">
            <span style={{ color: 'rgba(12,36,64,0.3)', fontSize: '1.5rem' }}>ੴ</span>
          </div>
        )}
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
