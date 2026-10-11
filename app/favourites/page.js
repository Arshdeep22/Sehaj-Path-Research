'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, useIsomorphicLayoutEffect } from '../../lib/clientCache'
import TopBar from '../../components/TopBar'
import FeedCard from '../../components/FeedCard'

export default function FavouritesPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shabads, setShabads] = useState([])
  const [favourites, setFavourites] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef(null)

  // Paint the top bar instantly from cache while the list loads fresh.
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

      const { data: { session } } = await supabase.auth.getSession()
      tokenRef.current = session?.access_token

      const res = await fetch('/api/favourites', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      const list = data.shabads || []
      setShabads(list)
      setFavourites(new Set(list.map(s => s.id)))

      setLoading(false)
    }
    init()
  }, [router])

  // Remove from favourites with optimistic UI; revert on failure.
  function toggleFavourite(shabadId) {
    const wasFav = favourites.has(shabadId)
    setFavourites(prev => {
      const next = new Set(prev)
      if (wasFav) next.delete(shabadId); else next.add(shabadId)
      return next
    })
    fetch(`/api/favourites/${shabadId}`, {
      method: wasFav ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    })
      .then(res => { if (!res.ok) throw new Error() })
      .catch(() => {
        setFavourites(prev => {
          const next = new Set(prev)
          if (wasFav) next.add(shabadId); else next.delete(shabadId)
          return next
        })
      })
  }

  // Only show cards still favourited; an optimistic un-favourite drops the card,
  // and a failed request re-adds it to the Set (so it reappears).
  const visible = shabads.filter(s => favourites.has(s.id))

  if (loading) {
    return (
      <>
        <TopBar profile={profile} />
        <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <span className="text-3xl ik-onkar" style={{ opacity: 0.5 }}>ੴ</span>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar profile={profile} />

      <div className="page-body">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">⭐</div>
            <h1 className="text-2xl font-bold" style={{ color: '#0c2540' }}>ਮਨਪਸੰਦ ਸ਼ਬਦ</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਤੁਹਾਡੇ ਸੰਭਾਲੇ ਹੋਏ ਸ਼ਬਦ
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="glass-card-static rounded-2xl p-14 text-center">
              <div className="text-5xl mb-4">☆</div>
              <p className="font-semibold text-lg mb-1 gurbani-text" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਮਨਪਸੰਦ ਸ਼ਬਦ ਨਹੀਂ</p>
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਸਾਂਝ ਵਿੱਚੋਂ ਕਿਸੇ ਸ਼ਬਦ ਨੂੰ ☆ ਨਾਲ ਸੰਭਾਲੋ</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {visible.map(item => (
                <FeedCard
                  key={item.id}
                  item={item}
                  isActive
                  isFavourite={favourites.has(item.id)}
                  onToggleFavourite={toggleFavourite}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
