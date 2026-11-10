'use client'

import { useState } from 'react'
import { sunTimes, skyColorAt, skyStops, isDarkColor, nightAlpha } from '../../lib/sky'

// Start-of-sadhana time over the selected range, as two connected lines on a
// 24-hour clock axis: your time (blue) vs the best time by others (golden).
// "Best" = closest to 12am (midnight) → higher on the axis (earlier) is better.
// points: [{ label, you (min|null), best (min|null) }]
//
// sky=true renders the whole chart as one full-bleed sky image: the gradient
// (real sky colour per clock-time row, from India's sun times this month) fills
// the entire SVG, stars fade in only over genuinely-black rows, and the legend /
// tooltip live inside the SVG so there's no seam between "graph" and "card".

const STARS = [
  [0.07, 0.15, 0.9], [0.16, 0.55, 0.6], [0.24, 0.30, 1.1], [0.32, 0.72, 0.7],
  [0.40, 0.18, 0.8], [0.47, 0.60, 0.6], [0.55, 0.40, 1.0], [0.62, 0.80, 0.7],
  [0.70, 0.25, 0.9], [0.77, 0.65, 0.6], [0.85, 0.45, 1.0], [0.92, 0.72, 0.7],
  [0.12, 0.85, 0.6], [0.58, 0.12, 0.7], [0.88, 0.22, 0.8], [0.35, 0.48, 0.6],
]

function fmtClock(min) {
  if (min == null) return '—'
  let h = Math.floor(min / 60), m = min % 60
  const ap = h < 12 ? 'am' : 'pm'
  let hh = h % 12; if (hh === 0) hh = 12
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`
}

export default function VelaChart({ points, height = 190, bestLabel = 'ਸਭ ਤੋਂ ਵਧੀਆ', yMin = 0, yMax = 1440, sky = false }) {
  const [hover, setHover] = useState(null)
  const W = 320, H = height
  const padL = 46, padR = 14, padT = 36, padB = 42
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const n = points.length

  const sun = sunTimes(new Date())
  const gid = `sky-${Math.round(yMin)}-${Math.round(yMax)}`
  const C = sky ? { you: '#38b6ff', best: '#ffc93c' } : { you: '#1a5f8f', best: '#b8860b' }
  const grid = sky ? 'rgba(255,255,255,0.13)' : 'rgba(12,36,64,0.08)'
  const halo = 'rgba(3,8,24,0.55)'

  const x = i => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const span = Math.max(60, yMax - yMin)
  const y = min => padT + ((Math.max(yMin, Math.min(yMax, min)) - yMin) / span) * plotH  // yMin at top

  const step = Math.max(60, Math.round(span / 4 / 60) * 60)
  const ticks = []
  for (let t = yMin; t <= yMax + 1; t += step) ticks.push(t)
  if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax)

  const topDark = sky && isDarkColor(skyColorAt(yMin, sun))
  const topText = topDark ? 'rgba(255,255,255,0.92)' : 'rgba(12,36,64,0.82)'

  // Stars fade with the darkness of their row, so they only show over black sky.
  const stars = []
  if (sky) {
    STARS.forEach(([fx, fy, r], i) => {
      const minute = yMin + fy * (yMax - yMin)
      const a = nightAlpha(minute, sun)
      if (a > 0.12) stars.push({ cx: padL + fx * plotW, cy: y(minute), r, op: a * (0.55 + (i % 3) * 0.15) })
    })
  }

  function linePath(key) {
    let d = '', open = false
    points.forEach((p, i) => {
      const v = p[key]
      if (v === null || v === undefined) { open = false; return }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      open = true
    })
    return d.trim()
  }

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width * W
    let best = 0, bestD = Infinity
    points.forEach((p, i) => { const d = Math.abs(x(i) - px); if (d < bestD) { bestD = d; best = i } })
    setHover(best)
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ touchAction: 'none', display: 'block' }}
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove} onTouchMove={handleMove}>
        {sky && (
          <defs>
            {/* Mapped to the plot's time range; the flat end-colours extend into
                the top/bottom padding so the whole SVG is one continuous sky. */}
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1={padT} x2="0" y2={padT + plotH}>
              {skyStops(yMin, yMax, sun).map((s, i) => (
                <stop key={i} offset={`${(s.offset * 100).toFixed(1)}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
        )}
        {sky && <rect x="0" y="0" width={W} height={H} fill={`url(#${gid})`} />}

        {stars.map((s, i) => (
          <circle key={`st${i}`} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.op} />
        ))}

        {ticks.map((t, i) => {
          const lbl = fmtClock(t % 1440)
          const wpx = lbl.length * 4.8 + 10
          return (
            <g key={i}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={grid} strokeWidth="1" />
              {sky
                ? <>
                    <rect x={padL - 3 - wpx} y={y(t) - 6.5} width={wpx} height={13} rx={6.5} fill="rgba(8,12,28,0.42)" />
                    <text x={padL - 8} y={y(t) + 3} textAnchor="end" style={{ fontSize: '9px', fill: 'rgba(255,255,255,0.92)' }}>{lbl}</text>
                  </>
                : <text x={padL - 5} y={y(t) + 3} textAnchor="end" style={{ fontSize: '9px', fill: 'rgba(12,36,64,0.4)' }}>{lbl}</text>}
            </g>
          )
        })}

        {sky && <path d={linePath('best')} fill="none" stroke={halo} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />}
        {sky && <path d={linePath('you')} fill="none" stroke={halo} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />}
        <path d={linePath('best')} fill="none" stroke={C.best} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
        <path d={linePath('you')} fill="none" stroke={C.you} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={i}>
            {p.best != null && <circle cx={x(i)} cy={y(p.best)} r="2.6" fill={C.best} stroke={sky ? halo : 'none'} strokeWidth={sky ? 0.8 : 0} />}
            {p.you != null && <circle cx={x(i)} cy={y(p.you)} r="3.2" fill={C.you} stroke="#fff" strokeWidth="1" />}
          </g>
        ))}

        {/* Legend (hidden while hovering) */}
        {hover === null && (
          <g>
            <line x1={W - 158} y1="15" x2={W - 144} y2="15" stroke={C.you} strokeWidth="2" strokeLinecap="round" />
            <text x={W - 141} y="18" style={{ fontSize: '10px', fill: topText }}>ਤੁਸੀਂ</text>
            <line x1={W - 104} y1="15" x2={W - 90} y2="15" stroke={C.best} strokeWidth="2" strokeLinecap="round" />
            <text x={W - 87} y="18" style={{ fontSize: '10px', fill: topText }}>{bestLabel}</text>
          </g>
        )}

        {hover !== null && points[hover] && (
          <>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke={topDark ? 'rgba(255,255,255,0.45)' : 'rgba(12,36,64,0.3)'} strokeWidth="1" />
            {points[hover].best != null && <circle cx={x(hover)} cy={y(points[hover].best)} r="4" fill={C.best} stroke="#fff" strokeWidth="1.5" />}
            {points[hover].you != null && <circle cx={x(hover)} cy={y(points[hover].you)} r="4" fill={C.you} stroke="#fff" strokeWidth="1.5" />}
          </>
        )}
      </svg>

      {/* Hover detail — a dark pill so it reads over any part of the gradient */}
      {hover !== null && points[hover] && (
        <div style={{
          position: 'absolute', left: '50%', bottom: '22px', transform: 'translateX(-50%)',
          display: 'flex', gap: '8px', alignItems: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
          padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
          background: 'rgba(8,12,28,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}>
          <span style={{ fontWeight: 700, color: '#fff' }}>{points[hover].label}</span>
          <span style={{ color: C.you }}>ਤੁਸੀਂ {fmtClock(points[hover].you)}</span>
          <span style={{ color: C.best }}>{fmtClock(points[hover].best)}</span>
        </div>
      )}
    </div>
  )
}
