'use client'

import { useState, useEffect } from 'react'
import { CATEGORY_DAILY } from '../lib/jaapParser'

// Ordered the same as the Jivan cards.
const FORM_ORDER = ['gurmantar', 'sewa', 'brahmkavach', 'birharhe', 'japji', 'sehajpath']
const CATS = FORM_ORDER.map(k => CATEGORY_DAILY.find(c => c.key === k)).filter(Boolean)
const UNIT = { gurmantar: 'ਗਿਣਤੀ', brahmkavach: 'ਗਿਣਤੀ', birharhe: 'ਗਿਣਤੀ', japji: 'ਵਾਰ', sehajpath: 'ਮਿੰਟ' }

function minToTime(m) {
  if (m == null) return ''
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function timeToMin(s) {
  if (!s) return null
  const [h, mm] = s.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (mm || 0)
}

export default function JaapEntryModal({ token, byDate, defaultDate, onClose, onSaved }) {
  const [date, setDate] = useState(defaultDate)
  const [vals, setVals] = useState({})
  const [amrit, setAmrit] = useState('')
  const [sandhya, setSandhya] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const existing = !!byDate[date]

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const html = document.documentElement, body = document.body
    const prevHtml = html.style.overflow, prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => { html.style.overflow = prevHtml; body.style.overflow = prevBody }
  }, [])

  useEffect(() => {
    const row = byDate[date]
    const v = {}
    for (const c of CATEGORY_DAILY) v[c.key] = row && row[c.key] != null ? String(row[c.key]) : ''
    setVals(v)
    setAmrit(minToTime(row?.amrit_vela_min))
    setSandhya(minToTime(row?.sandhya_vela_min))
  }, [date, byDate])

  const today = new Date().toISOString().slice(0, 10)

  async function save() {
    setSaving(true); setErr(null)
    const body = {
      report_date: date,
      amrit_vela_min: timeToMin(amrit), amrit_vela_raw: amrit || null,
      sandhya_vela_min: timeToMin(sandhya), sandhya_vela_raw: sandhya || null,
    }
    for (const c of CATEGORY_DAILY) {
      const raw = vals[c.key]
      body[c.key] = raw === '' || raw == null ? null : Number(raw)
    }
    try {
      const res = await fetch('/api/jaap/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'ਸੰਭਾਲਣ ਵਿੱਚ ਗਲਤੀ'); setSaving(false); return }
      onSaved()
    } catch {
      setErr('ਨੈੱਟਵਰਕ ਗਲਤੀ'); setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, overscrollBehavior: 'contain' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: '#0c2540' }}>ਹਾਜ਼ਰੀ ਜੋੜੋ</h2>
          <button onClick={onClose} aria-label="close" className="text-xl leading-none" style={{ color: 'rgba(12,36,64,0.5)' }}>✕</button>
        </div>

        <label className="block mb-4">
          <span className="text-xs font-semibold" style={{ color: 'rgba(12,36,64,0.6)' }}>ਤਾਰੀਖ਼</span>
          <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl text-sm"
            style={{ border: '1px solid rgba(14,65,110,0.18)', background: 'rgba(255,255,255,0.7)' }} />
          {existing && <span className="text-xs" style={{ color: '#0e7490' }}>ਇਸ ਦਿਨ ਦਾ ਰਿਕਾਰਡ ਮੌਜੂਦ ਹੈ — ਸੋਧਿਆ ਜਾਵੇਗਾ</span>}
        </label>

        <div className="space-y-2.5">
          {CATS.map(c => (
            <div key={c.key} className="flex items-center gap-3">
              <span className="text-sm flex-1" style={{ color: '#0c2540' }}>{c.emoji} {c.label}</span>
              {c.key === 'sewa' ? (
                <div className="flex gap-1">
                  {[['1', 'ਹਾਂ'], ['0', 'ਨਹੀਂ']].map(([val, lbl]) => {
                    const on = (Number(vals.sewa) > 0 ? '1' : vals.sewa === '0' ? '0' : '') === val
                    return (
                      <button key={val} onClick={() => setVals(s => ({ ...s, sewa: val }))}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{
                          background: on ? '#15803d' : 'rgba(12,36,64,0.05)',
                          color: on ? '#fff' : 'rgba(12,36,64,0.55)',
                          border: `1px solid ${on ? '#15803d' : 'rgba(12,36,64,0.12)'}`,
                        }}>{lbl}</button>
                    )
                  })}
                </div>
              ) : (
                <input type="number" inputMode="decimal" min="0" step={c.key === 'japji' ? '0.5' : '1'}
                  value={vals[c.key] ?? ''} placeholder="0"
                  onChange={e => setVals(s => ({ ...s, [c.key]: e.target.value }))}
                  className="w-28 px-3 py-1.5 rounded-lg text-sm text-right"
                  style={{ border: '1px solid rgba(14,65,110,0.18)', background: 'rgba(255,255,255,0.7)' }} />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3">
            <span className="text-sm flex-1" style={{ color: '#0c2540' }}>🌕 ਅੰਮ੍ਰਿਤ ਵੇਲਾ</span>
            <input type="time" value={amrit} onChange={e => setAmrit(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: '1px solid rgba(14,65,110,0.18)', background: 'rgba(255,255,255,0.7)' }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm flex-1" style={{ color: '#0c2540' }}>🌅 ਸੰਧਿਆ ਵੇਲਾ</span>
            <input type="time" value={sandhya} onChange={e => setSandhya(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: '1px solid rgba(14,65,110,0.18)', background: 'rgba(255,255,255,0.7)' }} />
          </div>
        </div>

        {err && <p className="text-sm mt-3" style={{ color: '#dc2626' }}>{err}</p>}

        <button onClick={save} disabled={saving}
          className="w-full mt-5 py-2.5 rounded-xl font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #2a84c7 100%)', boxShadow: '0 4px 14px rgba(56,189,248,0.35)', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'ਸੰਭਾਲ ਰਿਹਾ...' : 'ਸੰਭਾਲੋ'}
        </button>
      </div>
    </div>
  )
}
