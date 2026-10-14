'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, useIsomorphicLayoutEffect } from '../../lib/clientCache'
import TopBar from '../../components/TopBar'

export default function FavouritesPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [shabads, setShabads] = useState([])
  const [favourites, setFavourites] = useState(() => new Set())
  const [kanth, setKanth] = useState(() => new Set())
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef(null)

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

      // Load kanth state
      const kRes = await fetch('/api/kanth', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const kData = await kRes.json()
      setKanth(new Set((kData.shabads || []).map(s => s.id)))

      setLoading(false)
    }
    init()
  }, [router])

  function unfavourite(shabadId) {
    setFavourites(prev => { const n = new Set(prev); n.delete(shabadId); return n })
    fetch(`/api/favourites/${shabadId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    }).catch(() => {
      setFavourites(prev => { const n = new Set(prev); n.add(shabadId); return n })
    })
  }

  function toggleKanth(shabadId) {
    const wasKanth = kanth.has(shabadId)
    setKanth(prev => { const n = new Set(prev); if (wasKanth) n.delete(shabadId); else n.add(shabadId); return n })
    fetch(`/api/kanth/${shabadId}`, {
      method: wasKanth ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    }).catch(() => {
      setKanth(prev => { const n = new Set(prev); if (wasKanth) n.add(shabadId); else n.delete(shabadId); return n })
    })
  }

  function toggleCollapse(topicId) {
    setCollapsed(prev => ({ ...prev, [topicId]: !prev[topicId] }))
  }

  const visible = shabads.filter(s => favourites.has(s.id))

  // Group by topic
  const groups = []
  const seen = {}
  for (const s of visible) {
    const tid = s.angle?.topic?.id || '__other'
    const ttitle = s.angle?.topic?.title || 'ਹੋਰ'
    if (!seen[tid]) { seen[tid] = groups.length; groups.push({ id: tid, title: ttitle, shabads: [] }) }
    groups[seen[tid]].shabads.push(s)
  }

  if (loading) {
    return (
      <>
        <TopBar profile={profile} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <span className="text-3xl ik-onkar" style={{ opacity: 0.4 }}>ੴ</span>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar profile={profile} />

      <div className="page-body" style={{ background: 'linear-gradient(160deg, #fdf8f0 0%, #f5f0e8 100%)', minHeight: '100vh' }}>
        <div className="max-w-xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-8" style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 52, height: 52, borderRadius: '50%', marginBottom: 12,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold gurbani-text" style={{ color: '#78350f' }}>ਮਨਪਸੰਦ ਸ਼ਬਦ</h1>
            {visible.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 6 }}>
                <p className="text-sm" style={{ color: 'rgba(120,53,15,0.5)' }}>
                  {visible.length} ਸ਼ਬਦ · {groups.length} ਵਿਸ਼ੇ
                </p>
                <button
                  onClick={() => {
                    const allCollapsed = groups.every(g => collapsed[g.id])
                    if (allCollapsed) {
                      setCollapsed({})
                    } else {
                      const all = {}
                      groups.forEach(g => { all[g.id] = true })
                      setCollapsed(all)
                    }
                  }}
                  style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px',
                    borderRadius: 20, cursor: 'pointer',
                    border: '1px solid rgba(245,158,11,0.35)',
                    background: 'rgba(245,158,11,0.08)',
                    color: '#92400e', letterSpacing: '0.02em',
                  }}
                >
                  {groups.every(g => collapsed[g.id]) ? 'ਸਭ ਖੋਲ੍ਹੋ' : 'ਸਭ ਬੰਦ ਕਰੋ'}
                </button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '4rem 2rem',
              background: 'rgba(255,255,255,0.6)',
              borderRadius: 20, border: '1px solid rgba(245,158,11,0.15)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>☆</div>
              <p className="font-semibold gurbani-text" style={{ color: '#78350f', marginBottom: 6 }}>ਅਜੇ ਕੋਈ ਮਨਪਸੰਦ ਸ਼ਬਦ ਨਹੀਂ</p>
              <p className="text-sm" style={{ color: 'rgba(120,53,15,0.45)' }}>ਸਾਂਝ ਵਿੱਚੋਂ ਕਿਸੇ ਸ਼ਬਦ ਨੂੰ ★ ਨਾਲ ਸੰਭਾਲੋ</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {groups.map((group, gi) => {
                const isOpen = !collapsed[group.id]
                return (
                  <div key={group.id} style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    boxShadow: '0 2px 12px rgba(120,53,15,0.06)',
                  }}>
                    {/* Topic header — tap to collapse */}
                    <button
                      onClick={() => toggleCollapse(group.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        gap: 10, padding: '14px 18px',
                        background: 'linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)',
                        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                        borderBottom: isOpen ? '1px solid rgba(245,158,11,0.15)' : 'none',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                      }} />
                      <span className="font-semibold gurbani-text flex-1 text-left" style={{ color: '#92400e', fontSize: '0.95rem' }}>
                        {group.title}
                      </span>
                      <span style={{ color: 'rgba(120,53,15,0.35)', fontSize: '0.75rem', marginRight: 6 }}>
                        {group.shabads.length}
                      </span>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="rgba(120,53,15,0.4)" strokeWidth="2.5" strokeLinecap="round"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease', flexShrink: 0 }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Shabads list */}
                    {isOpen && (
                      <div>
                        {group.shabads.map((s, si) => (
                          <div
                            key={s.id}
                            style={{
                              padding: '18px 20px',
                              borderTop: si > 0 ? '1px solid rgba(245,158,11,0.1)' : 'none',
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                            }}
                          >
                            {/* Verse number dot */}
                            <span style={{
                              flexShrink: 0, marginTop: 6,
                              width: 20, height: 20, borderRadius: '50%',
                              background: 'rgba(245,158,11,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.6rem', fontWeight: 700, color: '#b45309',
                            }}>
                              {si + 1}
                            </span>

                            {/* Shabad text */}
                            <p
                              className="gurbani-text flex-1"
                              style={{
                                color: '#1c1410',
                                fontSize: '1rem',
                                lineHeight: 2,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {s.shabad_text}
                            </p>

                            {/* Action buttons */}
                            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                              {/* Navigate to topic */}
                              {s.angle?.topic?.id && (
                                <Link
                                  href={`/topics/${s.angle.topic.id}?openAngle=${s.angle.id}#shabad-${s.id}`}
                                  title="ਵਿਸ਼ੇ ਵਿੱਚ ਦੇਖੋ"
                                  style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(14,65,110,0.07)',
                                    border: '1px solid rgba(14,65,110,0.15)',
                                    color: '#1a5f8f',
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                  </svg>
                                </Link>
                              )}
                              {/* Kanth toggle */}
                              <button
                                onClick={() => toggleKanth(s.id)}
                                title={kanth.has(s.id) ? 'ਕੰਠ ਤੋਂ ਹਟਾਓ' : 'ਕੰਠ ਕਰੋ'}
                                style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: kanth.has(s.id) ? 'rgba(139,92,246,0.1)' : 'rgba(245,158,11,0.08)',
                                  border: `1px solid ${kanth.has(s.id) ? 'rgba(139,92,246,0.3)' : 'rgba(245,158,11,0.2)'}`,
                                  cursor: 'pointer',
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                  stroke={kanth.has(s.id) ? '#8b5cf6' : '#b45309'}
                                  strokeLinecap="round" strokeLinejoin="round">
                                  <path fill={kanth.has(s.id) ? 'rgba(139,92,246,0.15)' : 'none'} strokeWidth="1.8"
                                    d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.99-3.01 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3z" />
                                  <path fill={kanth.has(s.id) ? 'rgba(139,92,246,0.15)' : 'none'} strokeWidth="1.8"
                                    d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.99-3.01 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3z" />
                                  <circle cx="19" cy="5" r="4.5" fill={kanth.has(s.id) ? 'rgba(139,92,246,0.12)' : 'white'} strokeWidth="1.3" />
                                  <path d="M19 2.8v4.4M16.8 5h4.4" strokeWidth="1.6" />
                                </svg>
                              </button>
                              {/* Unfavourite */}
                              <button
                                onClick={() => unfavourite(s.id)}
                                title="ਮਨਪਸੰਦ ਤੋਂ ਹਟਾਓ"
                                style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'rgba(245,158,11,0.1)',
                                  border: '1px solid rgba(245,158,11,0.25)',
                                  cursor: 'pointer', transition: 'all 0.18s ease',
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
                                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'rgba(245,158,11,0.1)'
                                  e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
