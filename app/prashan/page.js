'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getCache, setCache, removeCache, useIsomorphicLayoutEffect } from '../../lib/clientCache'
import { notifyQuestionAdded } from '../../lib/push'
import TopBar from '../../components/TopBar'

export default function PrashanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [topics, setTopics] = useState([])
  const [questions, setQuestions] = useState([])        // angles (with topic + answers)
  const [answerAuthors, setAnswerAuthors] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})
  const [scoreFloat, setScoreFloat] = useState(null)

  // Create question
  const [showCreate, setShowCreate] = useState(false)
  const [qDesc, setQDesc] = useState('')
  const [qTopicId, setQTopicId] = useState('')
  const [qTopicSearch, setQTopicSearch] = useState('')
  const [showTopicList, setShowTopicList] = useState(false)
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [savingQ, setSavingQ] = useState(false)

  // Answer (shabad) add
  const [showAnswer, setShowAnswer] = useState(null)     // angleId
  const [ansText, setAnsText] = useState('')
  const [ansComment, setAnsComment] = useState('')
  const [savingAns, setSavingAns] = useState(false)

  // Question (angle) edit / delete — only the asker can do this
  const [editQ, setEditQ] = useState(null)               // angle object
  const [editQText, setEditQText] = useState('')
  const [savingEditQ, setSavingEditQ] = useState(false)
  const [deleteQ, setDeleteQ] = useState(null)           // angle object
  const [deletingQ, setDeletingQ] = useState(false)

  // Answer edit / delete
  const [editAns, setEditAns] = useState(null)           // shabad object
  const [editAnsText, setEditAnsText] = useState('')
  const [editAnsComment, setEditAnsComment] = useState('')
  const [savingEditAns, setSavingEditAns] = useState(false)
  const [deleteAns, setDeleteAns] = useState(null)       // shabad id
  const [deletingAns, setDeletingAns] = useState(false)

  async function loadData() {
    const [{ data: topicsData }, { data: anglesData }] = await Promise.all([
      supabase.from('topics').select('id, title').order('title', { ascending: true }),
      supabase.from('angles').select('id, title, topic_id, created_at, created_by').order('created_at', { ascending: false }),
    ])

    const topicMap = {}
    for (const t of (topicsData || [])) topicMap[t.id] = t
    setTopics(topicsData || [])

    const angleList = anglesData || []
    const angleIds = angleList.map(a => a.id)

    let grouped = {}
    let authors = {}
    if (angleIds.length) {
      const { data: shabadsData } = await supabase
        .from('shabads')
        .select('*')
        .in('angle_id', angleIds)
        .order('created_at', { ascending: true })

      const authorIds = new Set()
      for (const a of angleList) grouped[a.id] = []
      for (const s of (shabadsData || [])) {
        grouped[s.angle_id]?.push(s)
        authorIds.add(s.created_by)
      }

      if (authorIds.size) {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/profiles?ids=${[...authorIds].join(',')}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const { profiles } = await res.json()
        ;(profiles || []).forEach(p => { authors[p.id] = p.full_name || p.username })
      }
    }

    // Only angles phrased as questions (contain "?"); unanswered first, then newest
    const sorted = [...angleList]
      .filter(a => (a.title || '').includes('?'))
      .sort((a, b) =>
        ((grouped[a.id]?.length || 0) > 0 ? 1 : 0) - ((grouped[b.id]?.length || 0) > 0 ? 1 : 0)
      ).map(a => ({ ...a, topic: topicMap[a.topic_id] || null, answers: grouped[a.id] || [] }))

    setQuestions(sorted)
    setAnswerAuthors(authors)
    setCache('prashan', { topics: topicsData || [], questions: sorted, answerAuthors: authors })
  }

  useIsomorphicLayoutEffect(() => {
    const p = getCache('profile')
    if (p) setProfile(p)
    const c = getCache('prashan')
    if (c && p) {
      setTopics(c.topics || [])
      setQuestions(c.questions || [])
      setAnswerAuthors(c.answerAuthors || {})
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      if (prof.role === 'admin') { router.push('/admin'); return }
      setProfile(prof)
      setCache('profile', prof)
      await loadData()
      setLoading(false)
    }
    init()
  }, [router])

  // Deep-link from a notification: #q-<angleId> expands + highlights the question
  useEffect(() => {
    if (loading) return
    const hash = window.location.hash.slice(1)
    if (!hash.startsWith('q-')) return
    const id = hash.slice(2)
    setExpanded(prev => ({ ...prev, [id]: true }))
    setTimeout(() => {
      const el = document.getElementById(hash)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('shabad-highlight')
      setTimeout(() => el.classList.remove('shabad-highlight'), 2500)
    }, 350)
  }, [loading])

  function showScore(points, e) {
    const x = e?.clientX || window.innerWidth / 2
    const y = e?.clientY || window.innerHeight / 2
    setScoreFloat({ points, x, y, key: Date.now() })
    setTimeout(() => setScoreFloat(null), 1300)
  }

  // Create a brand-new topic from inside the question dialog (for questions that
  // don't fit any existing topic). Any authenticated user may create one.
  async function handleCreateTopicInline() {
    const title = qTopicSearch.trim()
    if (!title || creatingTopic) return
    setCreatingTopic(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ title }),
    })
    if (res.ok) {
      const { topic } = await res.json()
      setTopics(prev => [...prev, topic].sort((a, b) => a.title.localeCompare(b.title)))
      setQTopicId(topic.id)
      setQTopicSearch(topic.title)
      setShowTopicList(false)
      removeCache('topics')   // topics list changed → refetch it next time
    }
    setCreatingTopic(false)
  }

  async function handleCreateQuestion(e) {
    e.preventDefault()
    if (!qDesc.trim() || !qTopicId) return
    setSavingQ(true)
    // A question must end with "?" — add it automatically if the user didn't
    let text = qDesc.trim()
    if (!text.endsWith('?')) text += '?'
    const { data: newAngle, error } = await supabase.from('angles').insert({
      topic_id: qTopicId,
      title: text,
      created_by: profile.id,
    }).select('id').single()
    if (!error) {
      setQDesc(''); setQTopicId(''); setQTopicSearch(''); setShowCreate(false)
      await loadData()
      if (newAngle?.id) {
        setExpanded(prev => ({ ...prev, [newAngle.id]: true }))
        notifyQuestionAdded(newAngle.id)   // tell everyone a new question was asked
      }
    }
    setSavingQ(false)
  }

  async function handleEditQuestion(e) {
    e.preventDefault()
    if (!editQText.trim() || !editQ) return
    let text = editQText.trim()
    if (!text.endsWith('?')) text += '?'
    setSavingEditQ(true)
    const { error } = await supabase.from('angles')
      .update({ title: text })
      .eq('id', editQ.id).eq('created_by', profile.id)
    if (!error) { await loadData(); setEditQ(null) }
    setSavingEditQ(false)
  }

  async function handleDeleteQuestion(angle) {
    setDeletingQ(true)
    const answers = angle.answers || []
    const myAnswers = answers.filter(a => a.created_by === profile.id).length
    // Remove answers first, then the question (owner-gated)
    if (answers.length) await supabase.from('shabads').delete().eq('angle_id', angle.id)
    const { error } = await supabase.from('angles').delete().eq('id', angle.id).eq('created_by', profile.id)
    if (!error) {
      if (myAnswers > 0) {
        const newScore = Math.max(0, (profile.score || 0) - myAnswers * 5)
        await supabase.from('profiles').update({ score: newScore }).eq('id', profile.id)
        setProfile(p => ({ ...p, score: newScore }))
      }
      await loadData()
      setDeleteQ(null)
    }
    setDeletingQ(false)
  }

  async function handleAddAnswer(e) {
    e.preventDefault()
    if (!ansText.trim() || ansComment.trim().length < 50) return
    setSavingAns(true)
    const { error } = await supabase.from('shabads').insert({
      angle_id: showAnswer,
      shabad_text: ansText.trim(),
      comment: ansComment.trim(),
      created_by: profile.id,
    })
    if (!error) {
      await supabase.from('profiles').update({ score: (profile.score || 0) + 5 }).eq('id', profile.id)
      setProfile(p => ({ ...p, score: (p.score || 0) + 5 }))
      showScore('+5', e)
      setAnsText(''); setAnsComment(''); setShowAnswer(null)
      await loadData()
    }
    setSavingAns(false)
  }

  async function handleEditAnswer(e) {
    e.preventDefault()
    if (!editAnsText.trim() || !editAns) return
    setSavingEditAns(true)
    const { error } = await supabase.from('shabads')
      .update({ shabad_text: editAnsText.trim(), comment: editAnsComment.trim() || null })
      .eq('id', editAns.id).eq('created_by', profile.id)
    if (!error) { await loadData(); setEditAns(null) }
    setSavingEditAns(false)
  }

  async function handleDeleteAnswer(id) {
    setDeletingAns(true)
    const { error } = await supabase.from('shabads').delete().eq('id', id).eq('created_by', profile.id)
    if (!error) {
      const newScore = Math.max(0, (profile.score || 0) - 5)
      await supabase.from('profiles').update({ score: newScore }).eq('id', profile.id)
      setProfile(p => ({ ...p, score: newScore }))
      await loadData()
      setDeleteAns(null)
    }
    setDeletingAns(false)
  }

  if (loading) return <LoadingScreen />

  const query = search.trim().toLowerCase()
  const filtered = query
    ? questions.filter(q =>
        q.title.toLowerCase().includes(query) ||
        (q.topic?.title || '').toLowerCase().includes(query))
    : questions

  const topicQuery = qTopicSearch.trim().toLowerCase()
  const filteredTopics = topicQuery
    ? topics.filter(t => t.title.toLowerCase().includes(topicQuery))
    : topics

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      {scoreFloat && (
        <div key={scoreFloat.key} className="score-float text-xl font-extrabold"
          style={{ left: scoreFloat.x, top: scoreFloat.y }}>
          {scoreFloat.points} ✦
        </div>
      )}

      <div className="px-4 py-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 animate-fadeInUp">
          <div>
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: '#0c2540' }}>ਪ੍ਰਸ਼ਨ</h1>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>ਪ੍ਰਸ਼ਨ ਪੁੱਛੋ ਤੇ ਉੱਤਰ ਦਿਓ</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-gold text-sm px-4 py-2.5 flex-shrink-0" style={{ fontSize: '13px' }}>
            + ਨਵਾਂ ਪ੍ਰਸ਼ਨ
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="rgba(12,36,64,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="input-royal" style={{ paddingLeft: 38 }} placeholder="ਪ੍ਰਸ਼ਨ ਖੋਜੋ..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 && (
          <div className="glass-card-static rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">❓</div>
            <p className="font-medium mb-1" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਪ੍ਰਸ਼ਨ ਨਹੀਂ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਪਹਿਲਾ ਪ੍ਰਸ਼ਨ ਪੁੱਛੋ</p>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((q, i) => {
            const answers = q.answers || []
            const isOpen = expanded[q.id]
            return (
              <div key={q.id} id={`q-${q.id}`} className="glass-card-static rounded-2xl p-4 animate-fadeInUp"
                style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}>
                {/* Question row */}
                <div className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpanded(prev => ({ ...prev, [q.id]: !prev[q.id] }))}>
                  <div className="flex-1">
                    <p className="font-semibold gurbani-text" style={{ color: '#0c2540' }}>{q.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="badge-royal" style={{ fontSize: '11px' }}>{q.topic?.title || 'ਵਿਸ਼ਾ'}</span>
                      {answers.length === 0
                        ? <span className="badge-gold" style={{ fontSize: '11px' }}>ਉੱਤਰ ਦੀ ਉਡੀਕ</span>
                        : <span className="text-xs" style={{ color: 'rgba(12,36,64,0.45)' }}>{answers.length} ਉੱਤਰ</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {q.created_by === profile.id && (
                      <>
                        <button onClick={e => { e.stopPropagation(); setEditQ(q); setEditQText(q.title) }}
                          className="p-1.5 rounded-lg transition-colors" title="ਸੰਪਾਦਿਤ ਕਰੋ"
                          style={{ color: 'rgba(26,95,143,0.5)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.5)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDeleteQ(q) }}
                          className="p-1.5 rounded-lg transition-colors" title="ਮਿਟਾਓ"
                          style={{ color: 'rgba(239,68,68,0.45)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.45)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </>
                    )}
                    <span
                      className="flex items-center justify-center rounded-full transition-all duration-300"
                      style={{
                        width: 28,
                        height: 28,
                        background: isOpen ? 'rgba(14,65,110,0.1)' : 'rgba(14,65,110,0.05)',
                        color: '#1a5f8f',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Answers */}
                {isOpen && (
                  <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(14,65,110,0.1)' }}>
                    {answers.length === 0 && (
                      <p className="text-sm text-center py-2" style={{ color: 'rgba(12,36,64,0.35)' }}>ਅਜੇ ਕੋਈ ਉੱਤਰ ਨਹੀਂ</p>
                    )}
                    {answers.map(ans => {
                      const isOwner = ans.created_by === profile.id
                      return (
                        <div key={ans.id} id={`shabad-${ans.id}`} className="shabad-card">
                          <p className="gurbani-text text-base leading-relaxed mb-2 whitespace-pre-wrap" style={{ color: '#0c2540' }}>
                            {ans.shabad_text}
                          </p>
                          {ans.comment && (
                            <>
                              <div className="divider-royal my-2" />
                              <p className="text-sm italic" style={{ color: 'rgba(12,36,64,0.6)' }}>"{ans.comment}"</p>
                            </>
                          )}
                          <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid rgba(14,65,110,0.08)' }}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
                                {(answerAuthors[ans.created_by] || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-xs" style={{ color: 'rgba(12,36,64,0.5)' }}>
                                {answerAuthors[ans.created_by] || 'ਅਣਜਾਣ'}
                              </span>
                            </div>
                            {isOwner && (
                              <div className="flex gap-0.5">
                                <button onClick={() => { setEditAns(ans); setEditAnsText(ans.shabad_text); setEditAnsComment(ans.comment || '') }}
                                  className="p-1 rounded transition-colors" style={{ color: 'rgba(26,95,143,0.45)' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,65,110,0.08)'; e.currentTarget.style.color = '#1a5f8f' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(26,95,143,0.45)' }}
                                  title="ਸੰਪਾਦਿਤ ਕਰੋ">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button onClick={() => setDeleteAns(ans.id)}
                                  className="p-1 rounded transition-colors" style={{ color: 'rgba(239,68,68,0.4)' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'rgba(239,68,68,0.4)' }}
                                  title="ਮਿਟਾਓ">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <button onClick={() => { setShowAnswer(q.id); setAnsText(''); setAnsComment('') }}
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={{ border: '1px dashed rgba(14,65,110,0.3)', color: '#1a5f8f', background: 'rgba(14,65,110,0.03)' }}>
                      + ਉੱਤਰ ਦਿਓ
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Create question modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-1" style={{ color: '#0c2540' }}>ਨਵਾਂ ਪ੍ਰਸ਼ਨ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਪ੍ਰਸ਼ਨ ਲਿਖੋ ਤੇ ਵਿਸ਼ਾ ਚੁਣੋ ਜਾਂ ਨਵਾਂ ਬਣਾਓ</p>
            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਪ੍ਰਸ਼ਨ (ਵਰਣਨ) *</label>
                <textarea className="textarea-royal gurbani-text" placeholder="ਆਪਣਾ ਪ੍ਰਸ਼ਨ ਲਿਖੋ..." value={qDesc} onChange={e => setQDesc(e.target.value)} rows={3} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਿਸ਼ਾ *</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(12,36,64,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input className="input-royal" style={{ paddingLeft: 38, paddingRight: 38 }} placeholder="ਵਿਸ਼ਾ ਖੋਜੋ ਤੇ ਚੁਣੋ..."
                    value={qTopicSearch}
                    onChange={e => { setQTopicSearch(e.target.value); setQTopicId(''); setShowTopicList(true) }}
                    onFocus={() => setShowTopicList(true)}
                    required={!qTopicId} />
                  {qTopicId && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                {showTopicList && (
                  <div className="topic-dropdown mt-2">
                    {filteredTopics.map((t, idx) => {
                      const selected = t.id === qTopicId
                      return (
                        <button type="button" key={t.id}
                          onClick={() => { setQTopicId(t.id); setQTopicSearch(t.title); setShowTopicList(false) }}
                          className={`topic-dropdown-item${selected ? ' selected' : ''}`}
                          style={{ animationDelay: `${Math.min(idx * 0.03, 0.25)}s` }}>
                          <span className="topic-dropdown-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          </span>
                          <span className="flex-1 text-left gurbani-text">{t.title}</span>
                          {selected && (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      )
                    })}

                    {/* Create a new topic when none fit */}
                    {qTopicSearch.trim() &&
                      !topics.some(t => t.title.trim().toLowerCase() === qTopicSearch.trim().toLowerCase()) && (
                      <button type="button" onClick={handleCreateTopicInline} disabled={creatingTopic}
                        className="topic-dropdown-item" style={{ color: '#16a34a' }}>
                        <span className="topic-dropdown-icon" style={{ color: '#16a34a', background: 'rgba(22,163,74,0.1)' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </span>
                        <span className="flex-1 text-left">
                          {creatingTopic ? 'ਬਣ ਰਿਹਾ...' : <>ਨਵਾਂ ਵਿਸ਼ਾ ਬਣਾਓ: <span className="gurbani-text font-semibold">“{qTopicSearch.trim()}”</span></>}
                        </span>
                      </button>
                    )}

                    {filteredTopics.length === 0 && !qTopicSearch.trim() && (
                      <div className="px-4 py-3 text-sm text-center" style={{ color: 'rgba(12,36,64,0.4)' }}>
                        ਵਿਸ਼ਾ ਖੋਜੋ ਜਾਂ ਨਵਾਂ ਲਿਖੋ
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingQ || !qDesc.trim() || !qTopicId} className="btn-royal flex-1 py-3">{savingQ ? 'ਪੁੱਛ ਰਿਹਾ...' : 'ਪੁੱਛੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit question modal */}
      {editQ && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditQ(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਪ੍ਰਸ਼ਨ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditQuestion} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਪ੍ਰਸ਼ਨ *</label>
                <textarea className="textarea-royal gurbani-text" value={editQText} onChange={e => setEditQText(e.target.value)} rows={3} required autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditQ(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditQ} className="btn-royal flex-1 py-3">{savingEditQ ? 'ਸੰਭਾਲ ਰਿਹਾ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete question confirm */}
      {deleteQ && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteQ(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਪ੍ਰਸ਼ਨ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.5)' }}>
              {(deleteQ.answers?.length || 0) > 0
                ? `ਇਸ ਪ੍ਰਸ਼ਨ ਦੇ ${deleteQ.answers.length} ਉੱਤਰ ਵੀ ਮਿਟ ਜਾਣਗੇ। ਇਹ ਕਾਰਵਾਈ ਵਾਪਸ ਨਹੀਂ ਹੋ ਸਕਦੀ।`
                : 'ਇਹ ਕਾਰਵਾਈ ਵਾਪਸ ਨਹੀਂ ਹੋ ਸਕਦੀ।'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteQ(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDeleteQuestion(deleteQ)} disabled={deletingQ} className="btn-danger flex-1 py-3">{deletingQ ? 'ਮਿਟਾ ਰਿਹਾ...' : 'ਮਿਟਾਓ'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add answer modal */}
      {showAnswer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAnswer(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-1" style={{ color: '#0c2540' }}>ਉੱਤਰ ਦਿਓ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>ਗੁਰਬਾਣੀ ਵਿੱਚੋਂ ਸ਼ਬਦ ਕਾਪੀ-ਪੇਸਟ ਕਰੋ</p>
            <form onSubmit={handleAddAnswer} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸ਼ਬਦ (ਗੁਰਬਾਣੀ) *</label>
                <textarea className="textarea-royal gurbani-text text-base" placeholder="ਇੱਥੇ ਸ਼ਬਦ ਪੇਸਟ ਕਰੋ..." value={ansText} onChange={e => setAnsText(e.target.value)} rows={5} required />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਤੁਹਾਡੀ ਟਿੱਪਣੀ *</label>
                <textarea className="textarea-royal" placeholder="ਇਹ ਸ਼ਬਦ ਪ੍ਰਸ਼ਨ ਦਾ ਉੱਤਰ ਕਿਵੇਂ ਦਿੰਦਾ ਹੈ..." value={ansComment} onChange={e => setAnsComment(e.target.value)} rows={3} required />
                <p className="text-xs mt-1 text-right" style={{ color: ansComment.trim().length >= 50 ? 'rgba(22,163,74,0.8)' : 'rgba(239,68,68,0.7)' }}>
                  {ansComment.trim().length}/50 ਅੱਖਰ
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAnswer(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingAns || ansComment.trim().length < 50} className="btn-royal flex-1 py-3">{savingAns ? 'ਜੋੜ ਰਿਹਾ...' : 'ਜੋੜੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit answer modal */}
      {editAns && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditAns(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-5" style={{ color: '#0c2540' }}>ਉੱਤਰ ਸੰਪਾਦਿਤ ਕਰੋ</h3>
            <form onSubmit={handleEditAnswer} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਸ਼ਬਦ *</label>
                <textarea className="textarea-royal gurbani-text text-base" value={editAnsText} onChange={e => setEditAnsText(e.target.value)} rows={5} required autoFocus />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਟਿੱਪਣੀ</label>
                <textarea className="textarea-royal" value={editAnsComment} onChange={e => setEditAnsComment(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditAns(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={savingEditAns} className="btn-royal flex-1 py-3">{savingEditAns ? 'ਸੰਭਾਲ ਰਿਹਾ...' : 'ਸੰਭਾਲੋ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete answer confirm */}
      {deleteAns && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteAns(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>ਉੱਤਰ ਮਿਟਾਓ?</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.5)' }}>ਇਹ ਕਾਰਵਾਈ ਵਾਪਸ ਨਹੀਂ ਹੋ ਸਕਦੀ। (-5 ✦)</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAns(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button onClick={() => handleDeleteAnswer(deleteAns)} disabled={deletingAns} className="btn-danger flex-1 py-3">{deletingAns ? 'ਮਿਟਾ ਰਿਹਾ...' : 'ਮਿਟਾਓ'}</button>
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
      <div className="w-10 h-10 rounded-full animate-spin"
        style={{ border: '3px solid rgba(14,65,110,0.15)', borderTopColor: '#1a5f8f' }} />
    </div>
  )
}
