'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'
import JSZip from 'jszip'
import {
  CATEGORIES,
  BOOL_FIELDS,
  fmtDate,
  truncateName,
  parseWhatsAppChat,
  getReportWeekRange,
  buildDailyRecords,
  extractWeeklyTotals,
} from '../../../lib/jaapParser'

// Pass rules (admin, 15 Nov 2026): 7h gurmantar tikaa + 28h turde, 15h gurbani,
// 2h vichar, 7 min sehajpath, 2 days sewa, and ≥1 day each of the three
// disciplines. Computed from a totals object (see extractWeeklyTotals).
const PASS_REQUIRED = [
  { key: 'gurmantar_tikaa', target: 7 },
  { key: 'gurmantar_turde', target: 28 },
  { key: 'gurbani', target: 15 },
  { key: 'vichar', target: 2 },
  { key: 'sehajpath', target: 7 },
  { key: 'sewa', target: 2 },
]

function weeklyPass(totals, boolDays) {
  const checks = PASS_REQUIRED.map(r => ({
    key: r.key,
    target: r.target,
    value: totals[r.key] || 0,
    passed: (totals[r.key] || 0) >= r.target - 1e-9,
  }))
  const disciplinePass = (boolDays.eye_bibek >= 1) && (boolDays.no_faults >= 1) && (boolDays.no_complaint >= 1)
  return { checks, disciplinePass, passed: checks.every(c => c.passed) && disciplinePass }
}

// Build per-user weekly summary from the imported records (for the report-card
// table + the downloadable image). Groups by whatsapp_name.
//
// Note: the caller already filtered the MESSAGES to the Sunday→Sunday grace
// window before parsing (see handleFile → inWindowMsgs), so every record we
// receive here is in-week. We don't re-filter by report_date here because
// Day‑7 messages posted on Sunday morning get a report_date of that Sunday
// (outside the Sun→Sat week dates) even though they belong to the week being
// graded — filtering by date would wrongly drop them.
function buildReportCard(records, memberNames = [], removedNames = new Set(), weekStart, weekEnd) {
  const byName = new Map()        // name → rows[]
  for (const r of records) {
    if (!byName.has(r.whatsapp_name)) byName.set(r.whatsapp_name, [])
    byName.get(r.whatsapp_name).push(r)
  }
  // Also include people who never posted (so the admin sees who's missing).
  for (const name of memberNames) {
    if (removedNames.has(name)) continue
    if (!byName.has(name)) byName.set(name, [])
  }

  const users = []
  for (const [name, rows] of byName) {
    if (removedNames.has(name)) continue
    // Weekly totals come from the max "/WEEK" (cumulative) field across this
    // sender's messages (handles both the admin's running-total model and the
    // occasional zero-reset mistake). Hour categories are sanity-capped so
    // "30/30" (meaning 30 min) doesn't inflate to 30 hours. See
    // extractWeeklyTotals in lib/jaapParser.js.
    const { totals } = extractWeeklyTotals(rows)

    // Discipline day-counts are always the direct sum (no "/WEEK" equivalent).
    const boolDays = { eye_bibek: 0, no_faults: 0, no_complaint: 0 }
    for (const r of rows) {
      for (const k of Object.keys(boolDays)) if (r[k] === true) boolDays[k]++
    }
    const pass = weeklyPass(totals, boolDays)

    // All per-day averages divide by 7 for consistency. The parser already
    // handled ਨੀਂਦ specially (totals.neend = avgNightPosted * 7) so dividing by
    // 7 here yields the average nightly sleep across posted days.
    const daysReported = rows.length
    const avg = {
      gurmantar: ((totals.gurmantar_tikaa || 0) + (totals.gurmantar_turde || 0)) / 7,
      gurmantar_tikaa: (totals.gurmantar_tikaa || 0) / 7,
      gurmantar_turde: (totals.gurmantar_turde || 0) / 7,
      gurbani: (totals.gurbani || 0) / 7,
      vichar: (totals.vichar || 0) / 7,
      neend: (totals.neend || 0) / 7,
    }
    // Time given to Maharaj per day = sum of the hour categories / 7 days.
    const avgHoursPerDay =
      ((totals.gurmantar_tikaa || 0) + (totals.gurmantar_turde || 0) +
       (totals.gurbani || 0) + (totals.vichar || 0)) / 7
    const pctOfDay = (avgHoursPerDay / 24) * 100
    const weekly = { totals, boolDays, ...pass }
    users.push({
      name, rows, weekly,
      avg,
      avgHoursPerDay,
      pctOfDay,
      daysReported,
      hasReport: rows.length > 0,
    })
  }
  // Admin wants image sorted by name.
  users.sort((a, b) => truncateName(a.name).localeCompare(truncateName(b.name)))
  return users
}

function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  const [mapping, setMapping] = useState(null)
  // Set of whatsapp_names the admin has unchecked — they'll be omitted from
  // the downloadable PNG (but still shown in the on-page table, dimmed, so
  // the admin can still see their stats).
  const [excluded, setExcluded] = useState(() => new Set())
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

      // Anchor the reporting week to the latest message. The "week" is a
      // Mon-Sun calendar slice with a GRACE DEADLINE at the following Sunday
      // 6 PM — messages posted up to that moment count for the week that just
      // ended; anything later is a message for the NEW week, so we'd shift
      // the window forward. getReportWeekRange() already encodes this (end =
      // next Sunday 18:00), so we just pick the window whose grace end is the
      // first one that comes AT or AFTER the latest message.
      let latestTs = null
      for (const msg of messages) {
        if (msg.timestamp && (!latestTs || msg.timestamp > latestTs)) latestTs = msg.timestamp
      }
      const refDate = latestTs || new Date()
      const { start, end: graceEnd } = getReportWeekRange(refDate)
      const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 6)

      // Only consider messages whose timestamp is at or before the Sunday 6 PM
      // grace cutoff. Messages after that moment belong to a later week and
      // should not inflate this week's totals. Also exclude anything posted
      // BEFORE this week started (previous weeks' messages).
      const inWindowMsgs = messages.filter(m => {
        if (!m.timestamp) return true     // no timestamp → keep (catch-all for weird formats)
        return m.timestamp >= start && m.timestamp <= graceEnd
      })

      // Build per-day records (new hour-based format, Nov 15+ only).
      const records = buildDailyRecords(inWindowMsgs, removedNames)

      const users = buildReportCard(records, memberNames, removedNames, start, weekEnd)

      setReport(users)
      setChatData({ messages, removedNames, records })
      setSaveMsg('')
      setMapping(null)
      setExcluded(new Set())    // fresh upload → everyone included again
      setWeekRange({ start, end: weekEnd })
      setActiveTab('report')
    } catch (err) {
      setError(err.message || 'ਫ਼ਾਈਲ ਪੜ੍ਹਨ ਵਿੱਚ ਗਲਤੀ')
    }

    setProcessing(false)
  }

  async function handleSaveToDb() {
    if (!chatData) return
    setSaving(true)
    setSaveMsg('')
    try {
      const records = chatData.records
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
    ? [...report].sort((a, b) => truncateName(a.name).localeCompare(truncateName(b.name)))
    : []
  const finalFails = sortedReport.filter(u => !u.weekly.passed)
  const finalPasses = sortedReport.filter(u => u.weekly.passed)

  const tabs = [
    { key: 'report', label: 'ਰਿਪੋਰਟ ਕਾਰਡ', count: sortedReport.length },
    { key: 'finalfail', label: 'ਫ਼ੇਲ੍ਹ', count: finalFails.length },
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
          <p className="text-sm mt-0.5" style={{ color: 'rgba(12,36,64,0.45)' }}>
            WhatsApp ਚੈਟ ਤੋਂ ਹਫ਼ਤਾਵਾਰੀ ਰਿਪੋਰਟ (ਘੰਟੇ-ਆਧਾਰਿਤ ਨਵਾਂ ਫ਼ਾਰਮੈਟ)
          </p>
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

            {/* Rules legend */}
            {!processing && (
              <div className="mt-4 glass-card-static rounded-2xl p-4 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(12,36,64,0.5)' }}>ਪਾਸ ਹੋਣ ਲਈ (ਹਫਤੇ ਦਾ ਜੋੜ)</p>
                <ul className="text-xs space-y-1" style={{ color: 'rgba(12,36,64,0.65)' }}>
                  <li>੧. ਗੁਰਮੰਤ੍ਰ ੭ ਘੰਟੇ ਟਿਕਾ ਵਾਲਾ, ੨੮ ਘੰਟੇ ਤੁਰਦੇ ਫਿਰਦੇ (ਕੁਲ ੩੫ ਘੰਟੇ)</li>
                  <li>੨. ਗੁਰਬਾਣੀ ੧੫ ਘੰਟੇ</li>
                  <li>੩. ਵਿਚਾਰ ੨ ਘੰਟੇ</li>
                  <li>੪. ਸਹਿਜ ਪਾਠ ੭ ਮਿੰਟ</li>
                  <li>੫. ਹੱਥੀ ਸੇਵਾ ੨ ਦਿਨ</li>
                  <li>੬. ਘੱਟੋ ਘੱਟ ੧ ਦਿਨ ਅੱਖਾਂ ਦਾ ਬਿਬੇਕ + ਅਵਗੁਣ + ਸ਼ਿਕਾਇਤ</li>
                </ul>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {report && (
          <div className="animate-fadeInUp">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                {sortedReport.length} ਭਾਗੀਦਾਰ · {finalPasses.length} ਪਾਸ · {finalFails.length} ਫ਼ੇਲ੍ਹ
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

            {/* Save to database */}
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

              {mapping && mapping.unmappedNames.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(14,65,110,0.1)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#0c2540' }}>
                    ਨਵੇਂ ਨਾਮ ਜੋੜੋ — {mapping.unmappedNames.length} ਨਾਮ ਕਿਸੇ ਵਰਤੋਂਕਾਰ ਨਾਲ ਨਹੀਂ ਜੁੜੇ
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
              <div className="ml-auto flex items-center">
                <DownloadImageButton
                  users={sortedReport.filter(u => !excluded.has(u.name))}
                  weekRange={weekRange}
                  excludedCount={excluded.size}
                />
              </div>
            </div>

            {activeTab === 'report' && (
              <ReportCardTab
                users={sortedReport}
                excluded={excluded}
                onToggleExclude={name => setExcluded(prev => {
                  const next = new Set(prev)
                  if (next.has(name)) next.delete(name); else next.add(name)
                  return next
                })}
              />
            )}
            {activeTab === 'finalfail' && <FinalFailTab users={finalFails} />}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Report card (tabular) ────────────────────────────────────────────────

// Format a number of hours as "H:MM" (admin preference: "੨:੩੦" not "2.5").
// "5:30" means 5 hours 30 minutes. Returns "—" for null/invalid.
function fmtHoursHM(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const total = Math.round(v * 60)                   // round to the nearest minute
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Colour-code the "ਮਹਾਰਾਜ ਨੂੰ ਦਿੱਤੇ ਦਿਨ ਦਾ %" on an 8-step gradient. The
// admin's weekly pass boundary is 33 % (35 h / week target), so EVERY
// bucket under 33 % stays in a red tone — deeper red for lower numbers.
// Above 33 % moves through yellow → lime → light-green → green → dark-green.
//   < 10 %   — deep red
//   10–20 %  — red
//   20–33 %  — salmon / light red
//   33–50 %  — amber
//   50–70 %  — yellow
//   70–85 %  — light green (lime)
//   85–100 % — green
//   ≥ 100 %  — dark green
// Each returned colour includes `bg` (pill), `fg` (text), `border`, and
// `rowTint` (very-light background used to colour the full row).
// Used by both the HTML table (inline style) and the downloadable image.
function pctColor(pct) {
  if (pct < 10)  return { bg: '#fecaca', fg: '#7f1d1d', border: 'rgba(220,38,38,0.5)',  rowTint: 'rgba(220,38,38,0.09)'  }
  if (pct < 20)  return { bg: '#fecdd3', fg: '#9f1239', border: 'rgba(244,63,94,0.4)',  rowTint: 'rgba(244,63,94,0.07)'  }
  if (pct < 33)  return { bg: '#fee2e2', fg: '#b91c1c', border: 'rgba(239,68,68,0.35)', rowTint: 'rgba(239,68,68,0.05)'  }
  if (pct < 50)  return { bg: '#fed7aa', fg: '#9a3412', border: 'rgba(249,115,22,0.35)',rowTint: 'rgba(249,115,22,0.06)' }
  if (pct < 70)  return { bg: '#fef3c7', fg: '#854d0e', border: 'rgba(234,179,8,0.35)', rowTint: 'rgba(234,179,8,0.07)'  }
  if (pct < 85)  return { bg: '#d9f99d', fg: '#3f6212', border: 'rgba(132,204,22,0.4)', rowTint: 'rgba(132,204,22,0.1)'  }
  if (pct < 100) return { bg: '#bbf7d0', fg: '#15803d', border: 'rgba(34,197,94,0.4)',  rowTint: 'rgba(34,197,94,0.1)'   }
  return            { bg: '#86efac', fg: '#166534', border: 'rgba(22,163,74,0.5)',  rowTint: 'rgba(22,163,74,0.14)'  }
}

function ReportCardTab({ users, excluded = new Set(), onToggleExclude }) {
  if (!users.length) return <EmptyState emoji="📭" text="ਕੋਈ ਡੇਟਾ ਨਹੀਂ" />

  // All hour-based columns use H:MM. (Vichar's weekly target is also in hours
  // per the admin's rules, even though many users still write it in minutes —
  // sanitizeHours() in the parser has already converted minute-entries to hours
  // before it reaches this point.)

  // Each table cell shows the per-day average with the full weekly total in
  // small muted parens next to it — the admin uses the weekly total when
  // reconciling against the chat (easier than re-doing ×7 mentally).
  function HourCell({ avg, total }) {
    return (
      <>
        {fmtHoursHM(avg)}
        <span className="text-[10px] font-normal ml-1" style={{ opacity: 0.55 }}>({fmtHoursHM(total)})</span>
      </>
    )
  }

  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(14,65,110,0.1)', background: 'rgba(14,65,110,0.04)' }}>
              <th className="text-center px-2 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap', width: 36 }} title="ਚਿੱਤਰ ਵਿੱਚ ਸ਼ਾਮਲ ਕਰੋ">
                ✓
              </th>
              <th className="text-left px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਾਮ</th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>/ਦਿਨ (ਹਫ਼ਤਾ) · ਟੀਚਾ ੭h</div>
              </th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                ਤੁਰਦੇ ਫਿਰਦੇ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>/ਦਿਨ (ਹਫ਼ਤਾ) · ਟੀਚਾ ੨੮h</div>
              </th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                ਗੁਰਬਾਣੀ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>/ਦਿਨ (ਹਫ਼ਤਾ) · ਟੀਚਾ ੧੫h</div>
              </th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                ਵਿਚਾਰ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>/ਦਿਨ (ਹਫ਼ਤਾ) · ਟੀਚਾ ੨h</div>
              </th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                🛌 ਨੀਂਦ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>/ਦਿਨ (ਹਫ਼ਤਾ)</div>
              </th>
              <th className="text-right px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                ਮਹਾਰਾਜ ਨੂੰ<div className="text-[10px] font-normal" style={{ opacity: 0.5 }}>ਘੰਟੇ/ਦਿਨ · %</div>
              </th>
              <th className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਤੀਜਾ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isExcluded = excluded.has(u.name)
              return (
              <tr key={u.name}
                style={{
                  borderBottom: '1px solid rgba(14,65,110,0.06)',
                  // Tint every row with its score-colour. Keeps a subtle
                  // alternating darken on odd rows so the table still reads
                  // zebra-like. Excluded rows are desaturated so the admin
                  // can see at a glance who won't appear in the image.
                  background: i % 2 === 0
                    ? pctColor(u.pctOfDay).rowTint
                    : `color-mix(in srgb, ${pctColor(u.pctOfDay).rowTint} 65%, rgba(14,65,110,0.025))`,
                  opacity: isExcluded ? 0.4 : 1,
                }}>
                <td className="px-2 py-3 text-center">
                  <input type="checkbox"
                    checked={!isExcluded}
                    onChange={() => onToggleExclude?.(u.name)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: '#0c2540' }}
                    title={isExcluded ? 'ਚਿੱਤਰ ਵਿੱਚ ਸ਼ਾਮਲ ਕਰੋ' : 'ਚਿੱਤਰ ਵਿੱਚੋਂ ਹਟਾਓ'}
                  />
                </td>
                <td className="px-3 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                  {truncateName(u.name)}
                  {!u.hasReport ? (
                    <span className="ml-1.5 text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>(ਕੋਈ ਸੁਨੇਹਾ ਨਹੀਂ)</span>
                  ) : (
                    <span className="ml-1.5 text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>({u.daysReported}/7 ਦਿਨ)</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right" style={{ color: '#0c2540' }}>
                  <HourCell avg={u.avg.gurmantar_tikaa} total={u.weekly.totals.gurmantar_tikaa} />
                </td>
                <td className="px-3 py-3 text-right" style={{ color: '#0c2540' }}>
                  <HourCell avg={u.avg.gurmantar_turde} total={u.weekly.totals.gurmantar_turde} />
                </td>
                <td className="px-3 py-3 text-right" style={{ color: '#0c2540' }}>
                  <HourCell avg={u.avg.gurbani} total={u.weekly.totals.gurbani} />
                </td>
                <td className="px-3 py-3 text-right" style={{ color: '#0c2540' }}>
                  <HourCell avg={u.avg.vichar} total={u.weekly.totals.vichar} />
                </td>
                <td className="px-3 py-3 text-right" style={{ color: '#0c2540' }}>
                  <HourCell avg={u.avg.neend} total={u.weekly.totals.neend_sum ?? 0} />
                </td>
                <td className="px-3 py-3 text-right font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                  {fmtHoursHM(u.avgHoursPerDay)}
                  {(() => {
                    const c = pctColor(u.pctOfDay)
                    return (
                      <span className="text-xs font-bold ml-1.5 px-1.5 py-0.5 rounded-md"
                        style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                        {u.pctOfDay.toFixed(1)}%
                      </span>
                    )
                  })()}
                </td>
                <td className="px-3 py-3 text-center">
                  {u.weekly.passed ? (
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Final Fail ───────────────────────────────────────────────────────────

function FinalFailTab({ users }) {
  if (!users.length) return <EmptyState emoji="🏆" text="ਕੋਈ ਫ਼ੇਲ੍ਹ ਨਹੀਂ!" />
  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="p-4 border-b" style={{ borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)' }}>
        <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>{users.length} ਵਰਤੋਂਕਾਰ ਫ਼ੇਲ੍ਹ</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(14,65,110,0.08)', background: 'rgba(14,65,110,0.02)' }}>
              <th className="text-left px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਨਾਮ</th>
              <th className="text-left px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਘੱਟ ਖੇਤਰ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const fails = u.weekly.checks.filter(c => !c.passed)
              const disc = u.weekly.disciplinePass ? [] : ['੧ ਦਿਨ ਦਾ ਨਿਯਮ']
              const reasons = [
                ...fails.map(f => {
                  const label = CATEGORIES.find(c => c.key === f.key)?.label || f.key
                  return `${label} (${(Math.round(f.value * 10) / 10)}/${f.target})`
                }),
                ...disc,
              ].join(', ')
              return (
                <tr key={u.name}
                  style={{ borderBottom: '1px solid rgba(14,65,110,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(239,68,68,0.015)' }}>
                  <td className="px-3 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                    <span className="mr-1.5">❌</span>{truncateName(u.name)}
                  </td>
                  <td className="px-3 py-3" style={{ color: '#dc2626' }}>{reasons || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadImageButton({ users, weekRange, excludedCount = 0 }) {
  const [downloading, setDownloading] = useState(false)
  async function handle() {
    if (!users.length) return
    setDownloading(true)
    try { await downloadReportCardImage(users, weekRange) }
    finally { setDownloading(false) }
  }
  const disabled = downloading || !users.length
  return (
    <button onClick={handle} disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
      style={{ background: 'rgba(14,65,110,0.08)', border: '1px solid rgba(14,65,110,0.18)', color: '#1a5f8f', opacity: disabled ? 0.6 : 1 }}>
      {downloading
        ? '⏳ ਤਿਆਰ...'
        : excludedCount > 0
          ? `📥 ਚਿੱਤਰ ਡਾਊਨਲੋਡ (${users.length})`
          : '📥 ਚਿੱਤਰ ਡਾਊਨਲੋਡ'}
    </button>
  )
}

// ── Report-card image (tabular, sorted by name, averages + %) ─────────────────

async function downloadReportCardImage(users, weekRange) {
  await document.fonts.ready
  await document.fonts.load('bold 20px "Noto Sans Gurmukhi"').catch(() => {})

  // Layout
  const W = 1400
  const SIDE_W = 100
  const BOT_H = 110
  const HDR_H = 170
  const COL_HDR_H = 80
  const ROW_H = 50
  const BOTTOM_PAD = BOT_H + 24
  const n = users.length
  const CANVAS_H = HDR_H + COL_HDR_H + n * ROW_H + BOTTOM_PAD + 20

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#fdf6e3'
  ctx.fillRect(0, 0, W, CANVAS_H)

  const gf = (sz, bold) => `${bold ? 'bold ' : ''}${sz}px "Noto Sans Gurmukhi","Gurmukhi MN",sans-serif`

  // Decorative borders (optional images; degrade gracefully)
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

  ctx.save()
  ctx.globalCompositeOperation = 'multiply'

  if (imgMeadow) {
    const mTileW = BOT_H * (imgMeadow.naturalWidth / imgMeadow.naturalHeight)
    const botY = CANVAS_H - BOT_H
    ctx.save()
    ctx.beginPath(); ctx.rect(0, botY, W, BOT_H); ctx.clip()
    for (let x = 0; x < W; x += mTileW) ctx.drawImage(imgMeadow, x, botY, mTileW, BOT_H)
    ctx.restore()
  }
  if (imgGarland) {
    const gTileH = SIDE_W * (imgGarland.naturalWidth / imgGarland.naturalHeight)
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, SIDE_W, CANVAS_H); ctx.clip()
    for (let y = 0; y < CANVAS_H; y += gTileH) {
      ctx.save(); ctx.translate(SIDE_W, y); ctx.rotate(Math.PI / 2)
      ctx.drawImage(imgGarland, 0, 0, gTileH, SIDE_W); ctx.restore()
    }
    ctx.restore()
    ctx.save()
    ctx.beginPath(); ctx.rect(W - SIDE_W, 0, SIDE_W, CANVAS_H); ctx.clip()
    for (let y = 0; y < CANVAS_H; y += gTileH) {
      ctx.save(); ctx.translate(W, y); ctx.scale(-1, 1)
      ctx.translate(SIDE_W, 0); ctx.rotate(Math.PI / 2)
      ctx.drawImage(imgGarland, 0, 0, gTileH, SIDE_W); ctx.restore()
    }
    ctx.restore()
  }
  ctx.restore()

  // Gold frame
  ctx.strokeStyle = '#d4a84c'; ctx.lineWidth = 2.5
  ctx.strokeRect(8, 8, W - 16, CANVAS_H - 16)
  ctx.strokeStyle = 'rgba(212,168,76,0.4)'; ctx.lineWidth = 1
  ctx.strokeRect(17, 17, W - 34, CANVAS_H - 34)

  // Title
  ctx.textAlign = 'center'
  ctx.fillStyle = '#1a1a5e'
  ctx.font = gf(44, true)
  ctx.fillText('ਸਪਤਾਹਿਕ ਰਿਪੋਰਟ ਕਾਰਡ', W / 2, 72)
  ctx.font = gf(19)
  ctx.fillStyle = '#7c5a28'
  ctx.fillText('ਰੋਜ਼ਾਨਾ ਔਸਤ (ਘੰਟੇ) · ਮਹਾਰਾਜ ਨੂੰ ਦਿੱਤੇ ਦਿਨ ਦਾ %', W / 2, 108)
  if (weekRange) {
    ctx.font = gf(15)
    ctx.fillStyle = '#a08050'
    ctx.fillText(`ਹਫ਼ਤਾ: ${fmtDate(weekRange.start)} – ${fmtDate(weekRange.end)}`, W / 2, 138)
  }

  // Divider flowers
  function drawPetal(cx, cy, angle, len, wid) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
    ctx.beginPath(); ctx.moveTo(0, 0)
    ctx.bezierCurveTo(wid * 0.5, -len * 0.18, wid * 0.55, -len * 0.82, 0, -len)
    ctx.bezierCurveTo(-wid * 0.55, -len * 0.82, -wid * 0.5, -len * 0.18, 0, 0)
    ctx.fill(); ctx.restore()
  }
  function drawFlower(cx, cy, nPetals, len, wid, color, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color
    for (let p = 0; p < nPetals; p++) drawPetal(cx, cy, (p / nPetals) * Math.PI * 2, len, wid)
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, len * 0.14), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  const divY = HDR_H - 12
  ctx.strokeStyle = 'rgba(201,168,76,0.4)'; ctx.lineWidth = 1
  ctx.setLineDash([3, 8])
  ctx.beginPath(); ctx.moveTo(SIDE_W + 40, divY); ctx.lineTo(W / 2 - 50, divY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(W / 2 + 50, divY); ctx.lineTo(W - SIDE_W - 40, divY); ctx.stroke()
  ctx.setLineDash([])
  drawFlower(W / 2, divY, 8, 14, 4.5, '#b8860b', 0.9)

  // Table layout — 8 columns (no pass-badge on the image, admin's request).
  // Splitting "ਮਹਾਰਾਜ ਨੂੰ" into HOURS and %. The % cell uses a gradient tint
  // so the admin can scan the leaderboard at a glance.
  const tableX = SIDE_W + 24
  const tableW = W - 2 * (SIDE_W + 24)
  const cols = [
    { label: 'ਨਾਮ', sub: '', align: 'left', w: 0.26 },
    { label: 'ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.11 },
    { label: 'ਤੁਰਦੇ ਫਿਰਦੇ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.11 },
    { label: 'ਗੁਰਬਾਣੀ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.11 },
    { label: 'ਵਿਚਾਰ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.10 },
    { label: 'ਨੀਂਦ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.10 },
    { label: 'ਮਹਾਰਾਜ ਨੂੰ', sub: 'ਘੰਟੇ/ਦਿਨ', align: 'right', w: 0.10 },
    { label: '%', sub: 'ਦਿਨ ਦਾ', align: 'right', w: 0.11 },
  ]
  // Resolve widths
  const colWidths = cols.map(c => c.w * tableW)
  const colXs = []
  let runX = tableX
  for (const w of colWidths) { colXs.push(runX); runX += w }

  // Column header row
  const chY = HDR_H
  ctx.fillStyle = '#1e3a5f'
  ctx.fillRect(tableX, chY, tableW, COL_HDR_H)
  ctx.fillStyle = 'white'
  cols.forEach((c, i) => {
    const x = colXs[i], w = colWidths[i]
    ctx.font = gf(16, true)
    ctx.textAlign = c.align === 'center' ? 'center' : c.align
    const tx = c.align === 'left' ? x + 12 : c.align === 'right' ? x + w - 12 : x + w / 2
    ctx.fillText(c.label, tx, chY + 32)
    if (c.sub) {
      ctx.font = gf(12)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(c.sub, tx, chY + 54)
      ctx.fillStyle = 'white'
    }
  })

  // Data rows — use the shared H:MM formatter (admin prefers "੫:੩੦" over "5.5h").
  const fmtH = v => fmtHoursHM(v)

  users.forEach((u, idx) => {
    const ry = chY + COL_HDR_H + idx * ROW_H
    // Row background tinted by the score colour. Odd rows are tinted slightly
    // more so the table keeps its zebra feel.
    const pc = pctColor(u.pctOfDay)
    ctx.fillStyle = pc.rowTint
    ctx.fillRect(tableX, ry, tableW, ROW_H)
    if (idx % 2 === 1) {
      ctx.fillStyle = 'rgba(14,65,110,0.025)'
      ctx.fillRect(tableX, ry, tableW, ROW_H)
    }

    // Bottom border
    ctx.strokeStyle = 'rgba(14,65,110,0.08)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(tableX, ry + ROW_H); ctx.lineTo(tableX + tableW, ry + ROW_H); ctx.stroke()

    const ty = ry + ROW_H * 0.65

    // Name (clipped)
    ctx.save()
    ctx.beginPath(); ctx.rect(colXs[0], ry, colWidths[0], ROW_H); ctx.clip()
    ctx.fillStyle = '#111827'
    ctx.font = gf(17, true)
    ctx.textAlign = 'left'
    ctx.fillText(truncateName(u.name), colXs[0] + 12, ty)
    ctx.restore()

    // Numeric columns (order matches `cols` after name)
    const vals = [
      fmtH(u.avg.gurmantar_tikaa),
      fmtH(u.avg.gurmantar_turde),
      fmtH(u.avg.gurbani),
      fmtH(u.avg.vichar),
      fmtH(u.avg.neend),
      fmtHoursHM(u.avgHoursPerDay),
    ]
    for (let i = 0; i < vals.length; i++) {
      ctx.fillStyle = '#111827'
      ctx.font = gf(17)
      ctx.textAlign = 'right'
      const col = colXs[i + 1], w = colWidths[i + 1]
      ctx.fillText(vals[i], col + w - 12, ty)
    }

    // Percentage cell — tinted pill + colour-coded text.
    const pcol = pc
    const pxCell = colXs[7], pwCell = colWidths[7]
    // Tinted pill behind the %.
    const pillW = 90, pillH = 28
    const plx = pxCell + pwCell - pillW - 10, ply = ry + ROW_H / 2 - pillH / 2
    ctx.fillStyle = pcol.bg
    roundRect(ctx, plx, ply, pillW, pillH, 8); ctx.fill()
    ctx.fillStyle = pcol.fg
    ctx.font = gf(16, true)
    ctx.textAlign = 'right'
    ctx.fillText(`${u.pctOfDay.toFixed(1)}%`, pxCell + pwCell - 20, ty)
  })

  // (The "ਔਸਤ (ਸਭ)" overall averages row was intentionally removed from the
  // downloadable image per admin request — it adds noise to the shared PNG.
  // The on-page table still shows the per-user weekly totals which is enough
  // for admin validation.)

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-card-${weekRange ? fmtDate(weekRange.start).replace(/ /g, '-') : 'week'}.png`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }, 'image/png')
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
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