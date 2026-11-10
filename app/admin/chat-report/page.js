'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'
import JSZip from 'jszip'
import {
  CATEGORIES,
  fmtDate,
  truncateName,
  parseWhatsAppChat,
  getReportWeekRange,
  getLatestReport,
  buildDailyRecords,
} from '../../../lib/jaapParser'

// Build full report array from raw messages
function buildReport(messages, memberNames = [], removedNames = new Set()) {
  // Use the latest message timestamp to anchor the week range (avoids system clock/year mismatch)
  let latestTs = null
  for (const msg of messages) {
    if (msg.timestamp && (!latestTs || msg.timestamp > latestTs)) latestTs = msg.timestamp
  }
  const { start, end } = getReportWeekRange(latestTs || new Date())

  // Collect ALL senders in order of first appearance, excluding removed members
  const allSenders = []
  const seenSenders = new Set()
  for (const msg of messages) {
    if (msg.sender !== 'You' && !seenSenders.has(msg.sender) && !removedNames.has(msg.sender)) {
      seenSenders.add(msg.sender)
      allSenders.push(msg.sender)
    }
  }
  // Add current members extracted from events who never sent a message
  for (const name of memberNames) {
    if (!seenSenders.has(name)) {
      seenSenders.add(name)
      allSenders.push(name)
    }
  }

  // Group last-week messages by sender (messages with no timestamp are always included)
  const weekMsgs = {}
  for (const msg of messages) {
    if (msg.sender === 'You') continue
    const inRange = !msg.timestamp || (msg.timestamp >= start && msg.timestamp <= end)
    if (inRange) {
      if (!weekMsgs[msg.sender]) weekMsgs[msg.sender] = []
      weekMsgs[msg.sender].push(msg.text)
    }
  }

  const users = allSenders.map(name => {
    const texts = weekMsgs[name] || []
    const values = getLatestReport(texts) || {}
    const hasReport = Object.keys(values).length > 0

    const catResults = {}
    for (const cat of CATEGORIES) {
      const value = values[cat.key] ?? null
      catResults[cat.key] = { value, target: cat.weeklyTarget, passed: value !== null && value >= cat.weeklyTarget }
    }

    let finalStatus = 'fail'
    let failReason = ''

    if (!hasReport) {
      failReason = 'ਕੋਈ ਰਿਪੋਰਟ ਸੁਨੇਹਾ ਨਹੀਂ ਮਿਲਿਆ'
    } else if (!catResults.gurmantar.passed) {
      failReason = 'ਗੁਰਮੰਤਰ ਟੀਚਾ ਪੂਰਾ ਨਹੀਂ ਹੋਇਆ'
    } else if (!catResults.sehajpath.passed) {
      failReason = 'ਸਹਿਜ ਪਾਠ ਟੀਚਾ ਪੂਰਾ ਨਹੀਂ ਹੋਇਆ'
    } else {
      const otherPassed = CATEGORIES.filter(c => c.key !== 'gurmantar' && c.key !== 'sehajpath' && catResults[c.key].passed)
      if (otherPassed.length >= 2) {
        finalStatus = 'pass'
      } else {
        failReason = `ਗੁਰਮੰਤਰ ਅਤੇ ਸਹਿਜ ਪਾਠ ਪਾਸ, ਪਰ ਸਿਰਫ਼ ${otherPassed.length} ਹੋਰ ਖੇਤਰ ਪਾਸ (੨ ਚਾਹੀਦੇ)`
      }
    }

    return { name, hasReport, values, catResults, finalStatus, failReason }
  })

  return { users, weekStart: start, weekEnd: end }
}


// ── Page component ────────────────────────────────────────────────────────────

export default function ChatReportPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [weekRange, setWeekRange] = useState(null)
  const [activeTab, setActiveTab] = useState('report')
  const [chatData, setChatData] = useState(null)        // { messages, removedNames } kept for DB import
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [mapping, setMapping] = useState(null)          // { unmappedNames, users } after import
  const fileRef = useRef(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'admin') { router.push('/topics'); return }
      setProfile(prof)
      setLoading(false)
    }
    init()
  }, [router])

  async function handleFile(file) {
    if (!file) return
    setProcessing(true)
    setError('')
    setReport(null)

    try {
      let chatText = ''

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file)
        const allFiles = Object.keys(zip.files).filter(
          f => !zip.files[f].dir && (f.endsWith('.txt') || f.endsWith('.md')) && !f.includes('__MACOSX')
        )
        if (!allFiles.length) throw new Error('Zip ਵਿੱਚ ਕੋਈ .txt / .md ਫ਼ਾਈਲ ਨਹੀਂ ਮਿਲੀ')
        // Prefer .txt files; within each type prefer files named "chat"
        const txtFiles = allFiles.filter(f => f.endsWith('.txt'))
        const candidates = txtFiles.length ? txtFiles : allFiles
        const chatFile = candidates.find(f => f.toLowerCase().includes('chat')) || candidates[0]
        chatText = await zip.files[chatFile].async('text')
      } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        chatText = await file.text()
      } else {
        throw new Error('ਕਿਰਪਾ ਕਰਕੇ WhatsApp ਦੀ .zip, .txt ਜਾਂ .md ਫ਼ਾਈਲ ਅੱਪਲੋਡ ਕਰੋ')
      }

      const { messages, memberNames, removedNames } = parseWhatsAppChat(chatText)
      if (!messages.length) throw new Error('ਕੋਈ ਸੁਨੇਹੇ ਨਹੀਂ ਮਿਲੇ। ਫ਼ਾਈਲ ਦਾ ਫ਼ਾਰਮੈਟ ਜਾਂਚੋ।')

      const { users, weekStart, weekEnd } = buildReport(messages, memberNames, removedNames)
      setReport(users)
      setChatData({ messages, removedNames })
      setSaveMsg('')
      setMapping(null)
      setWeekRange({ start: weekStart, end: weekEnd })
      setActiveTab('report')
    } catch (err) {
      setError(err.message || 'ਫ਼ਾਈਲ ਪੜ੍ਹਨ ਵਿੱਚ ਗਲਤੀ')
    }

    setProcessing(false)
  }

  // Build daily records from the whole chat and persist them, then surface any
  // WhatsApp names that still need mapping to an app user.
  async function handleSaveToDb() {
    if (!chatData) return
    setSaving(true)
    setSaveMsg('')
    try {
      const records = buildDailyRecords(chatData.messages, chatData.removedNames)
      if (!records.length) { setSaveMsg('ਕੋਈ ਰੋਜ਼ਾਨਾ ਰਿਕਾਰਡ ਨਹੀਂ ਮਿਲੇ'); setSaving(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/admin/jaap-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ records }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ਸੰਭਾਲਣ ਵਿੱਚ ਗਲਤੀ')

      const autoMsg = json.autoMappedCount ? ` · ${json.autoMappedCount} ਨਾਮ ਪਹਿਲਾਂ ਤੋਂ ਜੁੜੇ` : ''
      setSaveMsg(`✓ ${json.imported} ਰਿਕਾਰਡ ਸੰਭਾਲੇ ਗਏ${autoMsg}`)

      if (json.unmappedNames?.length) {
        const aliasRes = await fetch('/api/admin/jaap-aliases', { headers: { Authorization: `Bearer ${token}` } })
        const aliasJson = await aliasRes.json()
        setMapping({ unmappedNames: json.unmappedNames, users: aliasJson.users || [] })
      } else {
        setMapping(null)
      }
    } catch (err) {
      setSaveMsg('⚠️ ' + (err.message || 'ਗਲਤੀ'))
    }
    setSaving(false)
  }

  async function assignAlias(whatsapp_name, profile_id) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch('/api/admin/jaap-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ whatsapp_name, profile_id }),
    })
    setMapping(prev => prev ? { ...prev, unmappedNames: prev.unmappedNames.filter(n => n !== whatsapp_name) } : prev)
  }

  if (loading) return <LoadingScreen />

  const sortedReport = report
    ? [...report].sort((a, b) => {
        if (a.finalStatus !== b.finalStatus) return a.finalStatus === 'pass' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    : []

  const shortfallUsers = sortedReport.filter(u =>
    CATEGORIES.some(c => !u.catResults[c.key].passed)
  )
  const finalFails = sortedReport.filter(u => u.finalStatus === 'fail')

  const tabs = [
    { key: 'report', label: 'ਰਿਪੋਰਟ ਕਾਰਡ', count: sortedReport.length },
    { key: 'shortfall', label: 'ਕਮੀਆਂ', count: shortfallUsers.length },
    { key: 'finalfail', label: 'ਅੰਤਮ ਫ਼ੇਲ੍ਹ', count: finalFails.length },
    { key: 'leaderboard', label: '🏅 ਲੀਡਰਬੋਰਡ', count: null },
  ]

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 animate-fadeInUp">
          <button onClick={() => router.push('/admin')}
            className="text-sm mb-3 inline-flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: 'rgba(12,36,64,0.45)' }}>
            ← ਵਾਪਸ
          </button>
          <h1 className="text-2xl font-bold" style={{ color: '#0c2540' }}>💬 ਜਾਪ ਰਿਪੋਰਟ</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(12,36,64,0.45)' }}>WhatsApp ਚੈਟ ਤੋਂ ਹਫ਼ਤਾਵਾਰੀ ਟੀਚਾ ਰਿਪੋਰਟ</p>
        </div>

        {/* Upload area */}
        {!report && (
          <>
            <div
              className="glass-card-static rounded-2xl p-12 text-center cursor-pointer animate-fadeInUp"
              style={{ border: '2px dashed rgba(14,65,110,0.18)' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {processing ? (
                <>
                  <div className="text-5xl mb-4">⏳</div>
                  <p className="text-lg font-semibold" style={{ color: '#0c2540' }}>ਫ਼ਾਈਲ ਪੜ੍ਹੀ ਜਾ ਰਹੀ ਹੈ...</p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(12,36,64,0.4)' }}>ਕਿਰਪਾ ਉਡੀਕ ਕਰੋ</p>
                </>
              ) : (
                <>
                  <div className="text-5xl mb-4">📂</div>
                  <p className="text-lg font-semibold mb-1" style={{ color: '#0c2540' }}>WhatsApp ਚੈਟ ਫ਼ਾਈਲ ਅੱਪਲੋਡ ਕਰੋ</p>
                  <p className="text-sm mb-5" style={{ color: 'rgba(12,36,64,0.45)' }}>
                    .zip, .txt ਜਾਂ .md ਫ਼ਾਈਲ ਖਿੱਚ ਕੇ ਸੁੱਟੋ, ਜਾਂ ਕਲਿੱਕ ਕਰੋ
                  </p>
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
                    style={{ background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.15)', color: '#1a5f8f' }}>
                    ਫ਼ਾਈਲ ਚੁਣੋ
                  </span>
                  {error && (
                    <div className="mt-5 px-4 py-3 rounded-xl text-sm"
                      style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
                      ⚠️ {error}
                    </div>
                  )}
                </>
              )}
              <input ref={fileRef} type="file" accept=".zip,.txt,.md" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {/* Targets legend */}
            {!processing && (
              <div className="mt-4 glass-card-static rounded-2xl p-4 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(12,36,64,0.5)' }}>ਹਫ਼ਤਾਵਾਰੀ ਟੀਚੇ</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <span key={c.key} className="badge-royal" style={{ fontSize: '11px' }}>
                      {c.emoji} {c.label}: {c.weeklyTarget}
                    </span>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: 'rgba(12,36,64,0.38)' }}>
                  ਪਾਸ ਹੋਣ ਲਈ: ਗੁਰਮੰਤਰ + ਸਹਿਜ ਪਾਠ (ਦੋਵੇਂ ਲਾਜ਼ਮੀ) + ਘੱਟੋ-ਘੱਟ ੨ ਹੋਰ ਖੇਤਰ ਜ਼ਰੂਰੀ ਹਨ
                </p>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {report && (
          <div className="animate-fadeInUp">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                {sortedReport.length} ਭਾਗੀਦਾਰ · {sortedReport.filter(u => u.finalStatus === 'pass').length} ਪਾਸ · {finalFails.length} ਫ਼ੇਲ੍ਹ
              </p>
              <button
                onClick={() => { setReport(null); setWeekRange(null); setError('') }}
                className="text-sm px-3 py-1.5 rounded-lg transition-all"
                style={{ background: 'rgba(14,65,110,0.06)', border: '1px solid rgba(14,65,110,0.12)', color: '#1a5f8f' }}>
                ↑ ਨਵੀਂ ਫ਼ਾਈਲ
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(12,36,64,0.38)' }}>
              {weekRange ? `ਹਫ਼ਤਾ: ${fmtDate(weekRange.start)} – ${fmtDate(weekRange.end)}` : ''}
            </p>

            {/* Save to database — persists daily records for the ਜੀਵਨ analytics */}
            <div className="glass-card-static rounded-2xl p-4 mb-5" style={{ background: 'rgba(14,65,110,0.03)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0c2540' }}>📊 ਡਾਟਾਬੇਸ ਵਿੱਚ ਸੰਭਾਲੋ</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(12,36,64,0.45)' }}>
                    ਰੋਜ਼ਾਨਾ ਰਿਕਾਰਡ ਸੰਭਾਲੋ ਤਾਂ ਜੋ ਵਰਤੋਂਕਾਰ ਆਪਣਾ ਜੀਵਨ ਵਿਸ਼ਲੇਸ਼ਣ ਵੇਖ ਸਕਣ
                  </p>
                </div>
                <button onClick={handleSaveToDb} disabled={saving}
                  className="text-sm px-4 py-2 rounded-xl font-semibold transition-all"
                  style={{ background: 'rgba(14,65,110,0.1)', border: '1px solid rgba(14,65,110,0.22)', color: '#1a5f8f', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '⏳ ਸੰਭਾਲ ਰਿਹਾ ਹੈ...' : '💾 ਸੰਭਾਲੋ'}
                </button>
              </div>
              {saveMsg && (
                <p className="text-xs mt-3" style={{ color: saveMsg.startsWith('✓') ? '#15803d' : '#dc2626' }}>{saveMsg}</p>
              )}

              {/* Unmapped-name mapping panel */}
              {mapping && mapping.unmappedNames.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(14,65,110,0.1)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#0c2540' }}>
                    ਨਵੇਂ ਨਾਮ ਜੋੜੋ — {mapping.unmappedNames.length} ਨਾਮ ਕਿਸੇ ਵਰਤੋਂਕਾਰ ਨਾਲ ਨਹੀਂ ਜੁੜੇ
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'rgba(12,36,64,0.45)' }}>
                    ਇੱਕ ਵਾਰ ਜੋੜਨ ਤੋਂ ਬਾਅਦ ਅਗਲੀ ਵਾਰ ਆਪਣੇ-ਆਪ ਜੁੜ ਜਾਣਗੇ — ਸਿਰਫ਼ ਨਵੇਂ ਨਾਮ ਹੀ ਪੁੱਛੇ ਜਾਣਗੇ
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {mapping.unmappedNames.map(name => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-xs flex-1 truncate" style={{ color: '#0c2540' }}>{name}</span>
                        <select
                          defaultValue=""
                          onChange={e => e.target.value && assignAlias(name, e.target.value)}
                          className="text-xs px-2 py-1.5 rounded-lg"
                          style={{ background: 'white', border: '1px solid rgba(14,65,110,0.2)', color: '#0c2540', maxWidth: 200 }}>
                          <option value="">— ਵਰਤੋਂਕਾਰ ਚੁਣੋ —</option>
                          {mapping.users.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {mapping && mapping.unmappedNames.length === 0 && (
                <p className="text-xs mt-3" style={{ color: '#15803d' }}>✓ ਸਾਰੇ ਨਾਮ ਜੁੜੇ ਹੋਏ ਹਨ</p>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
                  style={{
                    background: activeTab === t.key ? 'rgba(14,65,110,0.1)' : 'rgba(255,255,255,0.65)',
                    border: `1px solid ${activeTab === t.key ? 'rgba(14,65,110,0.25)' : 'rgba(14,65,110,0.1)'}`,
                    color: activeTab === t.key ? '#0c2540' : 'rgba(12,36,64,0.5)',
                  }}>
                  {t.label}
                  <span className="px-1.5 py-0.5 rounded-full text-xs"
                    style={{
                      background: activeTab === t.key ? 'rgba(14,65,110,0.12)' : 'rgba(14,65,110,0.06)',
                      color: 'inherit',
                    }}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {activeTab === 'report' && <ReportCardTab report={sortedReport} />}
            {activeTab === 'shortfall' && <ShortfallTab users={shortfallUsers} />}
            {activeTab === 'finalfail' && <FinalFailTab users={finalFails} />}
            {activeTab === 'leaderboard' && <LeaderboardTab users={sortedReport} weekRange={weekRange} />}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Category themes ───────────────────────────────────────────────────────────

const CAT_THEME = {
  gurmantar:   { bg: '#b45309', light: '#fef9ec', border: '#d97706' },
  brahmkavach: { bg: '#1d4ed8', light: '#eff6ff', border: '#3b82f6' },
  birharhe:    { bg: '#be185d', light: '#fdf2f8', border: '#ec4899' },
  japji:       { bg: '#7c3aed', light: '#f5f3ff', border: '#8b5cf6' },
  sewa:        { bg: '#15803d', light: '#f0fdf4', border: '#22c55e' },
  sehajpath:   { bg: '#0e7490', light: '#ecfeff', border: '#06b6d4' },
}

// ── Tab 1: Report Card ────────────────────────────────────────────────────────

function ReportCardTab({ report }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ col: null, dir: 'desc' })

  if (!report.length) return <EmptyState emoji="📭" text="ਕੋਈ ਡੇਟਾ ਨਹੀਂ" />

  function toggleSort(col) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' }
    )
  }

  const filtered = filter === 'all' ? report
    : filter === 'pass' ? report.filter(u => u.finalStatus === 'pass')
    : report.filter(u => u.finalStatus === 'fail')

  const sorted = sort.col ? [...filtered].sort((a, b) => {
    if (sort.col === 'name') {
      const va = truncateName(a.name), vb = truncateName(b.name)
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    }
    const va = a.catResults[sort.col]?.value ?? -1
    const vb = b.catResults[sort.col]?.value ?? -1
    return sort.dir === 'asc' ? va - vb : vb - va
  }) : filtered

  const SortArrow = ({ col }) => (
    <span className="ml-0.5" style={{ opacity: sort.col === col ? 1 : 0.3, fontSize: '10px' }}>
      {sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: 'rgba(12,36,64,0.5)' }}>ਫਿਲਟਰ:</span>
        {[
          { key: 'all', label: `ਸਾਰੇ (${report.length})` },
          { key: 'pass', label: `✓ ਪਾਸ (${report.filter(u => u.finalStatus === 'pass').length})` },
          { key: 'fail', label: `✗ ਫ਼ੇਲ੍ਹ (${report.filter(u => u.finalStatus === 'fail').length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === key ? 'rgba(14,65,110,0.12)' : 'rgba(14,65,110,0.04)',
              border: `1px solid ${filter === key ? 'rgba(14,65,110,0.25)' : 'rgba(14,65,110,0.1)'}`,
              color: filter === key ? '#0c2540' : 'rgba(12,36,64,0.5)',
            }}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>ਕਾਲਮ ਹੈਡਰ ਦਬਾਓ ਕ੍ਰਮਬੱਧ ਕਰਨ ਲਈ</span>
      </div>

      <div className="glass-card-static rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(14,65,110,0.1)', background: 'rgba(14,65,110,0.04)' }}>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('name')}>
                  ਨਾਮ <SortArrow col="name" />
                </th>
                {CATEGORIES.map(c => (
                  <th key={c.key} className="text-center px-3 py-3 font-semibold cursor-pointer select-none" style={{ color: '#0c2540', minWidth: 80 }}
                    onClick={() => toggleSort(c.key)}>
                    <span style={{ whiteSpace: 'nowrap' }}>{c.emoji} {c.label} <SortArrow col={c.key} /></span>
                    <div className="text-xs font-normal mt-0.5" style={{ color: 'rgba(12,36,64,0.4)' }}>ਟੀਚਾ: {c.weeklyTarget}</div>
                  </th>
                ))}
                <th className="text-center px-4 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਤੀਜਾ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user, i) => (
                <tr key={user.name}
                  style={{
                    borderBottom: '1px solid rgba(14,65,110,0.06)',
                    background: user.finalStatus === 'pass'
                      ? (i % 2 === 0 ? 'rgba(34,197,94,0.02)' : 'rgba(34,197,94,0.04)')
                      : (i % 2 === 0 ? 'transparent' : 'rgba(14,65,110,0.015)'),
                  }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                    {truncateName(user.name)}
                    {!user.hasReport && (
                      <span className="ml-1.5 text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>(ਕੋਈ ਸੁਨੇਹਾ ਨਹੀਂ)</span>
                    )}
                  </td>
                  {CATEGORIES.map(c => {
                    const res = user.catResults[c.key]
                    return (
                      <td key={c.key} className="px-3 py-3 text-center">
                        {res.value !== null ? (
                          <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold" style={{
                            background: res.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: res.passed ? '#15803d' : '#dc2626',
                            border: `1px solid ${res.passed ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
                          }}>
                            {res.value}
                          </span>
                        ) : (
                          <span style={{ color: 'rgba(12,36,64,0.2)', fontSize: '18px' }}>—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-center">
                    {user.finalStatus === 'pass' ? (
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.25)' }}>
                        ✓ ਪਾਸ
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>
                        ✗ ਫ਼ੇਲ੍ਹ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab 2: Shortfall ──────────────────────────────────────────────────────────

function ShortfallTab({ users }) {
  const failedUsers = users.filter(u => CATEGORIES.some(cat => !u.catResults[cat.key].passed))

  if (!failedUsers.length) return <EmptyState emoji="🎉" text="ਸਾਰੇ ਟੀਚੇ ਪੂਰੇ ਹੋਏ!" />

  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(14,65,110,0.1)', background: 'rgba(14,65,110,0.04)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਾਮ</th>
              {CATEGORIES.map(cat => (
                <th key={cat.key} className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                  {cat.emoji} {cat.label}
                  <div style={{ color: 'rgba(12,36,64,0.4)', fontSize: '10px', fontWeight: 400 }}>ਟੀਚਾ: {cat.weeklyTarget}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {failedUsers.map((user, i) => (
              <tr key={user.name}
                style={{ borderBottom: '1px solid rgba(14,65,110,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(14,65,110,0.015)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>{truncateName(user.name)}</td>
                {CATEGORIES.map(cat => {
                  const res = user.catResults[cat.key]
                  if (res.passed) {
                    return (
                      <td key={cat.key} className="px-3 py-3 text-center" style={{ color: '#16a34a', fontSize: '16px' }}>✓</td>
                    )
                  }
                  const shortfall = res.value !== null ? res.target - res.value : null
                  return (
                    <td key={cat.key} className="px-3 py-3 text-center">
                      <div className="font-semibold" style={{ color: '#dc2626' }}>
                        {res.value !== null ? res.value : '—'}
                      </div>
                      {shortfall !== null && (
                        <div style={{ color: '#dc2626', fontSize: '11px', opacity: 0.75 }}>−{shortfall}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab 3: Final Fail ─────────────────────────────────────────────────────────

function FinalFailTab({ users }) {
  if (!users.length) return <EmptyState emoji="🏆" text="ਕੋਈ ਅੰਤਮ ਫ਼ੇਲ੍ਹ ਨਹੀਂ!" />

  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="p-4 border-b" style={{ borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
        <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>
          {users.length} ਵਰਤੋਂਕਾਰ ਅੰਤਮ ਫ਼ੇਲ੍ਹ
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(12,36,64,0.4)' }}>
          ਪਾਸ ਹੋਣ ਲਈ: ਗੁਰਮੰਤਰ + ਸਹਿਜ ਪਾਠ (ਦੋਵੇਂ ਲਾਜ਼ਮੀ) + ੨ ਹੋਰ ਖੇਤਰ ਜ਼ਰੂਰੀ ਹਨ
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(14,65,110,0.08)', background: 'rgba(14,65,110,0.02)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: '#0c2540' }}>ਨਾਮ</th>
              <th className="text-left px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਫ਼ੇਲ੍ਹ ਦਾ ਕਾਰਨ</th>
              <th className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਪਾਸ ਖੇਤਰ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => {
              const passedCats = CATEGORIES.filter(c => user.catResults[c.key].passed)
              return (
                <tr key={user.name}
                  style={{ borderBottom: '1px solid rgba(14,65,110,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(239,68,68,0.015)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                    <span className="mr-1.5">❌</span>{truncateName(user.name)}
                  </td>
                  <td className="px-3 py-3" style={{ color: '#dc2626' }}>{user.failReason}</td>
                  <td className="px-3 py-3 text-center">
                    {passedCats.length ? (
                      <span className="text-sm">{passedCats.map(c => c.emoji).join(' ')}</span>
                    ) : (
                      <span style={{ color: 'rgba(12,36,64,0.25)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab 4: Leaderboard ────────────────────────────────────────────────────────

function LeaderboardTab({ users, weekRange }) {
  const [downloading, setDownloading] = useState(false)

  const rankings = CATEGORIES.map(cat => ({
    cat,
    ranked: [...users]
      .filter(u => u.catResults[cat.key].value !== null)
      .sort((a, b) => (b.catResults[cat.key].value ?? 0) - (a.catResults[cat.key].value ?? 0)),
  }))

  async function handleDownload() {
    setDownloading(true)
    try { await downloadLeaderboardImage(rankings, weekRange) }
    finally { setDownloading(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>ਹਰ ਖੇਤਰ ਵਿੱਚ ਰੈਂਕਿੰਗ</p>
        <button onClick={handleDownload} disabled={downloading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(14,65,110,0.08)', border: '1px solid rgba(14,65,110,0.18)', color: '#1a5f8f', opacity: downloading ? 0.6 : 1 }}>
          {downloading ? '⏳ ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ...' : '📥 ਚਿੱਤਰ ਡਾਊਨਲੋਡ'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rankings.map(({ cat, ranked }) => {
          const theme = CAT_THEME[cat.key]
          return (
            <div key={cat.key} className="rounded-2xl overflow-hidden"
              style={{ border: `1.5px solid ${theme.border}55`, boxShadow: `0 2px 12px ${theme.bg}18` }}>
              {/* Header */}
              <div className="px-4 py-3 text-white" style={{ background: theme.bg }}>
                <div className="font-bold text-base">{cat.emoji} {cat.label}</div>
                <div className="text-xs mt-0.5" style={{ opacity: 0.85 }}>ਹਫ਼ਤਾਵਾਰੀ ਟੀਚਾ: {cat.weeklyTarget}</div>
              </div>
              {/* Column headers */}
              <div className="grid text-xs font-semibold px-3 py-2"
                style={{ gridTemplateColumns: '36px 1fr 68px 46px', background: theme.light, color: '#374151', borderBottom: `1px solid ${theme.border}33` }}>
                <span className="text-center">ਰੈਂਕ</span>
                <span>ਨਾਮ</span>
                <span className="text-right">ਗਿਣਤੀ</span>
                <span className="text-right">%</span>
              </div>
              {/* Rows */}
              {ranked.map((user, i) => {
                const val = user.catResults[cat.key].value
                const pct = Math.round((val / cat.weeklyTarget) * 100)
                const rank = ranked.slice(0, i).filter(u => u.catResults[cat.key].value > val).length + 1
                const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }
                const rowBg = rank === 1 ? '#fffbeb' : rank === 2 ? '#f8fafc' : rank === 3 ? '#fff8f1'
                  : i % 2 === 0 ? 'white' : theme.light + '88'
                return (
                  <div key={user.name} className="grid items-center px-3 py-1.5"
                    style={{ gridTemplateColumns: '36px 1fr 68px 46px', borderBottom: '1px solid rgba(14,65,110,0.05)', background: rowBg }}>
                    <span className="text-center" style={{ fontSize: rank <= 3 ? '16px' : '11px', fontWeight: rank > 3 ? 700 : 'normal', color: rank > 3 ? 'rgba(12,36,64,0.4)' : undefined }}>
                      {MEDALS[rank] || rank}
                    </span>
                    <span className="font-medium truncate" style={{ color: '#1f2937', fontSize: '12px' }}>{truncateName(user.name)}</span>
                    <span className="text-right font-semibold text-xs" style={{ color: '#1f2937' }}>{val.toLocaleString()}</span>
                    <span className="text-right text-xs font-semibold" style={{ color: pct >= 100 ? '#15803d' : '#dc2626' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

async function downloadLeaderboardImage(rankings, weekRange) {
  await document.fonts.ready
  await document.fonts.load('bold 20px "Noto Sans Gurmukhi"').catch(() => {})

  const W = 1440
  const SIDE_W = 120           // side flower strip width
  const PAD = SIDE_W + 14      // content starts just inside side strips
  const BOT_H = 140            // bottom flower strip height
  const GAP = 16
  const HDR_H = 160
  const ROW_H = 44
  const PANEL_HDR = 72
  const COL_HDR = 36
  const BOTTOM_PAD = BOT_H + 18

  const rows1 = Math.max(...rankings.slice(0, 3).map(r => r.ranked.length))
  const rows2 = Math.max(...rankings.slice(3).map(r => r.ranked.length))
  const ph1 = PANEL_HDR + COL_HDR + rows1 * ROW_H + 6
  const ph2 = PANEL_HDR + COL_HDR + rows2 * ROW_H + 6
  const CANVAS_H = HDR_H + ph1 + GAP + ph2 + BOTTOM_PAD

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#fdf6e3'
  ctx.fillRect(0, 0, W, CANVAS_H)

  const gf = (sz, bold) => `${bold ? 'bold ' : ''}${sz}px "Noto Sans Gurmukhi","Gurmukhi MN",sans-serif`

  // ── image loader ──────────────────────────────────────────
  function loadImg(src) {
    return new Promise(res => {
      const img = new Image()
      img.onload = () => res(img); img.onerror = () => res(null); img.src = src
    })
  }
  const [imgMeadow, imgGarland] = await Promise.all([
    loadImg('/borders/flower-meadow.png'),
    loadImg('/borders/flower-garland.png'),
  ])

  // ── flower borders — multiply blend removes white bg ──────
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'

  // Bottom: meadow tiled end-to-end at natural aspect ratio
  if (imgMeadow) {
    const mTileW = BOT_H * (imgMeadow.naturalWidth / imgMeadow.naturalHeight)
    const botY = CANVAS_H - BOT_H
    ctx.save()
    ctx.beginPath(); ctx.rect(0, botY, W, BOT_H); ctx.clip()
    for (let x = 0; x < W; x += mTileW)
      ctx.drawImage(imgMeadow, x, botY, mTileW, BOT_H)
    ctx.restore()
  }

  // Sides: garland rotated 90°, tiled end-to-end vertically
  if (imgGarland) {
    const gTileH = SIDE_W * (imgGarland.naturalWidth / imgGarland.naturalHeight)

    // Left strip — garland rotated 90° CW
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, SIDE_W, CANVAS_H); ctx.clip()
    for (let y = 0; y < CANVAS_H; y += gTileH) {
      ctx.save()
      ctx.translate(SIDE_W, y)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(imgGarland, 0, 0, gTileH, SIDE_W)
      ctx.restore()
    }
    ctx.restore()

    // Right strip — same but mirrored horizontally
    ctx.save()
    ctx.beginPath(); ctx.rect(W - SIDE_W, 0, SIDE_W, CANVAS_H); ctx.clip()
    for (let y = 0; y < CANVAS_H; y += gTileH) {
      ctx.save()
      ctx.translate(W, y); ctx.scale(-1, 1)
      ctx.translate(SIDE_W, 0); ctx.rotate(Math.PI / 2)
      ctx.drawImage(imgGarland, 0, 0, gTileH, SIDE_W)
      ctx.restore()
    }
    ctx.restore()
  }

  ctx.restore()

  // ── canvas flower helpers ─────────────────────────────────
  function drawPetal(cx, cy, angle, len, wid) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
    ctx.beginPath(); ctx.moveTo(0, 0)
    ctx.bezierCurveTo(wid * 0.5, -len * 0.18, wid * 0.55, -len * 0.82, 0, -len)
    ctx.bezierCurveTo(-wid * 0.55, -len * 0.82, -wid * 0.5, -len * 0.18, 0, 0)
    ctx.fill(); ctx.restore()
  }
  function drawFlower(cx, cy, nPetals, len, wid, color, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color
    for (let p = 0; p < nPetals; p++)
      drawPetal(cx, cy, (p / nPetals) * Math.PI * 2, len, wid)
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, len * 0.14), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // ── gold border frame ─────────────────────────────────────
  ctx.strokeStyle = '#d4a84c'; ctx.lineWidth = 2.5
  ctx.strokeRect(8, 8, W - 16, CANVAS_H - 16)
  ctx.strokeStyle = 'rgba(212,168,76,0.4)'; ctx.lineWidth = 1
  ctx.strokeRect(17, 17, W - 34, CANVAS_H - 34)

  // ── title text ────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.fillStyle = '#1a1a5e'
  ctx.font = gf(50, true)
  ctx.fillText('ਸਪਤਾਹਿਕ ਲੀਡਰਬੋਰਡ', W / 2, 68)
  ctx.font = gf(21)
  ctx.fillStyle = '#7c5a28'
  ctx.fillText('ਗੁਰਮਤਿ ਦੀ ਰਾਹ ਤੇ – ਸੰਗਤ ਨਾਲ, ਸਦਾ ਅੱਗੇ', W / 2, 102)
  if (weekRange) {
    ctx.font = gf(15)
    ctx.fillStyle = '#a08050'
    ctx.fillText(`ਹਫ਼ਤਾ: ${fmtDate(weekRange.start)} – ${fmtDate(weekRange.end)}`, W / 2, 128)
  }

  // ── decorative divider below title area ───────────────────
  const divY = HDR_H - 8
  ctx.strokeStyle = 'rgba(201,168,76,0.38)'; ctx.lineWidth = 1
  ctx.setLineDash([3, 8])
  ctx.beginPath(); ctx.moveTo(PAD + 40, divY); ctx.lineTo(W/2 - 55, divY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(W/2 + 55, divY); ctx.lineTo(W - PAD - 40, divY); ctx.stroke()
  ctx.setLineDash([])
  drawFlower(W/2,      divY, 8, 16, 5,   '#b8860b', 0.9)
  drawFlower(W/2 - 55, divY, 6,  8, 2.8, '#c9a84c', 0.72)
  drawFlower(W/2 + 55, divY, 6,  8, 2.8, '#c9a84c', 0.72)

  const THEME = {
    gurmantar:   { bg: '#c8711e', light: '#fff5e8', bdr: 'rgba(200,113,30,0.3)' },
    brahmkavach: { bg: '#4068d4', light: '#eff6ff', bdr: 'rgba(64,104,212,0.3)' },
    birharhe:    { bg: '#cc3d7a', light: '#fdf2f8', bdr: 'rgba(204,61,122,0.3)' },
    japji:       { bg: '#9255e5', light: '#f5f3ff', bdr: 'rgba(146,85,229,0.3)' },
    sewa:        { bg: '#28a055', light: '#f0fdf4', bdr: 'rgba(40,160,85,0.3)' },
    sehajpath:   { bg: '#0e8aa0', light: '#ecfeff', bdr: 'rgba(14,138,160,0.3)' },
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
  }

  rankings.forEach(({ cat, ranked }, ci) => {
    const row = Math.floor(ci / 3)
    const col = ci % 3
    const ph = row === 0 ? ph1 : ph2
    const pw = (W - PAD * 2 - GAP * 2) / 3
    const px = PAD + col * (pw + GAP)
    const py = HDR_H + row * (ph1 + GAP)
    const th = THEME[cat.key]

    // Panel bg + border
    ctx.fillStyle = '#ffffff'; rr(px, py, pw, ph, 12); ctx.fill()
    ctx.strokeStyle = th.bdr; ctx.lineWidth = 1.5; rr(px, py, pw, ph, 12); ctx.stroke()

    // Colored header (clipped)
    ctx.save(); rr(px, py, pw, ph, 12); ctx.clip()
    ctx.fillStyle = th.bg; ctx.fillRect(px, py, pw, PANEL_HDR)
    ctx.restore()

    // Header text — emoji + label separately for font fallback
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 20px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",serif`
    ctx.fillText(cat.emoji, px + pw / 2 - 56, py + 33)
    ctx.font = gf(20, true)
    ctx.fillText(cat.label, px + pw / 2 + 14, py + 33)
    ctx.font = gf(13)
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.fillText(`ਹਫ਼ਤਾਵਾਰੀ ਟੀਚਾ: ${cat.weeklyTarget}`, px + pw / 2, py + 57)

    // Column header row
    const chy = py + PANEL_HDR
    ctx.fillStyle = th.light; ctx.fillRect(px, chy, pw, COL_HDR)
    ctx.strokeStyle = th.bdr; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(px, chy + COL_HDR); ctx.lineTo(px + pw, chy + COL_HDR); ctx.stroke()
    ctx.fillStyle = '#374151'; ctx.font = gf(13, true)
    ctx.textAlign = 'center'; ctx.fillText('ਰੈਂਕ', px + 26, chy + 24)
    ctx.textAlign = 'left'; ctx.fillText('ਨਾਮ', px + 56, chy + 24)
    ctx.textAlign = 'right'
    ctx.fillText('ਹਫ਼ਤਾਵਾਰੀ ਗਿਣਤੀ', px + pw - 58, chy + 24)
    ctx.fillText('ਪ੍ਰਤੀਸ਼ਤ', px + pw - 6, chy + 24)

    // User rows
    const ty0 = chy + COL_HDR
    ranked.forEach((user, i) => {
      const val = user.catResults[cat.key].value
      const rank = ranked.slice(0, i).filter(u => u.catResults[cat.key].value > val).length + 1
      // Medal (and name anonymization) only for top-3 who actually passed the target
      const medaled = rank <= 3 && user.catResults[cat.key].passed
      const MEDALS_MAP = { 1: '🥇', 2: '🥈', 3: '🥉' }
      const medalBg = { 1: '#fffbeb', 2: '#f8fafc', 3: '#fff8f1' }
      const ry = ty0 + i * ROW_H
      ctx.fillStyle = medaled ? (medalBg[rank] || '#ffffff') : (i % 2 === 0 ? '#ffffff' : th.light)
      ctx.globalAlpha = medaled ? 1 : (i % 2 === 0 ? 1 : 0.55)
      ctx.fillRect(px, ry, pw, ROW_H)
      ctx.globalAlpha = 1

      ctx.strokeStyle = 'rgba(14,65,110,0.07)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px, ry + ROW_H); ctx.lineTo(px + pw, ry + ROW_H); ctx.stroke()

      const ty = ry + ROW_H * 0.67

      // Rank / medal
      if (medaled) {
        ctx.font = `24px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",serif`
        ctx.textAlign = 'center'
        ctx.fillText(MEDALS_MAP[rank], px + 26, ty + 4)
      } else {
        ctx.fillStyle = '#6b7280'; ctx.font = gf(15, true)
        ctx.textAlign = 'center'; ctx.fillText(String(rank), px + 26, ty)
      }

      // Name (clipped to available width) — medaled top-3 names anonymized to "ਕਿਰਪਾ"
      const nmW = pw - 150
      const displayName = medaled ? 'ਕਿਰਪਾ' : truncateName(user.name)
      ctx.save()
      ctx.beginPath(); ctx.rect(px + 48, ry + 1, nmW, ROW_H - 2); ctx.clip()
      ctx.fillStyle = '#111827'; ctx.font = gf(19)
      ctx.textAlign = 'left'; ctx.fillText(displayName, px + 50, ty)
      ctx.restore()

      // Value
      ctx.fillStyle = '#1f2937'; ctx.font = gf(17, true)
      ctx.textAlign = 'right'; ctx.fillText(val.toLocaleString(), px + pw - 58, ty)

      // Percentage
      const pct = Math.round((val / cat.weeklyTarget) * 100)
      ctx.fillStyle = pct >= 100 ? '#15803d' : '#dc2626'
      ctx.font = gf(17); ctx.fillText(`${pct}%`, px + pw - 6, ty)
    })
  })

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leaderboard-${weekRange ? fmtDate(weekRange.start).replace(/ /g, '-') : 'report'}.png`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }, 'image/png')
}

// ── Shared ────────────────────────────────────────────────────────────────────

function EmptyState({ emoji, text }) {
  return (
    <div className="glass-card-static rounded-2xl p-12 text-center">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="font-medium" style={{ color: '#0c2540' }}>{text}</p>
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
