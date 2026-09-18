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
    return Math.min(100, Math.round(((s.angles * 3 + s.shabads * 2) / 60) * 100))
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen" style={{ paddingTop: '72px' }}>
      <TopBar profile={profile} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 animate-fadeInUp">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#0c2540' }}>ਖੋਜ ਦੇ ਵਿਸ਼ੇ</h1>
          <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਵਿਸ਼ੇ ਚੁਣੋ ਅਤੇ ਸ਼ਬਦ ਜੋੜੋ</p>
        </div>

        {topics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-16 text-center">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-lg mb-2 font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਵਿਸ਼ਾ ਨਹੀਂ ਜੋੜਿਆ</p>
            <p style={{ color: 'rgba(12,36,64,0.4)' }}>ਪ੍ਰਬੰਧਕ ਜਲਦ ਵਿਸ਼ੇ ਜੋੜੇਗਾ</p>
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
                    <div className="mb-4">
                      <h2 className="text-xl font-bold mb-1 gurbani-text" style={{ color: '#0c2540' }}>
                        {topic.title}
                      </h2>
                      {topic.description && (
                        <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                          {topic.description}
                        </p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 mb-4">
                      <span className="badge-royal">{stats.angles} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
                      <span className="badge-gold">{stats.shabads} ਸ਼ਬਦ</span>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(12,36,64,0.45)' }}>
                        <span>ਤਰੱਕੀ</span>
                        <span className="font-semibold">{progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-end mt-4">
                      <span style={{ color: 'rgba(14,65,110,0.4)', fontSize: '20px' }}>→</span>
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
