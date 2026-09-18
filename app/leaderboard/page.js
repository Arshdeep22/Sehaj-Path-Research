'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import TopBar from '../../components/TopBar'

export default function LeaderboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [leaders, setLeaders] = useState([])
  const [userStats, setUserStats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.must_change_password) { router.push('/change-password'); return }
      setProfile(prof)

      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, username, score, created_at')
        .eq('role', 'user')
        .order('score', { ascending: false })
      setLeaders(users || [])

      if (users?.length) {
        const stats = {}
        await Promise.all(users.map(async u => {
          const [{ count: a }, { count: s }] = await Promise.all([
            supabase.from('angles').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
            supabase.from('shabads').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
          ])
          stats[u.id] = { angles: a || 0, shabads: s || 0 }
        }))
        setUserStats(stats)
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <LoadingScreen />

  const myRank = leaders.findIndex(u => u.id === profile.id) + 1

  return (
    <div className="min-h-screen" style={{ paddingTop: '72px' }}>
      <TopBar profile={profile} />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10 animate-fadeInUp">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#0c2540' }}>ਸਰਵੋਤਮ ਸੂਚੀ</h1>
          <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਸਭ ਤੋਂ ਵੱਧ ਯੋਗਦਾਨ ਪਾਉਣ ਵਾਲੇ</p>
        </div>

        {/* Top 3 Podium */}
        {leaders.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-10 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            <PodiumCard user={leaders[1]} rank={2} stats={userStats[leaders[1]?.id]} isMe={leaders[1]?.id === profile.id} />
            <PodiumCard user={leaders[0]} rank={1} stats={userStats[leaders[0]?.id]} isMe={leaders[0]?.id === profile.id} tall />
            <PodiumCard user={leaders[2]} rank={3} stats={userStats[leaders[2]?.id]} isMe={leaders[2]?.id === profile.id} />
          </div>
        )}

        {/* My rank highlight */}
        {myRank > 3 && (
          <div className="mb-6 p-4 rounded-xl animate-fadeInUp"
            style={{ background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.15)' }}>
            <p className="text-center text-sm" style={{ color: '#1a5f8f' }}>
              ਤੁਹਾਡੀ ਸਥਿਤੀ: <span className="font-bold text-lg" style={{ color: '#0c2540' }}>#{myRank}</span>
              &nbsp;|&nbsp; ਅੰਕ: <span className="font-bold text-lg" style={{ color: '#b45309' }}>{profile.score || 0}</span>
            </p>
          </div>
        )}

        {/* Full list */}
        <div className="space-y-3">
          {leaders.map((user, i) => (
            <div
              key={user.id}
              className={`lb-row animate-fadeInUp`}
              style={{
                animationDelay: `${0.05 * i}s`,
                ...(user.id === profile.id ? { background: 'rgba(14,65,110,0.08)', borderColor: 'rgba(14,65,110,0.2)' } : {}),
              }}
            >
              <div className="w-8 text-center">
                {i === 0 && <span className="text-xl">🥇</span>}
                {i === 1 && <span className="text-xl">🥈</span>}
                {i === 2 && <span className="text-xl">🥉</span>}
                {i >= 3 && <span className="text-sm font-bold" style={{ color: 'rgba(12,36,64,0.4)' }}>#{i + 1}</span>}
              </div>

              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${rankGradient(i)})`, color: 'white' }}>
                {(user.full_name || user.username || '?')[0].toUpperCase()}
              </div>

              <div className="flex-1">
                <p className="font-semibold" style={{ color: '#0c2540' }}>
                  {user.full_name || user.username}
                  {user.id === profile.id && <span className="ml-2 badge-royal text-xs">ਤੁਸੀਂ</span>}
                </p>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs" style={{ color: 'rgba(12,36,64,0.4)' }}>{userStats[user.id]?.angles || 0} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
                  <span className="text-xs" style={{ color: 'rgba(12,36,64,0.4)' }}>{userStats[user.id]?.shabads || 0} ਸ਼ਬਦ</span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-black text-xl" style={{ color: '#b45309' }}>{user.score || 0}</span>
                <p className="text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>ਅੰਕ</p>
              </div>
            </div>
          ))}

          {leaders.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🌱</div>
              <p style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਖੋਜੀ ਨਹੀਂ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PodiumCard({ user, rank, stats, isMe, tall }) {
  if (!user) return null
  const rankColors = { 1: '#b45309', 2: '#6b7280', 3: '#92400e' }
  const rankEmojis = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="glass-card-static rounded-2xl p-4 text-center transition-all"
      style={{
        ...(tall ? { boxShadow: '0 12px 40px rgba(14,65,110,0.12), 0 0 0 1px rgba(245,158,11,0.2)', marginTop: '-16px' } : {}),
        ...(isMe ? { border: '1px solid rgba(14,65,110,0.3)' } : {}),
      }}>
      <div className="text-3xl mb-2">{rankEmojis[rank]}</div>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg mx-auto mb-2"
        style={{ background: `linear-gradient(135deg, ${rankGradient(rank - 1)})`, color: 'white' }}>
        {(user.full_name || user.username || '?')[0].toUpperCase()}
      </div>
      <p className="font-semibold text-sm truncate" style={{ color: '#0c2540' }}>{user.full_name || user.username}</p>
      <p className="font-black text-2xl mt-1" style={{ color: rankColors[rank] }}>{user.score || 0}</p>
      <p className="text-xs mt-1" style={{ color: 'rgba(12,36,64,0.35)' }}>ਅੰਕ</p>
      {stats && (
        <div className="mt-2 flex justify-center gap-2">
          <span className="badge-royal" style={{ fontSize: '10px' }}>{stats.angles}d</span>
          <span className="badge-gold" style={{ fontSize: '10px' }}>{stats.shabads}s</span>
        </div>
      )}
    </div>
  )
}

function rankGradient(i) {
  const g = ['#d97706, #b45309', '#9ca3af, #6b7280', '#cd7f32, #a0522d', '#1a5f8f, #0c2540', '#0ea5e9, #0284c7']
  return g[i % g.length]
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
