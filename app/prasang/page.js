'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, useIsomorphicLayoutEffect } from '../../lib/clientCache'
import { useAppStore } from '../../lib/store'
import { notifyPrasangAdded } from '../../lib/push'
import TopBar from '../../components/TopBar'

export default function PrasangPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const [showEdit, setShowEdit] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Store slice — re-renders only when prasangs array reference changes
  const prasangs = useAppStore(s => s.prasangs)
  const { isPrasangFresh, setPrasangs, seedPrasangsFromCache, addPrasang, updatePrasang, deletePrasang: storeDel } = useAppStore.getState()

  useIsomorphicLayoutEffect(() => {
    const p = getCache('profile')
    const c = getCache('prasang')
    if (p) setProfile(p)
    if (c && p) {
      seedPrasangsFromCache(c.prasangs || [])
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      if (prof.role === 'admin') { router.push('/admin'); return }
      setProfile(prof)
      setCache('profile', prof)

      if (isPrasangFresh()) { setLoading(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/prasang', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const { prasangs: list } = await res.json()
      setPrasangs(list || [])
      setCache('prasang', { prasangs: list || [] })
      setLoading(false)
    }
    load()
  }, [router])

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
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    if (res.ok) {
      const { prasang, shouldNotify } = await res.json()
      addPrasang(prasang)
      setCache('prasang', { prasangs: [...useAppStore.getState().prasangs] })
      if (shouldNotify) notifyPrasangAdded(prasang.id)
      setShowAdd(false)
      setNewTitle('')
    }
    setSaving(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editTitle.trim() || !showEdit) return
    setSavingEdit(true)
    const token = await getToken()
    const res = await fetch(`/api/prasang/${showEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
    })
    if (res.ok) {
      const { prasang } = await res.json()
      updatePrasang(prasang.id, prasang)
      setCache('prasang', { prasangs: [...useAppStore.getState().prasangs] })
      setShowEdit(null)
    }
    setSavingEdit(false)
  }

  async function handleDelete(prasangId) {
    setDeleting(true)
    const token = await getToken()
    const res = await fetch(`/api/prasang/${prasangId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      storeDel(prasangId)
      setCache('prasang', { prasangs: [...useAppStore.getState().prasangs] })
      setShowDeleteConfirm(null)
    }
    setDeleting(false)
  }

  if (loading) return <LoadingScreen />

  const adminPrasangs = prasangs.filter(p => p.is_admin_created)
  const myPrasangs = prasangs.filter(p => !p.is_admin_created && p.created_by === profile?.id)

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-5 animate-fadeInUp">
          <div>
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ</h1>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>ਆਪਣੇ ਸ਼ਬਦਾਂ ਦਾ ਸੰਗ੍ਰਹਿ</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-gold text-sm px-4 py-2.5 flex-shrink-0" style={{ fontSize: '13px' }}>
            + ਨਵਾਂ ਪ੍ਰਸੰਗ
          </button>
        </div>

        {/* Admin-created (shared) prasangs */}
        {adminPrasangs.length > 0 && (
          <div className="mb-6 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
            <h2 className="text-sm font-semibold mb-2 px-1" style={{ color: 'rgba(12,36,64,0.5)', letterSpacing: '0.04em' }}>ਸਾਂਝੇ ਪ੍ਰਸੰਗ</h2>
            <div className="glass-card-static rounded-2xl overflow-hidden">
              {adminPrasangs.map((prasang, i) => (
                <PrasangRow
                  key={prasang.id}
                  prasang={prasang}
                  i={i}
                  profileId={profile?.id}
                  onOpen={() => router.push(`/prasang/${prasang.id}`)}
                  onEdit={() => { setShowEdit(prasang); setEditTitle(prasang.title); setEditDesc(prasang.description || '') }}
                  onDelete={() => setShowDeleteConfirm(prasang.id)}
                  shared
                />
              ))}
            </div>
          </div>
        )}

        {/* Personal prasangs */}
        <div className="animate-fadeInUp" style={{ animationDelay: '0.08s' }}>
          {(adminPrasangs.length > 0 || myPrasangs.length > 0) && (
            <h2 className="text-sm font-semibold mb-2 px-1" style={{ color: 'rgba(12,36,64,0.5)', letterSpacing: '0.04em' }}>ਮੇਰੇ ਪ੍ਰਸੰਗ</h2>
          )}
          {myPrasangs.length > 0 ? (
            <div className="glass-card-static rounded-2xl overflow-hidden">
              {myPrasangs.map((prasang, i) => (
                <PrasangRow
                  key={prasang.id}
                  prasang={prasang}
                  i={i}
                  profileId={profile?.id}
                  onOpen={() => router.push(`/prasang/${prasang.id}`)}
                  onEdit={() => { setShowEdit(prasang); setEditTitle(prasang.title); setEditDesc(prasang.description || '') }}
                  onDelete={() => setShowDeleteConfirm(prasang.id)}
                />
              ))}
            </div>
          ) : (
            prasangs.length === 0 ? (
              <div className="glass-card-static rounded-2xl p-12 text-center">
                <div className="text-5xl mb-3">📖</div>
                <p className="text-base mb-1 font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਪ੍ਰਸੰਗ ਨਹੀਂ</p>
                <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>+ ਬਟਨ ਦੱਬ ਕੇ ਪਹਿਲਾ ਪ੍ਰਸੰਗ ਬਣਾਓ</p>
              </div>
            ) : (
              <div className="glass-card-static rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">📝</div>
                <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਆਪਣਾ ਪ੍ਰਸੰਗ ਜੋੜਨ ਲਈ + ਬਟਨ ਦਬਾਓ</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAdd(false), setNewTitle(''))}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-5" style={{ color: '#0c2540' }}>ਨਵਾਂ ਪ੍ਰਸੰਗ ਜੋੜੋ</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਪ੍ਰਸੰਗ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਗੁਰਮੁਖੀ ਵਿੱਚ ਲਿਖੋ" value={newTitle} onChange={e => setNewTitle(e.target.value)} required autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setNewTitle('') }} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-gold flex-1 py-3">{saving ? 'ਜੋੜਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEdit(null)}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-5" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸਿਰਲੇਖ *</label>
                <input className="input-royal" value={editTitle} onChange={e => setEditTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEdit(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEdit} className="btn-royal flex-1 py-3">{savingEdit ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
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
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਪ੍ਰਸੰਗ ਅਤੇ ਇਸ ਦੇ ਸਾਰੇ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਣਗੇ।
            </p>
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

function PrasangRow({ prasang, i, profileId, onOpen, onEdit, onDelete, shared }) {
  const isOwner = prasang.created_by === profileId
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150${i > 0 ? ' border-t' : ''}`}
      style={{ borderColor: 'rgba(14,65,110,0.07)' }}
      onClick={onOpen}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.025)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: shared ? 'linear-gradient(135deg, rgba(180,83,9,0.12), rgba(245,158,11,0.08))' : 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: shared ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(14,65,110,0.12)' }}>
        📖
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold gurbani-text truncate" style={{ color: '#0c2540' }}>
          {prasang.title}
          {shared && <span className="ml-2 badge-gold text-xs" style={{ fontSize: '10px' }}>ਸਾਂਝਾ</span>}
        </p>
        {prasang.description && (
          <p className="text-xs truncate" style={{ color: 'rgba(12,36,64,0.4)' }}>{prasang.description}</p>
        )}
      </div>

      {isOwner && (
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(26,95,143,0.5)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.5)' }}
            title="ਸੰਪਾਦਿਤ ਕਰੋ"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(239,68,68,0.45)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.45)' }}
            title="ਮਿਟਾਓ"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(14,65,110,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
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
