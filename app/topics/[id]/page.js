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
  const [angleDesc, setAngleDesc] = useState('')
  const [shabadText, setShabadText] = useState('')
  const [shabadComment, setShabadComment] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const { data: anglesData } = await supabase
      .from('angles')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
    setAngles(anglesData || [])

    if (anglesData?.length) {
      const allShabads = {}
      const authorIds = new Set()
      anglesData.forEach(a => authorIds.add(a.created_by))

      await Promise.all(anglesData.map(async angle => {
        const { data: shabadsData } = await supabase
          .from('shabads')
          .select('*')
          .eq('angle_id', angle.id)
          .order('created_at', { ascending: true })
        allShabads[angle.id] = shabadsData || []
        ;(shabadsData || []).forEach(s => authorIds.add(s.created_by))
      }))

      setShabads(allShabads)

      if (authorIds.size) {
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', [...authorIds])
        const map = {}
        ;(authors || []).forEach(a => { map[a.id] = a.full_name || a.username })
        setAuthorMap(map)
      }
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
      description: angleDesc.trim() || null,
      created_by: profile.id,
    }).select().single()

    if (!error) {
      await supabase.from('profiles').update({ score: (profile.score || 0) + 10 }).eq('id', profile.id)
      setProfile(p => ({ ...p, score: (p.score || 0) + 10 }))
      showScoreAnimation('+10', e)
      setAngleTitle('')
      setAngleDesc('')
      setShowAddAngle(false)
      await loadData()
      setExpandedAngles(prev => ({ ...prev, [newAngle.id]: true }))
    }
    setSaving(false)
  }

  async function addShabad(e) {
    e.preventDefault()
    if (!shabadText.trim()) return
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

  function getProgress() {
    const totalAngles = angles.length
    const totalShabads = Object.values(shabads).reduce((s, arr) => s + arr.length, 0)
    const score = (totalAngles * 3) + (totalShabads * 2)
    return Math.min(100, Math.round((score / 60) * 100))
  }

  if (loading) return <LoadingScreen />

  const progress = getProgress()
  const totalShabads = Object.values(shabads).reduce((s, arr) => s + arr.length, 0)

  return (
    <div className="min-h-screen" style={{ paddingTop: '72px' }}>
      <TopBar profile={profile} />

      {/* Score Float */}
      {scoreFloat && (
        <div key={scoreFloat.key} className="score-float text-xl font-extrabold"
          style={{ left: scoreFloat.x - 20, top: scoreFloat.y - 20 }}>
          {scoreFloat.points} ✦
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/topics" className="inline-flex items-center gap-2 mb-6 text-sm transition-opacity"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          ← ਵਿਸ਼ਿਆਂ ਵੱਲ ਵਾਪਸ
        </Link>

        {/* Topic Header */}
        <div className="glass-card-static rounded-2xl p-6 mb-6 animate-fadeInUp">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 gurbani-text">{topic?.title}</h1>
              {topic?.description && (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{topic.description}</p>
              )}
            </div>
            <div className="flex gap-3 ml-4">
              <span className="badge-royal">{angles.length} ਦ੍ਰਿਸ਼ਟੀਕੋਣ</span>
              <span className="badge-gold">{totalShabads} ਸ਼ਬਦ</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
          <h2 className="text-lg font-semibold text-white">ਦ੍ਰਿਸ਼ਟੀਕੋਣ</h2>
          <button onClick={() => setShowAddAngle(true)} className="btn-gold text-sm px-4 py-2">
            + ਨਵਾਂ ਦ੍ਰਿਸ਼ਟੀਕੋਣ (+10 ✦)
          </button>
        </div>

        {/* Angles List */}
        {angles.length === 0 && !showAddAngle && (
          <div className="glass-card-static rounded-2xl p-12 text-center mb-6">
            <div className="text-4xl mb-3">🔭</div>
            <p className="text-white font-medium mb-1">ਅਜੇ ਕੋਈ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਨਹੀਂ</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ਪਹਿਲਾ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਜੋੜੋ ਅਤੇ 10 ਅੰਕ ਜਿੱਤੋ
            </p>
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
              currentUserId={profile.id}
              expanded={expandedAngles[angle.id]}
              onToggle={() => setExpandedAngles(p => ({ ...p, [angle.id]: !p[angle.id] }))}
              onAddShabad={() => { setShowAddShabad(angle.id); setShabadText(''); setShabadComment('') }}
            />
          ))}
        </div>

        {/* Scoring hint */}
        <div className="mt-8 p-4 rounded-xl text-center"
          style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.12)' }}>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            ✦ ਨਵਾਂ ਦ੍ਰਿਸ਼ਟੀਕੋਣ = 10 ਅੰਕ &nbsp;|&nbsp; ਸ਼ਬਦ ਜੋੜੋ = 5 ਅੰਕ
          </p>
        </div>
      </div>

      {/* Add Angle Modal */}
      {showAddAngle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddAngle(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold text-white mb-1">ਨਵਾਂ ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਜੋੜੋ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ਇਸ ਵਿਸ਼ੇ ਨੂੰ ਕਿਸੇ ਨਵੇਂ ਨਜ਼ਰੀਏ ਤੋਂ ਦੇਖੋ (+10 ✦)
            </p>
            <form onSubmit={addAngle} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਦਾ ਸਿਰਲੇਖ *</label>
                <input className="input-royal" placeholder="ਜਿਵੇਂ: ਭਗਤੀ ਦਾ ਪੱਖ" value={angleTitle} onChange={e => setAngleTitle(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>ਵਰਣਨ (ਵਿਕਲਪਿਕ)</label>
                <textarea className="textarea-royal" placeholder="ਦ੍ਰਿਸ਼ਟੀਕੋਣ ਬਾਰੇ ਸੰਖੇਪ ਜਾਣਕਾਰੀ..." value={angleDesc} onChange={e => setAngleDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddAngle(false)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-gold flex-1 py-3">{saving ? 'ਜੋੜ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ (+10 ✦)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Shabad Modal */}
      {showAddShabad && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddShabad(null)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold text-white mb-1">ਸ਼ਬਦ ਜੋੜੋ</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ਗੁਰਬਾਣੀ ਵਿੱਚੋਂ ਸ਼ਬਦ ਕਾਪੀ-ਪੇਸਟ ਕਰੋ (+5 ✦)
            </p>
            <form onSubmit={addShabad} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>ਸ਼ਬਦ (ਗੁਰਬਾਣੀ) *</label>
                <textarea
                  className="textarea-royal gurbani-text text-base"
                  placeholder="ਇੱਥੇ ਸ਼ਬਦ ਪੇਸਟ ਕਰੋ..."
                  value={shabadText}
                  onChange={e => setShabadText(e.target.value)}
                  rows={5}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>ਤੁਹਾਡੀ ਟਿੱਪਣੀ (ਵਿਕਲਪਿਕ)</label>
                <textarea
                  className="textarea-royal"
                  placeholder="ਇਹ ਸ਼ਬਦ ਇਸ ਵਿਸ਼ੇ ਨਾਲ ਕਿਵੇਂ ਸੰਬੰਧਿਤ ਹੈ..."
                  value={shabadComment}
                  onChange={e => setShabadComment(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddShabad(null)} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
                <button type="submit" disabled={saving} className="btn-royal flex-1 py-3">{saving ? 'ਜੋੜ ਰਿਹਾ ਹੈ...' : 'ਜੋੜੋ (+5 ✦)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AngleSection({ angle, angleIndex, shabads, authorMap, currentUserId, expanded, onToggle, onAddShabad }) {
  return (
    <div className="animate-fadeInUp" style={{ animationDelay: `${angleIndex * 0.06}s` }}>
      {/* Angle Header */}
      <div className="angle-header mb-2" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', color: '#e9d5ff' }}>
          {angleIndex + 1}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white gurbani-text">{angle.title}</h3>
          {angle.description && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{angle.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="badge-royal text-xs">{shabads.length} ਸ਼ਬਦ</span>
          <span className="text-white opacity-40 text-lg">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Shabads */}
      {expanded && (
        <div className="ml-4 pl-4 border-l space-y-3 pb-4"
          style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          {shabads.length === 0 && (
            <div className="py-4 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ਅਜੇ ਕੋਈ ਸ਼ਬਦ ਨਹੀਂ — ਪਹਿਲਾ ਸ਼ਬਦ ਜੋੜੋ
            </div>
          )}

          {shabads.map(shabad => (
            <div key={shabad.id} className="shabad-card">
              <p className="text-white gurbani-text text-base leading-relaxed mb-2 whitespace-pre-wrap">
                {shabad.shabad_text}
              </p>
              {shabad.comment && (
                <>
                  <div className="divider-royal my-2" />
                  <p className="text-sm italic" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    "{shabad.comment}"
                  </p>
                </>
              )}
              <div className="flex items-center justify-between mt-3 pt-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', color: '#e9d5ff' }}>
                    {(authorMap[shabad.created_by] || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {authorMap[shabad.created_by] || 'ਅਣਜਾਣ'}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {new Date(shabad.created_at).toLocaleDateString('pa-IN')}
                </span>
              </div>
            </div>
          ))}

          <button onClick={onAddShabad}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(124,58,237,0.08)',
              border: '1px dashed rgba(124,58,237,0.25)',
              color: 'rgba(167,139,250,0.8)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.15)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.08)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)' }}
          >
            + ਸ਼ਬਦ ਜੋੜੋ (+5 ✦)
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
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse3d"
          style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.1))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}
