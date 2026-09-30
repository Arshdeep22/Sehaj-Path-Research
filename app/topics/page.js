'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

  async function loadTopicStats(topicsData) {
    if (!topicsData?.length) return
    const stats = {}
    await Promise.all(topicsData.map(async topic => {
      const { data: angles } = await supabase
        .from('angles')
        .select('id')
        .eq('topic_id', topic.id)
      const angleIds = (angles || []).map(a => a.id)
      let shabadCount = 0
      if (angleIds.length) {
        const { count } = await supabase
          .from('shabads')
          .select('*', { count: 'exact', head: true })
          .in('angle_id', angleIds)
        shabadCount = count || 0
      }
      stats[topic.id] = { angles: angleIds.length, shabads: shabadCount }
    }))
    setTopicStats(stats)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!prof) { router.push('/'); return }
      if (prof.must_change_password) { router.push('/change-password'); return }
      if (prof.role === 'admin') { router.push('/admin'); return }
      setProfile(prof)

      const { data: topicsData } = await supabase
        .from('topics')
        .select('*')
        .order('created_at', { ascending: true })
      setTopics(topicsData || [])
      await loadTopicStats(topicsData)

      setLoading(false)
    }
    load()
  }, [router])

  function getProgress(topicId) {
    const s = topicStats[topicId]
    if (!s) return 0
    return Math.min(100, Math.round(((s.angles * 3 + s.shabads * 2) / 60) * 100))
  }

  async function handleAddTopic(e) {
    e.preventDefault()
    if (!newTopicTitle.trim()) return
    setSavingTopic(true)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ title: newTopicTitle.trim(), description: newTopicDesc.trim() }),
    })

    if (res.ok) {
      const { topic } = await res.json()
      const updated = [...topics, topic]
      setTopics(updated)
      setTopicStats(prev => ({ ...prev, [topic.id]: { angles: 0, shabads: 0 } }))
      setShowAddTopic(false)
      setNewTopicTitle('')
      setNewTopicDesc('')
    }

    setSavingTopic(false)
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
        <div className="flex items-center justify-between mb-6 animate-fadeInUp">
          <div>
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: '#0c2540' }}>ਖੋਜ ਦੇ ਵਿਸ਼ੇ</h1>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>ਵਿਸ਼ੇ ਚੁਣੋ ਅਤੇ ਸ਼ਬਦ ਜੋੜੋ</p>
          </div>
          <button
            onClick={() => setShowAddTopic(true)}
            className="btn-gold text-sm px-4 py-2.5 flex-shrink-0"
            style={{ fontSize: '13px' }}>
            + ਨਵਾਂ ਵਿਸ਼ਾ
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mb-5 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="rgba(12,36,64,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="input-royal pl-9 pr-9"
            placeholder="ਵਿਸ਼ਾ ਲੱਭੋ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(12,36,64,0.35)', lineHeight: 1 }}
              aria-label="clear">
              ✕
            </button>
          )}
        </div>

        {topics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-12 text-center">
            <div className="text-5xl mb-3">📚</div>
            <p className="text-base mb-1 font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਵਿਸ਼ਾ ਨਹੀਂ ਜੋੜਿਆ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.4)' }}>ਉੱਪਰ + ਬਟਨ ਦੱਬ ਕੇ ਪਹਿਲਾ ਵਿਸ਼ਾ ਜੋੜੋ</p>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-base font-medium" style={{ color: '#0c2540' }}>ਕੋਈ ਨਤੀਜਾ ਨਹੀਂ ਮਿਲਿਆ</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(12,36,64,0.4)' }}>ਕੋਈ ਹੋਰ ਸ਼ਬਦ ਵਰਤੋ</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTopics.map((topic, i) => {
              const stats = topicStats[topic.id] || { angles: 0, shabads: 0 }
              const progress = getProgress(topic.id)
              return (
                <Link key={topic.id} href={`/topics/${topic.id}`}>
                  <div className="topic-card animate-fadeInUp" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="mb-3">
                      <h2 className="text-lg font-bold mb-1 gurbani-text" style={{ color: '#0c2540' }}>
                        {topic.title}
                      </h2>
                      {topic.description && (
                        <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                          {topic.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="badge-royal">{stats.angles} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
                      <span className="badge-gold">{stats.shabads} ਸ਼ਬਦ</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(12,36,64,0.45)' }}>
                        <span>ਤਰੱਕੀ</span>
                        <span className="font-semibold">{progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="flex justify-end mt-3">
                      <span style={{ color: 'rgba(14,65,110,0.4)', fontSize: '18px' }}>→</span>
                    </div>
                  </div>
                </Link>
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
                <input
                  className="input-royal"
                  placeholder="ਗੁਰਮੁਖੀ ਵਿੱਚ ਲਿਖੋ"
                  value={newTopicTitle}
                  onChange={e => setNewTopicTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea
                  className="textarea-royal"
                  placeholder="ਵਿਸ਼ੇ ਬਾਰੇ ਜਾਣਕਾਰੀ..."
                  value={newTopicDesc}
                  onChange={e => setNewTopicDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddTopic(false); setNewTopicTitle(''); setNewTopicDesc('') }}
                  className="btn-ghost flex-1 py-3">
                  ਰੱਦ ਕਰੋ
                </button>
                <button type="submit" disabled={savingTopic} className="btn-gold flex-1 py-3">
                  {savingTopic ? 'ਜੋੜਿਆ ਜਾ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ'}
                </button>
              </div>
            </form>
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
          style={{ background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 24px rgba(14,65,110,0.1)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
