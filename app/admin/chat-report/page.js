'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'
import JSZip from 'jszip'

// ── Targets ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: 'gurmantar',
    label: 'ਗੁਰਮੰਤਰ',
    emoji: '🌼',
    weeklyTarget: 80000,
    keywords: ['ਗੁਰਮੰਤਰ', 'ਗੁਰਮੰਤ', 'gurmantar', 'mantar'],
  },
  {
    key: 'brahmkavach',
    label: 'ਬ੍ਰਹਮਕਵੱਚ',
    emoji: '⚔️',
    weeklyTarget: 40,
    keywords: ['ਬ੍ਰਹਮਕਵੱਚ', 'ਕਵੱਚ', 'brahmkavach', 'kavach'],
  },
  {
    key: 'birharhe',
    label: 'ਬਿਰਹੜੇ',
    emoji: '💘',
    weeklyTarget: 15,
    keywords: ['ਬਿਰਹੜੇ', 'ਬਿਰਹ', 'birharhe', 'birhare'],
  },
  {
    key: 'japji',
    label: 'ਜਪਜੀ ਸਾਹਿਬ',
    emoji: '⏰',
    weeklyTarget: 3.5,
    keywords: ['ਜਪਜੀ', 'ਜਪੁਜੀ', 'ਉਠਦਿਆ', 'japji'],
  },
  {
    key: 'sewa',
    label: 'ਹੱਥੀ ਸੇਵਾ',
    emoji: '🤲🏻',
    weeklyTarget: 5,
    keywords: ['ਸੇਵਾ', 'ਹੱਥੀ', 'sewa'],
  },
]

// ── Parsing helpers ───────────────────────────────────────────────────────────

function punjNumToArabic(str) {
  return str
    .replace(/੦/g, '0').replace(/੧/g, '1').replace(/੨/g, '2').replace(/੩/g, '3')
    .replace(/੪/g, '4').replace(/੫/g, '5').replace(/੬/g, '6').replace(/੭/g, '7')
    .replace(/੮/g, '8').replace(/੯/g, '9')
}

function extractNumber(text) {
  const normalized = punjNumToArabic(text).replace(/,/g, '').replace(/،/g, '')
  const matches = [...normalized.matchAll(/\d+(?:\.\d+)?/g)]
  if (!matches.length) return null
  // Use the largest number — avoids taking small ordinals like ੧ in "੧ ਹਫ਼ਤੇ - ੬੦,੦੦੦"
  return Math.max(...matches.map(m => parseFloat(m[0])))
}

function parseMessageForCategories(text) {
  const lines = text.split('\n')
  const result = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const cat of CATEGORIES) {
      if (result[cat.key] !== undefined) continue
      if (cat.keywords.some(kw => line.includes(kw))) {
        // Try number on the same line first
        const num = extractNumber(line)
        if (num !== null) {
          result[cat.key] = num
        } else {
          // Look ahead up to 4 lines for weekly count (prefer line with ਹਫ਼ਤ/week)
          let fallbackNum = null
          let weeklyNum = null
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nxt = lines[j]
            // Stop if another category keyword appears
            if (CATEGORIES.some(c => c.key !== cat.key && c.keywords.some(kw => nxt.includes(kw)))) break
            const n = extractNumber(nxt)
            if (n !== null) {
              if (fallbackNum === null) fallbackNum = n
              if (/ਹਫ਼ਤ|ਹਫ਼ਤੇ|ਹਫ਼ਤਾ|week/i.test(nxt) && weeklyNum === null) weeklyNum = n
            }
          }
          const chosen = weeklyNum ?? fallbackNum
          if (chosen !== null) result[cat.key] = chosen
        }
      }
    }
  }
  return result
}

// Parse WhatsApp chat text into array of { sender, text } messages.
// Handles all known export formats:
//   Format A (old): [M/D/YY, H:MM:SS AM/PM] Name: text
//   Format B (old, own/system): [M/D/YY, H:MM:SS AM/PM] - text
//   Format C (new markdown): [HH:MM] Name: text  (within ## Date sections)
function parseWhatsAppChat(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')
  const messages = []
  let current = null

  const SYSTEM_PATTERNS = [
    /^You (added|removed|changed|created|turned|left)/,
    /\b(added|removed|left|turned off disappearing|joined using)/,
    /^\[System notification\]$/,
    /^Messages and calls are end-to-end/,
    /^<Media omitted>$/,
  ]

  function isSystemText(t) {
    return SYSTEM_PATTERNS.some(p => p.test(t.trim()))
  }

  for (const line of lines) {
    // Format A: [M/D/YY, H:MM:SS AM/PM] Name: text  (named sender)
    const fmtA = line.match(
      /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\]\s+([^:\-[\]]+[^:\s]):\s*(.*)/
    )
    // Format B: [M/D/YY, H:MM:SS AM/PM] - text  (own message or system)
    const fmtB = !fmtA && line.match(
      /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\]\s+-\s+(.*)/
    )
    // Format C: [HH:MM] Name: text  (new markdown section-based export)
    const fmtC = !fmtA && !fmtB && line.match(
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^_:[\]<>][^:[\]<>]*?):\s+(.*)/
    )
    // Format D: [HH:MM] __content__  → system line in new export, skip
    const fmtD = !fmtA && !fmtB && !fmtC && line.match(/^\[\d{1,2}:\d{2}\]\s+__/)

    if (fmtA) {
      if (current) messages.push(current)
      current = { sender: fmtA[1].trim(), text: fmtA[2] }
    } else if (fmtB) {
      if (current) messages.push(current)
      const content = fmtB[1]
      if (isSystemText(content)) {
        current = null
      } else {
        current = { sender: 'You', text: content }
      }
    } else if (fmtC) {
      if (current) messages.push(current)
      current = { sender: fmtC[2].trim(), text: fmtC[3] }
    } else if (fmtD || line.startsWith('## ') || line.startsWith('# ') || line.startsWith('---')) {
      if (current) messages.push(current)
      current = null
    } else if (line.match(/^\[\d{1,2}\/\d{1,2}\/\d{2,4},/)) {
      // Unmatched old-format timestamp line → flush
      if (current) messages.push(current)
      current = null
    } else if (current) {
      // Multi-line continuation
      current.text += '\n' + line
    }
  }
  if (current) messages.push(current)
  return messages
}

// Find the most recent message from a user that has parseable data
function getLatestReport(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const parsed = parseMessageForCategories(texts[i])
    if (Object.keys(parsed).length > 0) return parsed
  }
  return null
}

// Build full report array from raw messages
function buildReport(messages) {
  // Group by sender (preserve order)
  const bySender = {}
  const order = []
  for (const msg of messages) {
    if (!bySender[msg.sender]) { bySender[msg.sender] = []; order.push(msg.sender) }
    bySender[msg.sender].push(msg.text)
  }

  return order.map(name => {
    const values = getLatestReport(bySender[name]) || {}
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
    } else {
      const otherPassed = CATEGORIES.filter(c => c.key !== 'gurmantar' && catResults[c.key].passed)
      if (otherPassed.length >= 2) {
        finalStatus = 'pass'
      } else {
        failReason = `ਗੁਰਮੰਤਰ ਪਾਸ, ਪਰ ਸਿਰਫ਼ ${otherPassed.length} ਹੋਰ ਖੇਤਰ ਪਾਸ (੨ ਚਾਹੀਦੇ)`
      }
    }

    return { name, hasReport, values, catResults, finalStatus, failReason }
  })
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ChatReportPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [activeTab, setActiveTab] = useState('report')
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

      const messages = parseWhatsAppChat(chatText)
      if (!messages.length) throw new Error('ਕੋਈ ਸੁਨੇਹੇ ਨਹੀਂ ਮਿਲੇ। ਫ਼ਾਈਲ ਦਾ ਫ਼ਾਰਮੈਟ ਜਾਂਚੋ।')

      setReport(buildReport(messages))
      setActiveTab('report')
    } catch (err) {
      setError(err.message || 'ਫ਼ਾਈਲ ਪੜ੍ਹਨ ਵਿੱਚ ਗਲਤੀ')
    }

    setProcessing(false)
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
                  ਪਾਸ ਹੋਣ ਲਈ: ਗੁਰਮੰਤਰ + ਘੱਟੋ-ਘੱਟ ੨ ਹੋਰ ਖੇਤਰ ਪੂਰੇ ਕਰਨੇ ਜ਼ਰੂਰੀ ਹਨ
                </p>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {report && (
          <div className="animate-fadeInUp">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                {sortedReport.length} ਭਾਗੀਦਾਰ · {sortedReport.filter(u => u.finalStatus === 'pass').length} ਪਾਸ · {finalFails.length} ਫ਼ੇਲ੍ਹ
              </p>
              <button
                onClick={() => { setReport(null); setError('') }}
                className="text-sm px-3 py-1.5 rounded-lg transition-all"
                style={{ background: 'rgba(14,65,110,0.06)', border: '1px solid rgba(14,65,110,0.12)', color: '#1a5f8f' }}>
                ↑ ਨਵੀਂ ਫ਼ਾਈਲ
              </button>
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
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab 1: Report Card ────────────────────────────────────────────────────────

function ReportCardTab({ report }) {
  if (!report.length) return <EmptyState emoji="📭" text="ਕੋਈ ਡੇਟਾ ਨਹੀਂ" />

  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(14,65,110,0.1)', background: 'rgba(14,65,110,0.04)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਾਮ</th>
              {CATEGORIES.map(c => (
                <th key={c.key} className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540', minWidth: 80 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{c.emoji} {c.label}</span>
                  <div className="text-xs font-normal mt-0.5" style={{ color: 'rgba(12,36,64,0.4)' }}>
                    ਟੀਚਾ: {c.weeklyTarget}
                  </div>
                </th>
              ))}
              <th className="text-center px-4 py-3 font-semibold" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>ਨਤੀਜਾ</th>
            </tr>
          </thead>
          <tbody>
            {report.map((user, i) => (
              <tr key={user.name}
                style={{
                  borderBottom: '1px solid rgba(14,65,110,0.06)',
                  background: user.finalStatus === 'pass'
                    ? (i % 2 === 0 ? 'rgba(34,197,94,0.02)' : 'rgba(34,197,94,0.04)')
                    : (i % 2 === 0 ? 'transparent' : 'rgba(14,65,110,0.015)'),
                }}>
                <td className="px-4 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>
                  {user.name}
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
  )
}

// ── Tab 2: Shortfall ──────────────────────────────────────────────────────────

function ShortfallTab({ users }) {
  const rows = []
  for (const user of users) {
    for (const cat of CATEGORIES) {
      const res = user.catResults[cat.key]
      if (!res.passed) {
        rows.push({
          name: user.name,
          cat,
          value: res.value,
          shortfall: res.value !== null ? res.target - res.value : null,
        })
      }
    }
  }

  if (!rows.length) return <EmptyState emoji="🎉" text="ਸਾਰੇ ਟੀਚੇ ਪੂਰੇ ਹੋਏ!" />

  return (
    <div className="glass-card-static rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(14,65,110,0.1)', background: 'rgba(14,65,110,0.04)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: '#0c2540' }}>ਨਾਮ</th>
              <th className="text-left px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਖੇਤਰ</th>
              <th className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਕੀਤਾ</th>
              <th className="text-center px-3 py-3 font-semibold" style={{ color: '#0c2540' }}>ਟੀਚਾ</th>
              <th className="text-center px-3 py-3 font-semibold" style={{ color: '#dc2626' }}>ਕਮੀ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.name}-${row.cat.key}`}
                style={{ borderBottom: '1px solid rgba(14,65,110,0.06)', background: i % 2 === 0 ? 'transparent' : 'rgba(14,65,110,0.015)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: '#0c2540', whiteSpace: 'nowrap' }}>{row.name}</td>
                <td className="px-3 py-3" style={{ whiteSpace: 'nowrap' }}>
                  {row.cat.emoji}&nbsp;<span style={{ color: '#1a5f8f', fontWeight: 500 }}>{row.cat.label}</span>
                </td>
                <td className="px-3 py-3 text-center font-semibold" style={{ color: row.value !== null ? '#dc2626' : 'rgba(12,36,64,0.25)' }}>
                  {row.value !== null ? row.value : '—'}
                </td>
                <td className="px-3 py-3 text-center" style={{ color: 'rgba(12,36,64,0.5)' }}>{row.cat.weeklyTarget}</td>
                <td className="px-3 py-3 text-center font-bold" style={{ color: '#dc2626' }}>
                  {row.shortfall !== null ? `−${row.shortfall}` : '—'}
                </td>
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
          ਪਾਸ ਹੋਣ ਲਈ: ਗੁਰਮੰਤਰ + ੨ ਹੋਰ ਖੇਤਰ ਜ਼ਰੂਰੀ ਹਨ
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
                    <span className="mr-1.5">❌</span>{user.name}
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
