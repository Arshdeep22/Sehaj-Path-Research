'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { getProfileCached, getCache, setCache } from '../../lib/clientCache'
import { CATEGORY_DAILY, getReportWeekRange } from '../../lib/jaapParser'
import { sunTimes, skyColorAt, isDarkColor } from '../../lib/sky'
import TopBar from '../../components/TopBar'
import CalendarHeatmap from '../../components/charts/CalendarHeatmap'
import LineChart from '../../components/charts/LineChart'
import VelaChart from '../../components/charts/VelaChart'
import Carousel from '../../components/charts/Carousel'
import JaapEntryModal from '../../components/JaapEntryModal'

// Card display order (ਹੱਥੀ ਸੇਵਾ right after ਗੁਰਮੰਤਰ).
const CARD_ORDER = ['gurmantar', 'sewa', 'brahmkavach', 'birharhe', 'japji', 'sehajpath']
const ORDERED_CATS = CARD_ORDER.map(k => CATEGORY_DAILY.find(c => c.key === k)).filter(Boolean)

// Pastel header backgrounds with a matching deeper text tone per category.
const CAT_COLOR = {
  gurmantar:   { bg: '#f3dcb4', text: '#8a4b0a' },
  brahmkavach: { bg: '#cdd9f6', text: '#1e40af' },
  birharhe:    { bg: '#f6cedd', text: '#9d174d' },
  japji:       { bg: '#ddd1f4', text: '#5b21b6' },
  sewa:        { bg: '#c9e7d4', text: '#166534' },
  sehajpath:   { bg: '#c6e3ea', text: '#155e75' },
}

// A distinctive pastel header for the vela card, kept the same on both slides.
const VELA_HEADER = 'linear-gradient(135deg, #e5d8f7 0%, #d4c3f0 100%)'
const VELA_HEADER_TEXT = '#5b21b6'

const FILTERS = [
  { key: 'week', label: 'ਇਸ ਹਫ਼ਤਾ' },
  { key: 'month', label: 'ਇਸ ਮਹੀਨਾ' },
  { key: 'all', label: 'ਸਾਰਾ' },
]

function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parseDateStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function shortLabel(s) { const d = parseDateStr(s); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

function dayState(row, cat) {
  if (!row) return 'blank'
  const v = row[cat.key]
  if (v === null || v === undefined) return 'blank'
  // ਹੱਥੀ ਸੇਵਾ is a yes/no task — no "ਘੱਟ" (partial) state.
  if (cat.key === 'sewa') return v > 0 ? 'done' : 'miss'
  if (v >= cat.dailyTarget) return 'done'
  if (v > 0) return 'partial'
  return 'miss'
}

// Dates (YYYY-MM-DD) covered by the active filter, start → today.
function buildRange(filter) {
  const now = new Date()
  let start
  if (filter === 'week') start = getReportWeekRange(now).start
  else if (filter === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1)
  else start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const d = new Date(start); d.setHours(0, 0, 0, 0)
  const end = new Date(now); end.setHours(0, 0, 0, 0)
  const dates = []
  while (d <= end) { dates.push(toLocalDateStr(d)); d.setDate(d.getDate() + 1) }
  return dates
}

// Which month grids to show on the calendar slide for this filter.
function monthsForFilter(filter) {
  const now = new Date()
  const cur = { y: now.getFullYear(), m: now.getMonth() }
  if (filter !== 'all') return [cur]
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return [{ y: prev.getFullYear(), m: prev.getMonth() }, cur]
}

export default function JivanPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <JivanInner />
    </Suspense>
  )
}

function JivanInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewProfileId = searchParams.get('profileId')

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('week')
  const [velaActive, setVelaActive] = useState(0)
  const [token, setToken] = useState(null)
  const [showEntry, setShowEntry] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const cacheKeyRef = useRef(null)

  async function reloadAnalytics(tok, key = cacheKeyRef.current) {
    const qs = viewProfileId ? `?profileId=${viewProfileId}` : ''
    const res = await fetch(`/api/jaap/analytics${qs}`, { headers: { Authorization: `Bearer ${tok}` } })
    const json = await res.json()
    setData(json)
    if (key && res.ok) setCache(key, json)
    return json
  }

  useEffect(() => {
    async function load() {
      let tok, pid
      const fast = await getProfileCached()
      if (fast) { setProfile(fast.profile); tok = fast.token; pid = fast.profile?.id }
      if (!tok) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (!prof || prof.must_change_password) { router.push('/change-password'); return }
        setProfile(prof)
        pid = prof.id
        const { data: { session } } = await supabase.auth.getSession()
        tok = session?.access_token
      }
      setToken(tok)

      // Stale-while-revalidate: show the last-known analytics instantly, then refresh.
      const key = `jaap:analytics:${viewProfileId || pid}`
      cacheKeyRef.current = key
      const cached = getCache(key)
      if (cached) { setData(cached); setLoading(false) }
      await reloadAnalytics(tok, key)
      setLoading(false)
    }
    load()
  }, [router, viewProfileId])

  if (loading) return <LoadingScreen />

  const mine = data?.mine || []
  const dailyMax = data?.dailyMax || {}
  const velaBest = data?.velaBest || {}
  const byDate = {}
  for (const r of mine) byDate[r.report_date] = r

  const range = buildRange(filter)
  const months = monthsForFilter(filter)
  const isAdminView = viewProfileId && viewProfileId !== profile?.id

  // Vela carousel slides
  const amritPoints = range.map(ds => ({ label: shortLabel(ds), you: byDate[ds]?.amrit_vela_min ?? null, best: velaBest[ds]?.amrit ?? null }))
  const sandhyaPoints = range.map(ds => ({ label: shortLabel(ds), you: byDate[ds]?.sandhya_vela_min ?? null, best: velaBest[ds]?.sandhya ?? null }))

  // Dynamic y-domains (earlier time = "best" = top of the chart).
  // Amrit: 12am → 9am by default, tightening if everyone is earlier, extending
  //        up to 12pm if someone is later.
  // Sandhya: 4pm (best) → 9pm by default, extending toward 12am if later.
  const hourFloor = m => Math.floor(m / 60) * 60
  const hourCeil = m => Math.ceil(m / 60) * 60
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const aVals = amritPoints.flatMap(p => [p.you, p.best]).filter(v => v != null)
  const amritMax = aVals.length ? clamp(hourCeil(Math.max(...aVals)), 300, 720) : 540
  const sVals = sandhyaPoints.flatMap(p => [p.you, p.best]).filter(v => v != null)
  const sandhyaMin = sVals.length ? Math.min(960, hourFloor(Math.min(...sVals))) : 960
  const sandhyaMax = sVals.length ? clamp(hourCeil(Math.max(...sVals)), 1140, 1440) : 1260

  // Tab/dot contrast follows the active slide's top/bottom sky colour (today's
  // India sun times). The chart itself paints the full-card sky backdrop.
  const sun = sunTimes(new Date())
  const velaTop = velaActive === 1 ? sandhyaMin : 0
  const velaBot = velaActive === 1 ? sandhyaMax : amritMax
  const velaTopColor = skyColorAt(velaTop, sun)
  const velaBotColor = skyColorAt(velaBot, sun)
  const tabsOnDark = isDarkColor(velaTopColor)
  const dotsOnDark = isDarkColor(velaBotColor)

  return (
    <div className="page-body">
      <TopBar profile={profile} />
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Filter dropdown (left) + add entry (right) in one row */}
        <div className="flex items-center justify-between gap-2 mb-4 animate-fadeInUp relative" style={{ zIndex: 30 }}>
          <div className="relative" style={{ zIndex: 50 }}>
            <button onClick={() => setFilterOpen(o => !o)}
              className="inline-flex items-center gap-2 pl-4 pr-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(14,65,110,0.18)', color: '#0c2540', boxShadow: '0 2px 8px rgba(14,65,110,0.06)' }}>
              {FILTERS.find(f => f.key === filter)?.label}
              <span className="text-xs transition-transform" style={{ color: 'rgba(12,36,64,0.5)', transform: filterOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden min-w-[150px]"
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(14,65,110,0.14)', boxShadow: '0 10px 30px rgba(12,36,64,0.18)', backdropFilter: 'blur(8px)' }}>
                  {FILTERS.map(f => {
                    const on = f.key === filter
                    return (
                      <button key={f.key} onClick={() => { setFilter(f.key); setFilterOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left transition-colors"
                        style={{ background: on ? 'rgba(14,65,110,0.1)' : 'transparent', color: on ? '#0c2540' : 'rgba(12,36,64,0.65)', fontWeight: on ? 700 : 500 }}>
                        <span className="w-3 text-xs" style={{ color: '#1a5f8f' }}>{on ? '✓' : ''}</span>
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {isAdminView ? (
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(14,65,110,0.08)', color: '#1a5f8f' }}>ਐਡਮਿਨ</span>
          ) : (
            <button onClick={() => setShowEntry(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #2a84c7 100%)', boxShadow: '0 4px 14px rgba(56,189,248,0.35)' }}>
              <span className="text-lg leading-none">＋</span> ਹਾਜ਼ਰੀ ਜੋੜੋ
            </button>
          )}
        </div>

        {showEntry && (
          <JaapEntryModal
            token={token}
            byDate={byDate}
            defaultDate={new Date().toISOString().slice(0, 10)}
            onClose={() => setShowEntry(false)}
            onSaved={async () => { await reloadAnalytics(token); setShowEntry(false) }}
          />
        )}

        {mine.length === 0 ? (
          <EmptyState isAdminView={isAdminView} />
        ) : (
          <>
            {/* Vela carousel — on top. The chart fills the whole card as one
                sky image; tabs + dots float on top. */}
            <div className="glass-card-static jivan-card-3d rounded-2xl overflow-hidden mb-3 animate-fadeInUp">
              <div className="px-3 py-2" style={{ background: VELA_HEADER }}>
                <span className="font-bold text-sm" style={{ color: VELA_HEADER_TEXT }}>🌗 ਵੇਲਾ</span>
                <span className="text-xs ml-2" style={{ color: VELA_HEADER_TEXT, opacity: 0.75 }}>ਸ਼ੁਰੂ ਕਰਨ ਦਾ ਸਮਾਂ</span>
              </div>
              <Carousel accent="#ffffff" tabBg={velaTopColor} dotBg={velaBotColor} tabsOnDark={tabsOnDark} dotsOnDark={dotsOnDark} onActiveChange={setVelaActive} slides={[
                { key: 'amrit', label: '🌕 ਅੰਮ੍ਰਿਤ ਵੇਲਾ', content: <VelaChart points={amritPoints} yMin={0} yMax={amritMax} sky /> },
                { key: 'sandhya', label: '🌅 ਸੰਧਿਆ ਵੇਲਾ', content: <VelaChart points={sandhyaPoints} yMin={sandhyaMin} yMax={sandhyaMax} sky /> },
              ]} />
            </div>

            {/* Per-category cards */}
            {ORDERED_CATS.map(cat => {
              const color = CAT_COLOR[cat.key]
              const calendarOnly = cat.key === 'japji' || cat.key === 'sewa'
              const linePoints = range.map(ds => ({
                label: shortLabel(ds),
                you: byDate[ds]?.[cat.key] ?? null,
                top: dailyMax[ds]?.[cat.key] ?? null,
              }))

              const calendar = (
                <div className="space-y-5">
                  {months.map(({ y, m }) => (
                    <CalendarHeatmap key={`${y}-${m}`} year={y} month={m} stateForDate={ds => dayState(byDate[ds], cat)}
                      legendStates={cat.key === 'sewa' ? ['done', 'miss', 'blank'] : undefined} />
                  ))}
                </div>
              )

              const graph = (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'rgba(12,36,64,0.5)' }}>ਤੁਸੀਂ ਬਨਾਮ ਸਿਖਰ</p>
                  <LineChart points={linePoints} height={130} />
                </div>
              )

              return (
                <div key={cat.key} className="glass-card-static jivan-card-3d rounded-2xl overflow-hidden mb-3 animate-fadeInUp">
                  <div className="px-3 py-2 flex items-center justify-between" style={{ background: color.bg }}>
                    <span className="font-bold text-sm" style={{ color: color.text }}>{cat.emoji} {cat.label}</span>
                  </div>
                  <div className="p-3">
                    {calendarOnly ? calendar : graph}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ isAdminView }) {
  return (
    <div className="glass-card-static rounded-2xl p-10 text-center animate-fadeInUp">
      <div className="text-5xl mb-3">🌱</div>
      <p className="font-medium mb-1" style={{ color: '#0c2540' }}>ਅਜੇ ਕੋਈ ਡਾਟਾ ਨਹੀਂ</p>
      <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>
        {isAdminView ? 'ਇਸ ਵਰਤੋਂਕਾਰ ਦਾ ਕੋਈ ਰਿਕਾਰਡ ਨਹੀਂ ਮਿਲਿਆ' : 'ਜਦੋਂ ਤੁਹਾਡੀ ਹਫ਼ਤਾਵਾਰੀ ਰਿਪੋਰਟ ਜੁੜੇਗੀ, ਇੱਥੇ ਵਿਸ਼ਲੇਸ਼ਣ ਦਿਖੇਗਾ'}
      </p>
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
