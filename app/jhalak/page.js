'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, useIsomorphicLayoutEffect, getProfileCached } from '../../lib/clientCache'
import { useAppStore } from '../../lib/store'
import TopBar from '../../components/TopBar'
import FeedCard from '../../components/FeedCard'

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
  const prevActiveIndexRef = useRef(0) // tracks previous activeIndex to fill gaps on fast scroll
  const startIndexRef = useRef(0)
  const didInitScrollRef = useRef(false)

  // Store slices — subscribe narrowly so only relevant state changes trigger re-renders
  const favouriteIds = useAppStore(s => s.favouriteIds)
  const kanthIds     = useAppStore(s => s.kanthIds)
  const { setFeedData, markViewed, toggleFavourite, revertFavourite, toggleKanth, revertKanth, setProfile: storeSetProfile } = useAppStore.getState()

  // Seed profile from cache so the top bar (score/avatar) paints instantly.
  // Feed data itself is always loaded fresh — stale read/unread order would mislead.
  useIsomorphicLayoutEffect(() => {
    const p = getCache('profile')
    if (p) setProfile(p)
  }, [])

  useEffect(() => {
    async function init() {
      // Fast path: skip getUser()+profiles.select() using the cached session.
      // Feed data is still fetched fresh (stale ordering would mislead).
      let userId, token
      const fast = getCache('profile') ? await getProfileCached() : null
      if (fast) {
        setProfile(fast.profile)
        userId = fast.profile.id
        token = fast.token
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (!prof || prof.must_change_password) { router.push('/change-password'); return }
        setProfile(prof)
        setCache('profile', prof)
        userId = user.id
        const { data: { session } } = await supabase.auth.getSession()
        token = session?.access_token
      }
      setCurrentUserId(userId)
      tokenRef.current = token

      const res = await fetch('/api/feed', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const shabadList = data.shabads || []
      const viewsMap   = data.views || {}

      setShabads(shabadList)
      setViews(viewsMap)
      startIndexRef.current = data.startIndex || 0
      setActiveIndex(data.startIndex || 0)

      // Seed the store — computes unreadCount and propagates favourites/kanth/viewedIds
      setFeedData({ shabads: shabadList, views: viewsMap, viewedIds: data.viewedIds, favouriteIds: data.favouriteIds, kanthIds: data.kanthIds, currentUserId: userId })

      // Seed viewedRef from the authoritative per-user list so we don't re-post views
      for (const id of (data.viewedIds || [])) {
        viewedRef.current.add(id)
      }

      setLoading(false)
    }
    init()
  }, [router])

  const feedItems = shabads.map(s => ({ ...s, viewers: views[s.id] || [] }))

  // Toggle favourite with optimistic UI via store; revert if the request fails.
  function handleToggleFavourite(shabadId) {
    const nowFav = toggleFavourite(shabadId)
    fetch(`/api/favourites/${shabadId}`, {
      method: nowFav ? 'POST' : 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
      .then(res => { if (!res.ok) throw new Error() })
      .catch(() => revertFavourite(shabadId, !nowFav))
  }

  // Toggle kanth (memorized) with optimistic UI via store.
  function handleToggleKanth(shabadId) {
    const nowKanth = toggleKanth(shabadId)
    fetch(`/api/kanth/${shabadId}`, {
      method: nowKanth ? 'POST' : 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
      .then(res => { if (!res.ok) throw new Error() })
      .catch(() => revertKanth(shabadId, !nowKanth))
  }

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

  // Mark every card between the previous and current active index as viewed.
  // The RAF-debounced scroll handler can jump multiple cards on a fast flick —
  // filling the gap ensures every card the user scrolled past gets marked and posted.
  useEffect(() => {
    if (loading) return

    const from = prevActiveIndexRef.current
    const to   = activeIndex
    prevActiveIndexRef.current = to

    const start = Math.min(from, to)
    const end   = Math.max(from, to)

    for (let i = start; i <= end; i++) {
      const item = feedItems[i]
      if (!item || viewedRef.current.has(item.id)) continue
      viewedRef.current.add(item.id)

      markViewed(item.id)

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
    }
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
              isFavourite={favouriteIds.includes(item.id)}
              onToggleFavourite={handleToggleFavourite}
              isKanth={kanthIds.includes(item.id)}
              onToggleKanth={handleToggleKanth}
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
