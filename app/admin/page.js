'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import TopBar from '../../components/TopBar'

export default function AdminDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [users, setUsers] = useState([])
  const [userStats, setUserStats] = useState({})
  const [stats, setStats] = useState({ topics: 0, angles: 0, shabads: 0, users: 0 })
  const [loading, setLoading] = useState(true)

  const [showAddUser, setShowAddUser] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [addingUser, setAddingUser] = useState(false)
  const [addUserMsg, setAddUserMsg] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'admin') { router.push('/topics'); return }
      setProfile(prof)

      const [
        { data: usersData },
        { count: topicsCount },
        { count: anglesCount },
        { count: shabadsCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'user').order('created_at', { ascending: false }),
        supabase.from('topics').select('*', { count: 'exact', head: true }),
        supabase.from('angles').select('*', { count: 'exact', head: true }),
        supabase.from('shabads').select('*', { count: 'exact', head: true }),
      ])

      setUsers(usersData || [])
      setStats({ topics: topicsCount || 0, angles: anglesCount || 0, shabads: shabadsCount || 0, users: usersData?.length || 0 })

      if (usersData?.length) {
        const uStats = {}
        await Promise.all(usersData.map(async u => {
          const [{ count: a }, { count: s }] = await Promise.all([
            supabase.from('angles').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
            supabase.from('shabads').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
          ])
          uStats[u.id] = { angles: a || 0, shabads: s || 0 }
        }))
        setUserStats(uStats)
      }

      setLoading(false)
    }
    load()
  }, [router])

  async function handleAddUser(e) {
    e.preventDefault()
    setAddingUser(true)
    setAddUserMsg('')

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ full_name: newFullName.trim(), username: newUsername.trim() }),
    })

    if (res.ok) {
      setAddUserMsg('ਵਰਤੋਂਕਾਰ ਸਫਲਤਾਪੂਰਵਕ ਜੋੜਿਆ ਗਿਆ')
      setNewFullName('')
      setNewUsername('')
      setTimeout(() => { setAddUserMsg(''); setShowAddUser(false) }, 2000)
      const { data: usersData } = await supabase.from('profiles').select('*').eq('role', 'user').order('created_at', { ascending: false })
      setUsers(usersData || [])
      setStats(s => ({ ...s, users: usersData?.length || 0 }))
    } else {
      const err = await res.json()
      setAddUserMsg(err.error || 'ਅਸਫਲਤਾ ਹੋਈ')
    }
    setAddingUser(false)
  }

  async function handleDeleteUser(userId, username) {
    if (!confirm(`"${username}" ਨੂੰ ਹਟਾਉਣਾ ਹੈ?`)) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/admin/users?id=${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    setUsers(prev => prev.filter(u => u.id !== userId))
    setStats(s => ({ ...s, users: s.users - 1 }))
  }

  async function handleResetPassword(userId, username) {
    if (!confirm(`"${username}" ਦਾ ਪਾਸਵਰਡ ਰੀਸੈੱਟ ਕਰਨਾ ਹੈ?`)) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: userId }),
    })
    if (res.ok) alert('ਪਾਸਵਰਡ ਰੀਸੈੱਟ ਹੋ ਗਿਆ (131313)')
  }

  if (loading) return <LoadingScreen />

  const statItems = [
    { label: 'ਵਰਤੋਂਕਾਰ', value: stats.users, emoji: '👥', color: '#1a5f8f' },
    { label: 'ਵਿਸ਼ੇ', value: stats.topics, emoji: '📚', color: '#b45309' },
    { label: 'ਦ੍ਰਿਸ਼ਟੀਕੋਣ', value: stats.angles, emoji: '🔭', color: '#0c2540' },
    { label: 'ਸ਼ਬਦ', value: stats.shabads, emoji: '📖', color: '#0284c7' },
  ]

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fadeInUp">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: '#0c2540' }}>ਪ੍ਰਬੰਧਕ ਪੈਨਲ</h1>
            <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਸਾਰੇ ਵਰਤੋਂਕਾਰ ਅਤੇ ਤਰੱਕੀ ਦੇਖੋ</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push('/admin/topics')} className="btn-gold text-sm px-4 py-2">
              ✦ ਵਿਸ਼ੇ ਪ੍ਰਬੰਧਨ
            </button>
            <button onClick={() => setShowAddUser(true)} className="btn-royal text-sm px-4 py-2">
              + ਵਰਤੋਂਕਾਰ ਜੋੜੋ
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statItems.map((s, i) => (
            <div key={s.label} className="stat-card animate-fadeInUp" style={{ animationDelay: `${i * 0.07}s` }}>
              <div className="text-3xl mb-2">{s.emoji}</div>
              <div className="text-3xl font-black mb-1" style={{ color: s.color }}>{s.value}</div>
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Users Table */}
        <div className="glass-card-static rounded-2xl overflow-hidden animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
          <div className="p-5 border-b" style={{ borderColor: 'rgba(14,65,110,0.08)' }}>
            <h2 className="text-lg font-bold" style={{ color: '#0c2540' }}>ਸਾਰੇ ਵਰਤੋਂਕਾਰ</h2>
          </div>

          {users.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">👤</div>
              <p style={{ color: 'rgba(12,36,64,0.4)' }}>ਅਜੇ ਕੋਈ ਵਰਤੋਂਕਾਰ ਨਹੀਂ ਜੋੜਿਆ</p>
            </div>
          ) : (
            <div>
              {users.map(user => (
                <div key={user.id} className="p-4 flex items-center gap-4 transition-colors"
                  style={{ borderBottom: '1px solid rgba(14,65,110,0.06)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(14,65,110,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
                    {(user.full_name || user.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: '#0c2540' }}>{user.full_name}</p>
                    <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>@{user.username}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm hidden sm:flex" style={{ color: 'rgba(12,36,64,0.5)' }}>
                    <span>{userStats[user.id]?.angles || 0} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
                    <span>{userStats[user.id]?.shabads || 0} ਸ਼ਬਦ</span>
                    <span className="font-bold" style={{ color: '#b45309' }}>{user.score || 0} ✦</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleResetPassword(user.id, user.username)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#b45309' }}>
                      ਰੀਸੈੱਟ
                    </button>
                    <button onClick={() => handleDeleteUser(user.id, user.username)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#dc2626' }}>
                      ਹਟਾਓ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddUser(false)}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-1" style={{ color: '#0c2540' }}>ਨਵਾਂ ਵਰਤੋਂਕਾਰ</h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.45)' }}>
              ਡਿਫਾਲਟ ਪਾਸਵਰਡ: <span className="font-mono font-bold" style={{ color: '#0c2540' }}>131313</span>
            </p>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਪੂਰਾ ਨਾਮ</label>
                <input className="input-royal" placeholder="ਨਾਮ ਲਿਖੋ" value={newFullName} onChange={e => setNewFullName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਤੋਂਕਾਰ ਨਾਮ (ਲਾਗਇਨ ID)</label>
                <input className="input-royal" placeholder="ਵਰਤੋਂਕਾਰ ਨਾਮ" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
              </div>
              {addUserMsg && (
                <div className="rounded-xl px-4 py-3 text-sm text-center"
                  style={{
                    background: addUserMsg.includes('ਸਫਲ') ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${addUserMsg.includes('ਸਫਲ') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    color: addUserMsg.includes('ਸਫਲ') ? '#15803d' : '#dc2626',
                  }}>
                  {addUserMsg}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddUser(false); setAddUserMsg('') }} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={addingUser} className="btn-royal flex-1 py-3">
                  {addingUser ? 'ਜੋੜ ਰਿਹਾ ਹੈ...' : 'ਵਰਤੋਂਕਾਰ ਜੋੜੋ'}
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
          style={{ background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
