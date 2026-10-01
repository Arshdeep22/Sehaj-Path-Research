'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'

export default function TopicDetailPage() {
  const router = useRouter()
  const { id: topicId } = useParams()

  const [profile, setProfile] = useState(null)
  const [topic, setTopic] = useState(null)
  const [angles, setAngles] = useState([])
  const [shabads, setShabads] = useState({})
  const [authorMap, setAuthorMap] = useState({})
  const [loading, setLoading] = useState(true)

  const [expandedAngles, setExpandedAngles] = useState({})
  const [showAddAngle, setShowAddAngle] = useState(false)
  const [showAddShabad, setShowAddShabad] = useState(null)
  const [scoreFloat, setScoreFloat] = useState(null)

  const [angleTitle, setAngleTitle] = useState('')
  const [shabadText, setShabadText] = useState('')
  const [shabadComment, setShabadComment] = useState('')
  const [saving, setSaving] = useState(false)

  // Topic edit / delete
  const [showEditTopic, setShowEditTopic] = useState(false)
  const [editTopicTitle, setEditTopicTitle] = useState('')
  const [editTopicDesc, setEditTopicDesc] = useState('')
  const [savingEditTopic, setSavingEditTopic] = useState(false)
  const [showDeleteTopicConfirm, setShowDeleteTopicConfirm] = useState(false)
  const [deletingTopic, setDeletingTopic] = useState(false)

  // Angle delete
  const [showDeleteAngleConfirm, setShowDeleteAngleConfirm] = useState(null)
  const [deletingAngle, setDeletingAngle] = useState(false)

  // Shabad edit / delete
  const [showEditShabad, setShowEditShabad] = useState(null)
  const [editShabadText, setEditShabadText] = useState('')
  const [editShabadComment, setEditShabadComment] = useState('')
  const [savingEditShabad, setSavingEditShabad] = useState(false)
  const [showDeleteShabadConfirm, setShowDeleteShabadConfirm] = useState(null)
  const [deletingShabad, setDeletingShabad] = useState(false)

  const loadData = useCallback(async () => {
    const { data: anglesData } = await supabase
      .from('angles')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
    setAngles(anglesData || [])

    if (anglesData?.length) {
      const angleIds = anglesData.map(a => a.id)
      const authorIds = new Set(anglesData.map(a => a.created_by))

      const { data: allShabadsData } = await supabase
        .from('shabads')
        .select('*')
        .in('angle_id', angleIds)
        .order('created_at', { ascending: true })

      const grouped = {}
      for (const angle of anglesData) grouped[angle.id] = []
      for (const s of allShabadsData || []) {
        grouped[s.angle_id]?.push(s)
        authorIds.add(s.created_by)
      }
      setShabads(grouped)

      const { data: authors } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .in('id', [...authorIds])
      const map = {}
      ;(authors || []).forEach(a => { map[a.id] = a.full_name || a.username })
      setAuthorMap(map)
    } else {
      setShabads({})
    }
  }, [topicId])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [{ data: prof }, { data: topicData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('topics').select('*').eq('id', topicId).single(),
      ])

      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      setProfile(prof)
      if (!topicData) { router.push('/topics'); return }
      setTopic(topicData)

      await loadData()
      setLoading(false)
    }
    init()
  }, [topicId, router, loadData])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  function showScoreAnimation(points, e) {
    const x = e?.clientX || window.innerWidth / 2
    const y = e?.clientY || window.innerHeight / 2
    setScoreFloat({ points, x, y, key: Date.now() })
    setTimeout(() => setScoreFloat(null), 1300)
  }

  async function addAngle(e) {
    e.preventDefault()
    if (!angleTitle.trim()) return
    setSaving(true)
    const { data: newAngle, error } = await supabase.from('angles').insert({
      topic_id: topicId,
      title: angleTitle.trim(),
      created_by: profile.id,
    }).select().single()

    if (!error) {
      setAngleTitle('')
      setShowAddAngle(false)
      await loadData()
      setExpandedAngles(prev => ({ ...prev, [newAngle.id]: true }))
    }
    setSaving(false)
  }

  async function addShabad(e) {
    e.preventDefault()
    if (!shabadText.trim()) return
    if (shabadComment.trim().length < 50) return
    setSaving(true)
    const { error } = await supabase.from('shabads').insert({
      angle_id: showAddShabad,
      shabad_text: shabadText.trim(),
      comment: shabadComment.trim() || null,
      created_by: profile.id,
    })
    if (!error) {
      await supabase.from('profiles').update({ score: (profile.score || 0) + 5 }).eq('id', profile.id)
      setProfile(p => ({ ...p, score: (p.score || 0) + 5 }))
      showScoreAnimation('+5', e)
      setShabadText('')
      setShabadComment('')
      setShowAddShabad(null)
      await loadData()
    }
    setSaving(false)
  }

  async function handleEditTopic(e) {
    e.preventDefault()
    if (!editTopicTitle.trim()) return
    setSavingEditTopic(true)
    const token = await getToken()
    const res = await fetch(`/api/topics/${topicId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: editTopicTitle.trim(), description: editTopicDesc.trim() }),
    })
    if (res.ok) {
      const { topic: updated } = await res.json()
      setTopic(updated)
      setShowEditTopic(false)
    }
    setSavingEditTopic(false)
  }

  async function handleDeleteTopic() {
    setDeletingTopic(true)
    const token = await getToken()
    const res = await fetch(`/api/topics/${topicId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (res.ok) router.push('/topics')
    else setDeletingTopic(false)
  }

  async function handleDeleteAngle(angle) {
    setDeletingAngle(true)
    const angleShabads = shabads[angle.id] || []
    const myShabads = angleShabads.filter(s => s.created_by === profile.id)

    if (angleShabads.length > 0) {
      await supabase.from('shabads').delete().eq('angle_id', angle.id)
    }

    const { error } = await supabase.from('angles').delete().eq('id', angle.id).eq('created_by', profile.id)
    if (!error) {
      if (myShabads.length > 0) {
        const newScore = Math.max(0, (profile.score || 0) - myShabads.length * 5)
        await supabase.from('profiles').update({ score: newScore }).eq('id', profile.id)
        setProfile(p => ({ ...p, score: newScore }))
      }
      await loadData()
      setShowDeleteAngleConfirm(null)
    }
    setDeletingAngle(false)
  }

  async function handleEditShabad(e) {
    e.preventDefault()
    if (!editShabadText.trim() || !showEditShabad) return
    setSavingEditShabad(true)
    const { error } = await supabase
      .from('shabads')
      .update({ shabad_text: editShabadText.trim(), comment: editShabadComment.trim() || null })
      .eq('id', showEditShabad.id)
      .eq('created_by', profile.id)
    if (!error) {
      await loadData()
      setShowEditShabad(null)
    }
    setSavingEditShabad(false)
  }

  async function handleDeleteShabad(shabadId) {
    setDeletingShabad(true)
    const { error } = await supabase
      .from('shabads')
      .delete()
      .eq('id', shabadId)
      .eq('created_by', profile.id)
    if (!error) {
      const newScore = Math.max(0, (profile.score || 0) - 5)
      await supabase.from('profiles').update({ score: newScore }).eq('id', profile.id)
      setProfile(p => ({ ...p, score: newScore }))
      await loadData()
      setShowDeleteShabadConfirm(null)
    }
    setDeletingShabad(false)
  }

  function getProgress() {
    const totalAngles = angles.length
    const totalShabads = Object.values(shabads).reduce((s, arr) => s + arr.length, 0)
    return Math.min(100, Math.round(((totalAngles * 3 + totalShabads * 2) / 60) * 100))
  }

  if (loading) return <LoadingScreen />

  const progress = getProgress()
  const totalShabads = Object.values(shabads).reduce((s, arr) => s + arr.length, 0)
  const isTopicOwner = profile?.id === topic?.created_by

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      {scoreFloat && (
        <div key={scoreFloat.key} className="score-float text-xl font-extrabold"
          style={{ left: scoreFloat.x - 20, top: scoreFloat.y - 20 }}>
          {scoreFloat.points} ✦
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/topics" className="inline-flex items-center gap-2 mb-6 text-sm transition-opacity"
          style={{ color: 'rgba(12,36,64,0.45)' }}>
          ← ਵਿਸ਼ਿਆਂ ਵੱਲ ਵਾਪਸ
        </Link>

        {/* Topic Header */}
        <div className="glass-card-static rounded-2xl p-6 mb-6 animate-fadeInUp">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-1 gurbani-text" style={{ color: '#0c2540' }}>
                {topic?.title}
              </h1>
              {topic?.description && (
                <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>{topic.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <span className="badge-royal">{angles.length} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
              <span className="badge-gold">{totalShabads} ਸ਼ਬਦ</span>
              {isTopicOwner && (
                <>
                  <button
                    onClick={() => { setShowEditTopic(true); setEditTopicTitle(topic.title); setEditTopicDesc(topic.description || '') }}
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
                    onClick={() => setShowDeleteTopicConfirm(true)}
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
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(12,36,64,0.45)' }}>
              <span>ਖੋਜ ਦੀ ਤਰੱਕੀ</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <div className="progress-track" style={{ height: '10px' }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
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
              authorMap={authorMap}
              expanded={expandedAngles[angle.id]}
              profileId={profile?.id}
              onToggle={() => setExpandedAngles(p => ({ ...p, [angle.id]: !p[angle.id] }))}
              onAddShabad={() => { setShowAddShabad(angle.id); setShabadText(''); setShabadComment('') }}
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
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਇਸ ਵਿਸ਼ੇ ਨੂੰ ਕਿਸੇ ਨਵੇਂ ਨਜ਼ਰੀਏ ਤੋਂ ਦੇਖੋ</p>
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
                <textarea className="textarea-royal" placeholder="ਇਹ ਸ਼ਬਦ ਇਸ ਵਿਸ਼ੇ ਨਾਲ ਕਿਵੇਂ ਸੰਬੰਧਿਤ ਹੈ..." value={shabadComment} onChange={e => setShabadComment(e.target.value)} rows={3} required />
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

      {/* ── Edit Topic Modal ── */}
      {showEditTopic && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditTopic(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਵਿਸ਼ਾ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditTopic} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਿਸ਼ੇ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" value={editTopicTitle} onChange={e => setEditTopicTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={editTopicDesc} onChange={e => setEditTopicDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditTopic(false)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditTopic} className="btn-royal flex-1 py-3">{savingEditTopic ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Topic Confirm ── */}
      {showDeleteTopicConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingTopic && setShowDeleteTopicConfirm(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਵਿਸ਼ਾ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਵਿਸ਼ਾ ਅਤੇ ਇਸ ਦੇ ਸਾਰੇ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਣਗੇ।
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteTopicConfirm(false)} disabled={deletingTopic} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={handleDeleteTopic} disabled={deletingTopic} className="btn-danger flex-1 py-3">
                {deletingTopic ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Angle Confirm ── */}
      {showDeleteAngleConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingAngle && setShowDeleteAngleConfirm(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਇਸ ਦੇ ਸਾਰੇ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਣਗੇ।
            </p>
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
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਟਿੱਪਣੀ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={editShabadComment} onChange={e => setEditShabadComment(e.target.value)} rows={3} />
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
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਵੇਗਾ।
            </p>
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

function AngleSection({ angle, angleIndex, shabads, authorMap, expanded, profileId, onToggle, onAddShabad, onDeleteAngle, onEditShabad, onDeleteShabad }) {
  const isAngleOwner = angle.created_by === profileId
  return (
    <div className="animate-fadeInUp" style={{ animationDelay: `${angleIndex * 0.06}s` }}>
      <div className="angle-header mb-2" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
          {angleIndex + 1}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold gurbani-text" style={{ color: '#0c2540' }}>{angle.title}</h3>
          {angle.description && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(12,36,64,0.5)' }}>{angle.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-royal text-xs">{shabads.length} ਸ਼ਬਦ</span>
          {isAngleOwner && (
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
          )}
          <span className="text-lg" style={{ color: 'rgba(12,36,64,0.35)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="ml-4 pl-4 border-l space-y-3 pb-4" style={{ borderColor: 'rgba(14,65,110,0.15)' }}>
          {shabads.length === 0 && (
            <div className="py-4 text-center text-sm" style={{ color: 'rgba(12,36,64,0.35)' }}>
              ਅਜੇ ਕੋਈ ਸ਼ਬਦ ਨਹੀਂ — ਪਹਿਲਾ ਸ਼ਬਦ ਜੋੜੋ
            </div>
          )}

          {shabads.map(shabad => {
            const isOwner = shabad.created_by === profileId
            return (
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
                <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid rgba(14,65,110,0.08)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
                      {(authorMap[shabad.created_by] || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-xs" style={{ color: 'rgba(12,36,64,0.5)' }}>
                      {authorMap[shabad.created_by] || 'ਅਣਜਾਣ'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'rgba(12,36,64,0.3)' }}>
                      {new Date(shabad.created_at).toLocaleDateString('pa-IN')}
                    </span>
                    {isOwner && (
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
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <button onClick={onAddShabad}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(14,65,110,0.05)',
              border: '1px dashed rgba(14,65,110,0.2)',
              color: 'rgba(26,95,143,0.85)',
            }}
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
