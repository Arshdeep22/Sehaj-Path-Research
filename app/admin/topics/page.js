'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'

export default function AdminTopicsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportingId, setExportingId] = useState(null)

  const [showAdd, setShowAdd] = useState(false)
  const [editTopic, setEditTopic] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadTopics() {
    const { data } = await supabase.from('topics').select('*').order('created_at', { ascending: true })
    setTopics(data || [])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'admin') { router.push('/topics'); return }
      setProfile(prof)
      await loadTopics()
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)

    if (editTopic) {
      await supabase.from('topics').update({ title: title.trim(), description: description.trim() || null }).eq('id', editTopic.id)
    } else {
      await supabase.from('topics').insert({ title: title.trim(), description: description.trim() || null, created_by: profile.id })
    }

    await loadTopics()
    setTitle('')
    setDescription('')
    setShowAdd(false)
    setEditTopic(null)
    setSaving(false)
  }

  async function handleDelete(topicId, topicTitle) {
    if (!confirm(`"${topicTitle}" ਨੂੰ ਹਟਾਉਣਾ ਹੈ? ਸਾਰੇ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਅਤੇ ਸ਼ਬਦ ਵੀ ਹਟ ਜਾਣਗੇ।`)) return
    await supabase.from('topics').delete().eq('id', topicId)
    setTopics(prev => prev.filter(t => t.id !== topicId))
  }

  async function handleExport(topic) {
    setExportingId(topic.id)

    const { data: angles } = await supabase.from('angles').select('*').eq('topic_id', topic.id).order('created_at')

    const allShabads = []
    if (angles?.length) {
      const authorIds = new Set(angles.map(a => a.created_by))

      await Promise.all(angles.map(async angle => {
        const { data: shabads } = await supabase.from('shabads').select('*').eq('angle_id', angle.id).order('created_at')
        ;(shabads || []).forEach(s => { authorIds.add(s.created_by); allShabads.push({ ...s, angleTitle: angle.title }) })
      }))

      const { data: authors } = await supabase.from('profiles').select('id, full_name, username').in('id', [...authorIds])
      const authorMap = {}
      ;(authors || []).forEach(a => { authorMap[a.id] = a.full_name || a.username })

      const rows = [
        ['ਵਿਸ਼ਾ', 'ਦ੍ਰਿਸ਼ਟੀਕੋਣ', 'ਸ਼ਬਦ', 'ਟਿੱਪਣੀ', 'ਵਰਤੋਂਕਾਰ', 'ਮਿਤੀ'],
        ...(allShabads.length
          ? allShabads.map(s => [topic.title, s.angleTitle, s.shabad_text, s.comment || '', authorMap[s.created_by] || '', new Date(s.created_at).toLocaleDateString('pa-IN')])
          : [[topic.title, '', 'ਕੋਈ ਸ਼ਬਦ ਨਹੀਂ', '', '', '']]),
      ]

      const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${topic.title}_ਖੋਜ.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    setExportingId(null)
  }

  function openEdit(topic) {
    setEditTopic(topic)
    setTitle(topic.title)
    setDescription(topic.description || '')
    setShowAdd(true)
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen" style={{ paddingTop: '72px' }}>
      <TopBar profile={profile} />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 animate-fadeInUp">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: '#0c2540' }}>ਵਿਸ਼ੇ ਪ੍ਰਬੰਧਨ</h1>
            <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਨਵੇਂ ਵਿਸ਼ੇ ਜੋੜੋ ਜਾਂ ਸੰਪਾਦਿਤ ਕਰੋ</p>
          </div>
          <button onClick={() => { setShowAdd(true); setEditTopic(null); setTitle(''); setDescription('') }} className="btn-gold text-sm px-4 py-2">
            + ਨਵਾਂ ਵਿਸ਼ਾ
          </button>
        </div>

        {topics.length === 0 ? (
          <div className="glass-card-static rounded-2xl p-16 text-center">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-lg font-medium" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਵਿਸ਼ਾ ਨਹੀਂ</p>
            <p className="text-sm mt-2" style={{ color: 'rgba(12,36,64,0.4)' }}>ਉੱਪਰ ਦਿੱਤੇ ਬਟਨ ਨਾਲ ਪਹਿਲਾ ਵਿਸ਼ਾ ਜੋੜੋ</p>
          </div>
        ) : (
          <div className="space-y-4">
            {topics.map((topic, i) => (
              <div key={topic.id} className="glass-card animate-fadeInUp" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold mb-1 gurbani-text" style={{ color: '#0c2540' }}>{topic.title}</h3>
                      {topic.description && (
                        <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>{topic.description}</p>
                      )}
                      <p className="text-xs mt-2" style={{ color: 'rgba(12,36,64,0.3)' }}>
                        {new Date(topic.created_at).toLocaleDateString('pa-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleExport(topic)} disabled={exportingId === topic.id}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.15)', color: '#0c2540' }}>
                        {exportingId === topic.id ? '...' : '↓ CSV'}
                      </button>
                      <button onClick={() => openEdit(topic)}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.15)', color: '#1a5f8f' }}>
                        ਸੰਪਾਦਨ
                      </button>
                      <button onClick={() => handleDelete(topic.id, topic.title)}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', color: '#dc2626' }}>
                        ਹਟਾਓ
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAdd(false), setEditTopic(null))}>
          <div className="modal-box">
            <h3 className="text-xl font-bold mb-5" style={{ color: '#0c2540' }}>
              {editTopic ? 'ਵਿਸ਼ਾ ਸੰਪਾਦਨ ਕਰੋ' : 'ਨਵਾਂ ਵਿਸ਼ਾ ਜੋੜੋ'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਿਸ਼ੇ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਗੁਰਮੁਖੀ ਵਿੱਚ ਲਿਖੋ" value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(12,36,64,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" placeholder="ਵਿਸ਼ੇ ਬਾਰੇ ਜਾਣਕਾਰੀ..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setEditTopic(null) }} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-gold flex-1 py-3">
                  {saving ? 'ਸੁਰੱਖਿਅਤ...' : editTopic ? 'ਅੱਪਡੇਟ ਕਰੋ' : 'ਜੋੜੋ'}
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
