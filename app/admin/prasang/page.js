'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { notifyPrasangAdded } from '../../../lib/push'
import TopBar from '../../../components/TopBar'

export default function AdminPrasangPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [prasangs, setPrasangs] = useState([])
  const [contributions, setContributions] = useState({}) // prasangId → flat array of { angle, shabad, author }
  const [expandedPrasang, setExpandedPrasang] = useState({})
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'admin') { router.push('/topics'); return }
      setProfile(prof)

      const { data: prasangData } = await supabase
        .from('prasangs')
        .select('*')
        .order('created_at', { ascending: false })
      setPrasangs(prasangData || [])

      setLoading(false)
    }
    load()
  }, [router])

  async function loadContributions(prasangId) {
    if (contributions[prasangId]) return

    // Fetch all angles for this prasang (all users)
    const { data: angles } = await supabase
      .from('prasang_angles')
      .select('*, author:profiles!prasang_angles_created_by_fkey(full_name, username)')
      .eq('prasang_id', prasangId)
      .order('created_at', { ascending: true })

    const angleList = angles || []
    if (!angleList.length) {
      setContributions(prev => ({ ...prev, [prasangId]: [] }))
      return
    }

    const angleIds = angleList.map(a => a.id)
    const { data: shabadsData } = await supabase
      .from('prasang_shabads')
      .select('*, author:profiles!prasang_shabads_created_by_fkey(full_name, username)')
      .in('prasang_angle_id', angleIds)
      .order('created_at', { ascending: true })

    // Build flat contribution list ordered by shabad creation time
    const angleMap = {}
    for (const a of angleList) angleMap[a.id] = a

    const rows = (shabadsData || []).map(s => ({
      shabadId: s.id,
      shabadText: s.shabad_text,
      comment: s.comment,
      shabadCreatedAt: s.created_at,
      angle: angleMap[s.prasang_angle_id],
      author: s.author,
    }))

    setContributions(prev => ({ ...prev, [prasangId]: rows }))
  }

  function togglePrasang(prasangId) {
    const next = !expandedPrasang[prasangId]
    setExpandedPrasang(prev => ({ ...prev, [prasangId]: next }))
    if (next) loadContributions(prasangId)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch('/api/prasang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() }),
    })
    if (res.ok) {
      const { prasang, shouldNotify } = await res.json()
      setPrasangs(prev => [prasang, ...prev])
      if (shouldNotify) notifyPrasangAdded(prasang.id)
      setShowAdd(false)
      setNewTitle('')
      setNewDesc('')
    }
    setSaving(false)
  }

  async function handleDelete(prasangId) {
    setDeleting(true)
    const token = await getToken()
    const res = await fetch(`/api/prasang/${prasangId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setPrasangs(prev => prev.filter(p => p.id !== prasangId))
      setShowDeleteConfirm(null)
    }
    setDeleting(false)
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 animate-fadeInUp">
          <div>
            <button onClick={() => router.push('/admin')} className="text-sm mb-2 flex items-center gap-1"
              style={{ color: 'rgba(12,36,64,0.45)' }}>
              ← ਡੈਸ਼ਬੋਰਡ
            </button>
            <h1 className="text-2xl font-bold" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ ਪ੍ਰਬੰਧਨ</h1>
            <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਸਾਰੇ ਵਰਤੋਂਕਾਰਾਂ ਦੀਆਂ ਐਂਟਰੀਆਂ</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-gold text-sm px-4 py-2.5">
            + ਨਵਾਂ ਪ੍ਰਸੰਗ
          </button>
        </div>

        {prasangs.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-12 text-center">
            <div className="text-5xl mb-3">📖</div>
            <p className="font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਪ੍ਰਸੰਗ ਨਹੀਂ</p>
          </div>
        ) : (
          <div className="space-y-4">
            {prasangs.map((prasang, pi) => {
              const expanded = expandedPrasang[prasang.id]
              const rows = contributions[prasang.id]
              return (
                <div key={prasang.id} className="glass-card-static rounded-2xl overflow-hidden animate-fadeInUp" style={{ animationDelay: `${pi * 0.04}s` }}>
                  {/* Header */}
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                    onClick={() => togglePrasang(prasang.id)}
                    style={{ borderBottom: expanded ? '1px solid rgba(14,65,110,0.08)' : 'none' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold gurbani-text" style={{ color: '#0c2540' }}>{prasang.title}</p>
                        {prasang.is_admin_created && <span className="badge-gold text-xs">ਸਾਂਝਾ</span>}
                        <span className="text-xs" style={{ color: 'rgba(12,36,64,0.4)' }}>
                          {new Date(prasang.created_at).toLocaleDateString('pa-IN')}
                        </span>
                      </div>
                      {prasang.description && (
                        <p className="text-sm mt-0.5" style={{ color: 'rgba(12,36,64,0.45)' }}>{prasang.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setShowDeleteConfirm(prasang.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#dc2626' }}>
                        ਮਿਟਾਓ
                      </button>
                    </div>
                    <span
                      className="flex items-center justify-center rounded-full transition-all duration-300 flex-shrink-0"
                      style={{ width: 28, height: 28, background: expanded ? 'rgba(14,65,110,0.1)' : 'rgba(14,65,110,0.05)', color: '#1a5f8f', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>

                  {/* Contributions */}
                  {expanded && (
                    <div>
                      {!rows ? (
                        <div className="px-5 py-6 text-center text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</div>
                      ) : rows.length === 0 ? (
                        <div className="px-5 py-6 text-center text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>
                          ਅਜੇ ਕਿਸੇ ਨੇ ਸ਼ਬਦ ਨਹੀਂ ਜੋੜਿਆ
                        </div>
                      ) : (
                        <div>
                          {rows.map((row, ri) => (
                            <div key={row.shabadId} className="px-5 py-4"
                              style={{ borderTop: ri > 0 ? '1px solid rgba(14,65,110,0.06)' : 'none' }}>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
                                  {(row.author?.full_name || row.author?.username || '?')[0].toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold" style={{ color: '#1a5f8f' }}>
                                  {row.author?.full_name || row.author?.username}
                                </span>
                                <span className="text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>·</span>
                                <span className="text-xs badge-royal">{row.angle?.title}</span>
                                <span className="text-xs ml-auto" style={{ color: 'rgba(12,36,64,0.3)' }}>
                                  {new Date(row.shabadCreatedAt).toLocaleDateString('pa-IN')}
                                </span>
                              </div>
                              <p className="gurbani-text text-sm leading-relaxed whitespace-pre-wrap mb-1" style={{ color: '#0c2540' }}>
                                {row.shabadText}
                              </p>
                              {row.comment && (
                                <p className="text-xs italic" style={{ color: 'rgba(12,36,64,0.55)' }}>"{row.comment}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Prasang Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAdd(false), setNewTitle(''), setNewDesc(''))}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-1" style={{ color: '#0c2540' }}>ਨਵਾਂ ਪ੍ਰਸੰਗ ਜੋੜੋ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਇਹ ਸਾਰੇ ਵਰਤੋਂਕਾਰਾਂ ਨੂੰ ਦਿਖੇਗਾ ਅਤੇ ਸੂਚਨਾ ਭੇਜੀ ਜਾਵੇਗੀ</p>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਪ੍ਰਸੰਗ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਗੁਰਮੁਖੀ ਵਿੱਚ ਲਿਖੋ" value={newTitle} onChange={e => setNewTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setNewTitle(''); setNewDesc('') }} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-gold flex-1 py-3">{saving ? 'ਜੋੜਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deleting && setShowDeleteConfirm(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>ਸਾਰੇ ਵਰਤੋਂਕਾਰਾਂ ਦੇ ਸ਼ਬਦ ਸਮੇਤ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਵੇਗਾ।</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} disabled={deleting} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} disabled={deleting} className="btn-danger flex-1 py-3">
                {deleting ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
