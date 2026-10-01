'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import TopBar from '../../components/TopBar'

export default function TopicsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [topics, setTopics] = useState([])
  const [topicStats, setTopicStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAddTopic, setShowAddTopic] = useState(false)
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [newTopicDesc, setNewTopicDesc] = useState('')
  const [savingTopic, setSavingTopic] = useState(false)

  const [showEditTopic, setShowEditTopic] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deletingTopic, setDeletingTopic] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [{ data: prof }, { data: topicsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('topics').select('*').order('created_at', { ascending: true }),
      ])

      if (!prof) { router.push('/'); return }
      if (prof.must_change_password) { router.push('/change-password'); return }
      if (prof.role === 'admin') { router.push('/admin'); return }
      setProfile(prof)

      const list = topicsData || []
      setTopics(list)

      if (list.length) {
        const topicIds = list.map(t => t.id)
        const { data: allAngles } = await supabase
          .from('angles')
          .select('id, topic_id')
          .in('topic_id', topicIds)

        const angleIds = (allAngles || []).map(a => a.id)
        let allShabads = []
        if (angleIds.length) {
          const { data: sd } = await supabase
            .from('shabads')
            .select('angle_id')
            .in('angle_id', angleIds)
          allShabads = sd || []
        }

        const stats = {}
        for (const t of list) {
          const ta = (allAngles || []).filter(a => a.topic_id === t.id)
          const taIds = new Set(ta.map(a => a.id))
          stats[t.id] = { angles: ta.length, shabads: allShabads.filter(s => taIds.has(s.angle_id)).length }
        }
        setTopicStats(stats)
      }

      setLoading(false)
    }
    load()
  }, [router])

  function getProgress(topicId) {
    const s = topicStats[topicId]
    if (!s) return 0
    return Math.min(100, Math.round(((s.angles * 3 + s.shabads * 2) / 60) * 100))
  }

  function openEditTopic(topic) {
    setShowEditTopic(topic)
    setEditTitle(topic.title)
    setEditDesc(topic.description || '')
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function handleAddTopic(e) {
    e.preventDefault()
    if (!newTopicTitle.trim()) return
    setSavingTopic(true)
    const token = await getToken()
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: newTopicTitle.trim(), description: newTopicDesc.trim() }),
    })
    if (res.ok) {
      const { topic } = await res.json()
      setTopics(prev => [...prev, topic])
      setTopicStats(prev => ({ ...prev, [topic.id]: { angles: 0, shabads: 0 } }))
      setShowAddTopic(false)
      setNewTopicTitle('')
      setNewTopicDesc('')
    }
    setSavingTopic(false)
  }

  async function handleEditTopic(e) {
    e.preventDefault()
    if (!editTitle.trim() || !showEditTopic) return
    setSavingEdit(true)
    const token = await getToken()
    const res = await fetch(`/api/topics/${showEditTopic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
    })
    if (res.ok) {
      const { topic } = await res.json()
      setTopics(prev => prev.map(t => t.id === topic.id ? topic : t))
      setShowEditTopic(null)
    }
    setSavingEdit(false)
  }

  async function handleDeleteTopic(topicId) {
    setDeletingTopic(true)
    const token = await getToken()
    const res = await fetch(`/api/topics/${topicId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (res.ok) {
      setTopics(prev => prev.filter(t => t.id !== topicId))
      setTopicStats(prev => { const n = { ...prev }; delete n[topicId]; return n })
      setShowDeleteConfirm(null)
    }
    setDeletingTopic(false)
  }

  if (loading) return <LoadingScreen />

  const query = search.trim().toLowerCase()
  const filteredTopics = query
    ? topics.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query))
      )
    : topics

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 animate-fadeInUp">
          <div>
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: '#0c2540' }}>ਖੋਜ ਦੇ ਵਿਸ਼ੇ</h1>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>ਵਿਸ਼ੇ ਚੁਣੋ ਅਤੇ ਸ਼ਬਦ ਜੋੜੋ</p>
          </div>
          <button onClick={() => setShowAddTopic(true)} className="btn-gold text-sm px-4 py-2.5 flex-shrink-0" style={{ fontSize: '13px' }}>
            + ਨਵਾਂ ਵਿਸ਼ਾ
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="rgba(12,36,64,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="search" className="input-royal pl-9 pr-9" placeholder="ਵਿਸ਼ਾ ਲੱਭੋ..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(12,36,64,0.35)', lineHeight: 1 }} aria-label="clear">✕</button>
          )}
        </div>

        {/* List */}
        {topics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-12 text-center">
            <div className="text-5xl mb-3">📚</div>
            <p className="text-base mb-1 font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਵਿਸ਼ਾ ਨਹੀਂ ਜੋੜਿਆ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਉੱਪਰ + ਬਟਨ ਦੱਬ ਕੇ ਪਹਿਲਾ ਵਿਸ਼ਾ ਜੋੜੋ</p>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-base font-medium" style={{ color: '#0c2540' }}>ਕੋਈ ਨਤੀਜਾ ਨਹੀਂ ਮਿਲਿਆ</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(12,36,64,0.4)' }}>ਕੋਈ ਹੋਰ ਸ਼ਬਦ ਵਰਤੋ</p>
          </div>
        ) : (
          <div className="glass-card-static rounded-2xl overflow-hidden animate-fadeInUp" style={{ animationDelay: '0.08s' }}>
            {filteredTopics.map((topic, i) => {
              const stats = topicStats[topic.id] || { angles: 0, shabads: 0 }
              const progress = getProgress(topic.id)
              const isOwner = topic.created_by === profile?.id
              return (
                <div
                  key={topic.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150${i > 0 ? ' border-t' : ''}`}
                  style={{ borderColor: 'rgba(14,65,110,0.07)' }}
                  onClick={() => router.push(`/topics/${topic.id}`)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.025)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <CircularProgress value={progress} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold gurbani-text truncate" style={{ color: '#0c2540', lineHeight: 1.45 }}>
                      {topic.title}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(12,36,64,0.4)', lineHeight: 1.3 }}>
                      {stats.angles} ਦ੍ਰਿਸ਼ਟੀਕੋਣ · {stats.shabads} ਸ਼ਬਦ
                    </p>
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEditTopic(topic)}
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
                        onClick={() => setShowDeleteConfirm(topic.id)}
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
            })}
          </div>
        )}
      </div>

      {/* Add Topic Modal */}
      {showAddTopic && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAddTopic(false), setNewTopicTitle(''), setNewTopicDesc(''))}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-5" style={{ color: '#0c2540' }}>ਨਵਾਂ ਵਿਸ਼ਾ ਜੋੜੋ</h3>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਿਸ਼ੇ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਗੁਰਮੁਖੀ ਵਿੱਚ ਲਿਖੋ" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" placeholder="ਵਿਸ਼ੇ ਬਾਰੇ ਜਾਣਕਾਰੀ..." value={newTopicDesc} onChange={e => setNewTopicDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddTopic(false); setNewTopicTitle(''); setNewTopicDesc('') }} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingTopic} className="btn-gold flex-1 py-3">{savingTopic ? 'ਜੋੜਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Topic Modal */}
      {showEditTopic && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditTopic(null)}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-5" style={{ color: '#0c2540' }}>ਵਿਸ਼ਾ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditTopic} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਿਸ਼ੇ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" value={editTitle} onChange={e => setEditTitle(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditTopic(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEdit} className="btn-royal flex-1 py-3">{savingEdit ? 'ਸੰਭਾਲਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !deletingTopic && setShowDeleteConfirm(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਵਿਸ਼ਾ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.5)' }}>
              ਇਹ ਵਿਸ਼ਾ ਅਤੇ ਇਸ ਨਾਲ ਜੁੜੇ ਸਾਰੇ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਸ਼ਬਦ ਹਮੇਸ਼ਾ ਲਈ ਮਿਟ ਜਾਣਗੇ।
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} disabled={deletingTopic} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDeleteTopic(showDeleteConfirm)} disabled={deletingTopic} className="btn-danger flex-1 py-3">
                {deletingTopic ? 'ਮਿਟਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਮਿਟਾਓ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CircularProgress({ value, size = 34 }) {
  const r = 12
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <svg width={size} height={size} className="flex-shrink-0" style={{ minWidth: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(14,65,110,0.1)" strokeWidth="3" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a5f8f" strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <text x={size / 2} y={size / 2 + 3.5} textAnchor="middle"
        style={{ fontSize: '7.5px', fontWeight: 700, fill: '#1a5f8f', fontFamily: 'Poppins, sans-serif' }}>
        {value}
      </text>
    </svg>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 24px rgba(14,65,110,0.1)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
