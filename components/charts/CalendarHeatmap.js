'use client'

// Month calendar heatmap for one category.
// State per day: 'done' (met daily target) · 'partial' (reported, below target)
//                'miss' (reported zero) · 'blank' (no message that day)
// Colours are the reserved status palette, not a series hue.

const STATE_STYLE = {
  done:    { bg: '#15803d', fg: '#ffffff', label: 'ਪੂਰਾ' },
  partial: { bg: '#f59e0b', fg: '#3a2a00', label: 'ਘੱਟ' },
  miss:    { bg: '#dc2626', fg: '#ffffff', label: 'ਨਹੀਂ ਕੀਤਾ' },
  blank:   { bg: 'rgba(12,36,64,0.06)', fg: 'rgba(12,36,64,0.3)', label: 'ਕੋਈ ਸੁਨੇਹਾ ਨਹੀਂ' },
}

const WEEKDAYS = ['ਐ', 'ਸੋ', 'ਮੰ', 'ਬੁ', 'ਵੀ', 'ਸ਼ੁ', 'ਸ਼']  // Sun..Sat

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startPad = first.getDay()           // 0=Sun
  const daysIn = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CalendarHeatmap({ year, month, stateForDate, legendStates = ['done', 'partial', 'miss', 'blank'] }) {
  const cells = monthGrid(year, month)
  const monthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const today = toLocalDateStr(new Date())

  return (
    <div>
      <p className="text-xs font-semibold mb-2 text-center" style={{ color: 'rgba(12,36,64,0.55)' }}>{monthName}</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center" style={{ fontSize: '10px', color: 'rgba(12,36,64,0.4)' }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const ds = toLocalDateStr(d)
          const state = stateForDate(ds)
          const st = STATE_STYLE[state] || STATE_STYLE.blank
          const isToday = ds === today
          return (
            <div key={i}
              title={`${d.getDate()} — ${st.label}`}
              className="flex items-center justify-center rounded-md"
              style={{
                aspectRatio: '1 / 1',
                background: st.bg,
                color: st.fg,
                fontSize: '11px',
                fontWeight: isToday ? 800 : 500,
                boxShadow: isToday ? '0 0 0 2px #1a5f8f' : 'none',
              }}>
              {d.getDate()}
            </div>
          )
        })}
      </div>
      {/* Status legend — identity never by colour alone */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
        {legendStates.map(k => (
          <span key={k} className="inline-flex items-center gap-1" style={{ fontSize: '10px', color: 'rgba(12,36,64,0.5)' }}>
            <span className="inline-block rounded" style={{ width: 10, height: 10, background: STATE_STYLE[k].bg }} />
            {STATE_STYLE[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
