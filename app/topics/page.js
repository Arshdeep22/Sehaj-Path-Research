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

      if (topicsData?.length) {
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

      setLoading(false)
    }
    load()
  }, [router])

  function getProgress(topicId) {
    const s = topicStats[topicId]
    if (!s) return 0
    const total = (s.angles * 3) + (s.shabads * 2)
    const max = 60
    return Math.min(100, Math.round((total / max) * 100))
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen" style={{ paddingTop: '72px' }}>
      <TopBar profile={profile} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 animate-fadeInUp">
          <h1 className="text-3xl font-bold text-white mb-2">ਖੋਜ ਦੇ ਵਿਸ਼ੇ</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)' }}>
            ਵਿਸ਼ੇ ਚੁਣੋ ਅਤੇ ਸ਼ਬਦ ਜੋੜੋ
          </p>
        </div>

        {topics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-16 text-center">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-white text-lg mb-2">ਅਜੇ ਕੋਈ ਵਿਸ਼ਾ ਨਹੀਂ ਜੋੜਿਆ</p>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>ਪ੍ਰਬੰਧਕ ਜਲਦ ਵਿਸ਼ੇ ਜੋੜੇਗਾ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {topics.map((topic, i) => {
              const stats = topicStats[topic.id] || { angles: 0, shabads: 0 }
              const progress = getProgress(topic.id)
              return (
                <Link key={topic.id} href={`/topics/${topic.id}`}>
                  <div className="topic-card animate-fadeInUp" style={{ animationDelay: `${i * 0.08}s` }}>
                    {/* Top */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-white mb-1 gurbani-text">{topic.title}</h2>
                        {topic.description && (
                          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {topic.description}
                          </p>
                        )}
                      </div>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center ml-3 flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.1))`,
                          border: '1px solid rgba(124,58,237,0.25)',
                        }}>
                        <span className="text-2xl">{topicEmoji(i)}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1.5">
                        <span className="badge-royal">{stats.angles} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-gold">{stats.shabads} ਸ਼ਬਦ</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <span>ਤਰੱਕੀ</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-end mt-4">
                      <span style={{ color: 'rgba(124,58,237,0.6)', fontSize: '20px' }}>→</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const EMOJIS = ['🌸', '🌊', '🔥', '🌿', '⭐', '🌙', '💫', '🎯', '🌺', '🦋']
function topicEmoji(i) { return EMOJIS[i % EMOJIS.length] }

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse3d"
          style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.1))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
