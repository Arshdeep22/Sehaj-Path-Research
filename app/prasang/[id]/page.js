'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import { getCache, setCache, removeCache, useIsomorphicLayoutEffect } from '../../../lib/clientCache'
import TopBar from '../../../components/TopBar'

export default function PrasangDetailPage() {
  const router = useRouter()
  const { id: prasangId } = useParams()

  const [profile, setProfile] = useState(null)
  const [prasang, setPrasang] = useState(null)
  const [angles, setAngles] = useState([])
  const [shabads, setShabads] = useState({})
  const [loading, setLoading] = useState(true)
  const prasangRef = useRef(null)

  const [expandedAngles, setExpandedAngles] = useState({})
  const [showAddAngle, setShowAddAngle] = useState(false)
  const [showAddShabad, setShowAddShabad] = useState(null)

  const [angleTitle, setAngleTitle] = useState('')
  const [shabadText, setShabadText] = useState('')
  const [shabadComment, setShabadComment] = useState('')
  const [saving, setSaving] = useState(false)

  // Prasang edit/delete
  const [showEditPrasang, setShowEditPrasang] = useState(false)
  const [editPrasangTitle, setEditPrasangTitle] = useState('')
  const [editPrasangDesc, setEditPrasangDesc] = useState('')
  const [savingEditPrasang, setSavingEditPrasang] = useState(false)
  const [showDeletePrasangConfirm, setShowDeletePrasangConfirm] = useState(false)
  const [deletingPrasang, setDeletingPrasang] = useState(false)

  // Angle edit/delete
  const [showEditAngle, setShowEditAngle] = useState(null)
  const [editAngleTitle, setEditAngleTitle] = useState('')
  const [savingEditAngle, setSavingEditAngle] = useState(false)
  const [showDeleteAngleConfirm, setShowDeleteAngleConfirm] = useState(null)
  const [deletingAngle, setDeletingAngle] = useState(false)

  // Shabad edit/delete
  const [showEditShabad, setShowEditShabad] = useState(null)
  const [editShabadText, setEditShabadText] = useState('')
  const [editShabadComment, setEditShabadComment] = useState('')
  const [savingEditShabad, setSavingEditShabad] = useState(false)
  const [showDeleteShabadConfirm, setShowDeleteShabadConfirm] = useState(null)
  const [deletingShabad, setDeletingShabad] = useState(false)

  const loadData = useCallback(async (userId) => {
    const { data: anglesData } = await supabase
      .from('prasang_angles')
      .select('*')
      .eq('prasang_id', prasangId)
      .eq('created_by', userId)
      .order('created_at', { ascending: true })
    const angleList = anglesData || []
    setAngles(angleList)

    let grouped = {}
    if (angleList.length) {
      const angleIds = angleList.map(a => a.id)
      const { data: allShabads } = await supabase
        .from('prasang_shabads')
        .select('*')
        .in('prasang_angle_id', angleIds)
        .eq('created_by', userId)
        .order('created_at', { ascending: true })

      for (const angle of angleList) grouped[angle.id] = []
      for (const s of allShabads || []) grouped[s.prasang_angle_id]?.push(s)
    }
    setShabads(grouped)
    setCache(`prasang:${prasangId}`, { prasang: prasangRef.current, angles: angleList, shabads: grouped })
  }, [prasangId])

  useIsomorphicLayoutEffect(() => {
    const p = getCache('profile')
    if (p) setProfile(p)
    const c = getCache(`prasang:${prasangId}`)
    if (c && c.prasang) {
      setPrasang(c.prasang); prasangRef.current = c.prasang
      setAngles(c.angles || [])
      setShabads(c.shabads || {})
      setLoading(false)
    } else {
      setPrasang(null); prasangRef.current = null
      setAngles([]); setShabads({})
      setLoading(true)
    }
  }, [prasangId])

  useEffect(() => { prasangRef.current = prasang }, [prasang])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [{ data: prof }, { data: prasangData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('prasangs').select('*').eq('id', prasangId).single(),
      ])

      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      setProfile(prof)
      setCache('profile', prof)
      if (!prasangData) { router.push('/prasang'); return }
      setPrasang(prasangData)
      prasangRef.current = prasangData

      await loadData(user.id)
      setLoading(false)
    }
    init()
  }, [prasangId, router, loadData])

  function normalizeShabadText(text) {
    return (text || '')
      .split(/\r?\n/)
      .map(line => line.replace(/\s+/g, ''))
      .filter(line => line.length > 0)
      .join('\n')
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function addAngle(e) {
    e.preventDefault()
    if (!angleTitle.trim()) return
    setSaving(true)
    const { data: newAngle, error } = await supabase.from('prasang_angles').insert({
      prasang_id: prasangId,
      title: angleTitle.trim(),
      created_by: profile.id,
    }).select().single()
    if (!error) {
      setAngleTitle('')
      setShowAddAngle(false)
      await loadData(profile.id)
      setExpandedAngles(prev => ({ ...prev, [newAngle.id]: true }))
    }
    setSaving(false)
  }

  async function addShabad(e) {
    e.preventDefault()
    const cleanShabad = normalizeShabadText(shabadText)
    if (!cleanShabad) return
    if (shabadComment.trim().length < 50) return
    setSaving(true)
    const { error } = await supabase.from('prasang_shabads').insert({
      prasang_angle_id: showAddShabad,
      shabad_text: cleanShabad,
      comment: shabadComment.trim(),
      created_by: profile.id,
    }).select('id').single()
    if (!error) {
      setShabadText('')
      setShabadComment('')
      setShowAddShabad(null)
      await loadData(profile.id)
    }
    setSaving(false)
  }

  async function handleEditPrasang(e) {
    e.preventDefault()
    if (!editPrasangTitle.trim()) return
    setSavingEditPrasang(true)
    const token = await getToken()
    const res = await fetch(`/api/prasang/${prasangId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: editPrasangTitle.trim(), description: editPrasangDesc.trim() }),
    })
    if (res.ok) {
      const { prasang: updated } = await res.json()
      setPrasang(updated)
      setShowEditPrasang(false)
    }
    setSavingEditPrasang(false)
  }

  async function handleDeletePrasang() {
    setDeletingPrasang(true)
    const token = await getToken()
    const res = await fetch(`/api/prasang/${prasangId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      removeCache(`prasang:${prasangId}`)
      removeCache('prasang')
      router.push('/prasang')
    } else setDeletingPrasang(false)
  }

  async function handleEditAngle(e) {
    e.preventDefault()
    if (!editAngleTitle.trim() || !showEditAngle) return
    setSavingEditAngle(true)
    const { error } = await supabase
      .from('prasang_angles')
      .update({ title: editAngleTitle.trim() })
      .eq('id', showEditAngle.id)
      .eq('created_by', profile.id)
    if (!error) { await loadData(profile.id); setShowEditAngle(null) }
    setSavingEditAngle(false)
  }

  async function handleDeleteAngle(angle) {
    setDeletingAngle(true)
    await supabase.from('prasang_shabads').delete().eq('prasang_angle_id', angle.id)
    const { error } = await supabase.from('prasang_angles').delete().eq('id', angle.id).eq('created_by', profile.id)
    if (!error) { await loadData(profile.id); setShowDeleteAngleConfirm(null) }
    setDeletingAngle(false)
  }

  async function handleEditShabad(e) {
    e.preventDefault()
    const cleanShabad = normalizeShabadText(editShabadText)
    if (!cleanShabad || !showEditShabad) return
    setSavingEditShabad(true)
    const { error } = await supabase
      .from('prasang_shabads')
      .update({ shabad_text: cleanShabad, comment: editShabadComment.trim() })
      .eq('id', showEditShabad.id)
      .eq('created_by', profile.id)
    if (!error) { await loadData(profile.id); setShowEditShabad(null) }
    setSavingEditShabad(false)
  }

  async function handleDeleteShabad(shabadId) {
    setDeletingShabad(true)
    const { error } = await supabase
      .from('prasang_shabads')
      .delete()
      .eq('id', shabadId)
      .eq('created_by', profile.id)
    if (!error) { await loadData(profile.id); setShowDeleteShabadConfirm(null) }
    setDeletingShabad(false)
  }

  if (loading) return <LoadingScreen />

  const totalShabads = Object.values(shabads).reduce((s, arr) => s + arr.length, 0)
  const isPrasangOwner = profile?.id === prasang?.created_by

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/prasang" className="inline-flex items-center gap-2 mb-6 text-sm transition-opacity"
          style={{ color: 'rgba(12,36,64,0.45)' }}>
          ← ਪ੍ਰਸੰਗਾਂ ਵੱਲ ਵਾਪਸ
        </Link>

        {/* Prasang Header */}
        <div className="glass-card-static rounded-2xl p-6 mb-6 animate-fadeInUp">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold gurbani-text" style={{ color: '#0c2540' }}>{prasang?.title}</h1>
                {prasang?.is_admin_created && <span className="badge-gold text-xs">ਸਾਂਝਾ</span>}
              </div>
              {prasang?.description && (
                <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>{prasang.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <span className="badge-royal">{angles.length} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
              <span className="badge-gold">{totalShabads} ਸ਼ਬਦ</span>
              {isPrasangOwner && (
                <>
                  <button
                    onClick={() => { setShowEditPrasang(true); setEditPrasangTitle(prasang.title); setEditPrasangDesc(prasang.description || '') }}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(26,95,143,0.5)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.5)' }}
                    title="ਸੰਪਾਦਿਤ ਕਰੋ"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowDeletePrasangConfirm(true)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(239,68,68,0.45)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.45)' }}
                    title="ਮਿਟਾਓ"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Add Angle Button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: '#0c2540' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ</h2>
          <button onClick={() => setShowAddAngle(true)} className="btn-gold text-sm px-4 py-2">
            + ਨਵਾਂ ਦ੍ਰਿਸ਼ਟੀਕੋਣ
          </button>
        </div>

        {angles.length === 0 && !showAddAngle && (
          <div className="glass-card-static rounded-2xl p-12 text-center mb-6">
            <div className="text-4xl mb-3">🔭</div>
            <p className="font-medium mb-1" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਨਹੀਂ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਪਹਿਲਾ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਜੋੜੋ</p>
          </div>
        )}

        <div className="space-y-4">
          {angles.map((angle, ai) => (
            <AngleSection
              key={angle.id}
              angle={angle}
              angleIndex={ai}
              shabads={shabads[angle.id] || []}
              expanded={expandedAngles[angle.id]}
              onToggle={() => setExpandedAngles(p => ({ ...p, [angle.id]: !p[angle.id] }))}
              onAddShabad={() => { setShowAddShabad(angle.id); setShabadText(''); setShabadComment('') }}
              onEditAngle={() => { setShowEditAngle(angle); setEditAngleTitle(angle.title) }}
              onDeleteAngle={() => setShowDeleteAngleConfirm(angle)}
              onEditShabad={shabad => { setShowEditShabad(shabad); setEditShabadText(shabad.shabad_text); setEditShabadComment(shabad.comment || '') }}
              onDeleteShabad={shabadId => setShowDeleteShabadConfirm(shabadId)}
            />
          ))}
        </div>
      </div>

      {/* ── Add Angle Modal ── */}
      {showAddAngle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddAngle(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-1" style={{ color: '#0c2540' }}>ਨਵਾਂ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਜੋੜੋ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਇਸ ਪ੍ਰਸੰਗ ਨੂੰ ਕਿਸੇ ਨਵੇਂ ਨਜ਼ਰੀਏ ਤੋਂ ਦੇਖੋ</p>
            <form onSubmit={addAngle} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਜਿਵੇਂ: ਭਗਤੀ ਦਾ ਪੱਖ" value={angleTitle} onChange={e => setAngleTitle(e.target.value)} required autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddAngle(false)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-gold flex-1 py-3">{saving ? 'ਜੋੜ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Shabad Modal ── */}
      {showAddShabad && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddShabad(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-1" style={{ color: '#0c2540' }}>ਸ਼ਬਦ ਜੋੜੋ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਗੁਰਬਾਣੀ ਵਿੱਚੋਂ ਸ਼ਬਦ ਕਾਪੀ-ਪੇਸਟ ਕਰੋ</p>
            <form onSubmit={addShabad} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸ਼ਬਦ (ਗੁਰਬਾਣੀ) *</label>
                <textarea className="textarea-royal gurbani-text text-base" placeholder="ਇੱਥੇ ਸ਼ਬਦ ਪੇਸਟ ਕਰੋ..." value={shabadText} onChange={e => setShabadText(e.target.value)} rows={5} required />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਤੁਹਾਡੀ ਟਿੱਪਣੀ *</label>
                <textarea className="textarea-royal" placeholder="ਇਹ ਸ਼ਬਦ ਇਸ ਪ੍ਰਸੰਗ ਨਾਲ ਕਿਵੇਂ ਸੰਬੰਧਿਤ ਹੈ..." value={shabadComment} onChange={e => setShabadComment(e.target.value)} rows={3} required />
                <p className="text-xs mt-1 text-right" style={{ color: shabadComment.trim().length >= 50 ? 'rgba(22,163,74,0.8)' : 'rgba(239,68,68,0.7)' }}>
                  {shabadComment.trim().length}/50 ਅੱਖਰ
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddShabad(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving || shabadComment.trim().length < 50} className="btn-royal flex-1 py-3">{saving ? 'ਜੋੜ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Prasang Modal ── */}
      {showEditPrasang && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditPrasang(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditPrasang} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸਿਰਲੇਖ *</label>
                <input className="input-royal" value={editPrasangTitle} onChange={e => setEditPrasangTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={editPrasangDesc} onChange={e => setEditPrasangDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditPrasang(false)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditPrasang} className="btn-royal flex-1 py-3">{savingEditPrasang ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Prasang Confirm ── */}
      {showDeletePrasangConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingPrasang && setShowDeletePrasangConfirm(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਪ੍ਰਸੰਗ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਪ੍ਰਸੰਗ ਅਤੇ ਇਸ ਦੇ ਸਾਰੇ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਣਗੇ।
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeletePrasangConfirm(false)} disabled={deletingPrasang} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={handleDeletePrasang} disabled={deletingPrasang} className="btn-danger flex-1 py-3">
                {deletingPrasang ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Angle Modal ── */}
      {showEditAngle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditAngle(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditAngle} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸਿਰਲੇਖ *</label>
                <input className="input-royal" value={editAngleTitle} onChange={e => setEditAngleTitle(e.target.value)} required autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditAngle(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditAngle} className="btn-royal flex-1 py-3">{savingEditAngle ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Angle Confirm ── */}
      {showDeleteAngleConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingAngle && setShowDeleteAngleConfirm(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>ਇਹ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਇਸ ਦੇ ਸਾਰੇ ਸ਼ਬਦ ਮਿਟ ਜਾਣਗੇ।</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteAngleConfirm(null)} disabled={deletingAngle} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDeleteAngle(showDeleteAngleConfirm)} disabled={deletingAngle} className="btn-danger flex-1 py-3">
                {deletingAngle ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Shabad Modal ── */}
      {showEditShabad && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditShabad(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਸ਼ਬਦ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditShabad} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸ਼ਬਦ (ਗੁਰਬਾਣੀ) *</label>
                <textarea className="textarea-royal gurbani-text text-base" value={editShabadText} onChange={e => setEditShabadText(e.target.value)} rows={5} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਟਿੱਪਣੀ *</label>
                <textarea className="textarea-royal" value={editShabadComment} onChange={e => setEditShabadComment(e.target.value)} rows={3} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditShabad(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditShabad} className="btn-royal flex-1 py-3">{savingEditShabad ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Shabad Confirm ── */}
      {showDeleteShabadConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingShabad && setShowDeleteShabadConfirm(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਸ਼ਬਦ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>ਇਹ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਵੇਗਾ।</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteShabadConfirm(null)} disabled={deletingShabad} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDeleteShabad(showDeleteShabadConfirm)} disabled={deletingShabad} className="btn-danger flex-1 py-3">
                {deletingShabad ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AngleSection({ angle, angleIndex, shabads, expanded, onToggle, onAddShabad, onEditAngle, onDeleteAngle, onEditShabad, onDeleteShabad }) {
  return (
    <div className="animate-fadeInUp" style={{ animationDelay: `${angleIndex * 0.06}s` }}>
      <div className="angle-header mb-2" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
          {angleIndex + 1}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold gurbani-text" style={{ color: '#0c2540' }}>{angle.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-royal text-xs">{shabads.length} ਸ਼ਬਦ</span>
          <button
            onClick={e => { e.stopPropagation(); onEditAngle() }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(26,95,143,0.5)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.5)' }}
            title="ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਸੰਪਾਦਿਤ ਕਰੋ"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDeleteAngle() }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(239,68,68,0.45)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.45)' }}
            title="ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਮਿਟਾਓ"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
          <span
            className="flex items-center justify-center rounded-full transition-all duration-300"
            style={{
              width: 28, height: 28,
              background: expanded ? 'rgba(14,65,110,0.1)' : 'rgba(14,65,110,0.05)',
              color: '#1a5f8f',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>

      {expanded && (
        <div className="ml-4 pl-4 border-l space-y-3 pb-4" style={{ borderColor: 'rgba(14,65,110,0.15)' }}>
          {shabads.length === 0 && (
            <div className="py-4 text-center text-sm" style={{ color: 'rgba(12,36,64,0.35)' }}>
              ਅਜੇ ਕੋਈ ਸ਼ਬਦ ਨਹੀਂ — ਪਹਿਲਾ ਸ਼ਬਦ ਜੋੜੋ
            </div>
          )}
          {shabads.map(shabad => (
            <div key={shabad.id} className="shabad-card">
              <p className="gurbani-text text-base leading-relaxed mb-2 whitespace-pre-wrap" style={{ color: '#0c2540' }}>
                {shabad.shabad_text}
              </p>
              {shabad.comment && (
                <>
                  <div className="divider-royal my-2" />
                  <p className="text-sm italic" style={{ color: 'rgba(12,36,64,0.6)' }}>"{shabad.comment}"</p>
                </>
              )}
              <div className="flex items-center justify-end mt-3 pt-2 gap-2" style={{ borderTop: '1px solid rgba(14,65,110,0.08)' }}>
                <span className="text-xs" style={{ color: 'rgba(12,36,64,0.3)' }}>
                  {new Date(shabad.created_at).toLocaleDateString('pa-IN')}
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => onEditShabad(shabad)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'rgba(26,95,143,0.45)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.45)' }}
                    title="ਸੰਪਾਦਿਤ ਕਰੋ"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteShabad(shabad.id)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'rgba(239,68,68,0.4)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.4)' }}
                    title="ਮਿਟਾਓ"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={onAddShabad}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: 'rgba(14,65,110,0.05)', border: '1px dashed rgba(14,65,110,0.2)', color: 'rgba(26,95,143,0.85)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.09)'; e.currentTarget.style.borderColor = 'rgba(14,65,110,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.05)'; e.currentTarget.style.borderColor = 'rgba(14,65,110,0.2)' }}
          >
            + ਸ਼ਬਦ ਜੋੜੋ
          </button>
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
