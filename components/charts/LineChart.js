'use client'

import { useState } from 'react'

// Two-series day-wise line chart used for every category: your value (blue) vs
// that day's highest value across everyone (golden). One y-axis, connected dots,
// legend + hover crosshair. Matches the vela chart's blue/golden theme.
// points: [{ label, you (null|number), top (null|number) }]

const C = { you: '#1a5f8f', top: '#b8860b' }

export default function LineChart({ points, height = 170, topLabel = 'ਸਿਖਰ' }) {
  const [hover, setHover] = useState(null)
  const W = 320, H = height
  const padL = 36, padR = 12, padT = 14, padB = 20
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const vals = points.flatMap(p => [p.you, p.top]).filter(v => v !== null && v !== undefined)
  const maxV = Math.max(1, ...vals)
  const n = points.length

  const x = i => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = v => padT + plotH - (v / maxV) * plotH

  function path(key) {
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

  const yTicks = [0, maxV / 2, maxV]
  const fmt = v => v >= 1000 ? `${Math.round(v / 1000)}k` : (Number.isInteger(v) ? v : v.toFixed(1))

  return (
    <div>
      {/* Legend */}
      <div className="flex gap-3 mb-1 justify-end">
        <span className="inline-flex items-center gap-1" style={{ fontSize: '10px', color: 'rgba(12,36,64,0.6)' }}>
          <span style={{ width: 14, height: 2, background: C.you, display: 'inline-block' }} /> ਤੁਸੀਂ
        </span>
        <span className="inline-flex items-center gap-1" style={{ fontSize: '10px', color: 'rgba(12,36,64,0.6)' }}>
          <span style={{ width: 14, height: 2, background: C.top, display: 'inline-block' }} /> {topLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ touchAction: 'none', display: 'block' }}
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove} onTouchMove={handleMove}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="rgba(12,36,64,0.08)" strokeWidth="1" />
            <text x={padL - 5} y={y(t) + 3} textAnchor="end" style={{ fontSize: '9px', fill: 'rgba(12,36,64,0.4)' }}>{fmt(t)}</text>
          </g>
        ))}

        {/* day's high (golden) under */}
        <path d={path('top')} fill="none" stroke={C.top} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        {/* you (blue) on top */}
        <path d={path('you')} fill="none" stroke={C.you} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* dots — your dot gets a white ring so it stays visible when it equals the high */}
        {points.map((p, i) => (
          <g key={i}>
            {p.top != null && <circle cx={x(i)} cy={y(p.top)} r="2.6" fill={C.top} />}
            {p.you != null && <circle cx={x(i)} cy={y(p.you)} r="3.2" fill={C.you} stroke="#fff" strokeWidth="1" />}
          </g>
        ))}

        {hover !== null && points[hover] && (
          <>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="rgba(12,36,64,0.2)" strokeWidth="1" />
            {points[hover].top != null && <circle cx={x(hover)} cy={y(points[hover].top)} r="4" fill={C.top} stroke="#fff" strokeWidth="1.5" />}
            {points[hover].you != null && <circle cx={x(hover)} cy={y(points[hover].you)} r="4" fill={C.you} stroke="#fff" strokeWidth="1.5" />}
          </>
        )}
      </svg>

      {hover !== null && points[hover] && (
        <div className="text-center mt-1" style={{ fontSize: '11px', color: 'rgba(12,36,64,0.7)' }}>
          <span className="font-semibold">{points[hover].label}</span>
          {' · '}<span style={{ color: C.you }}>ਤੁਸੀਂ: {points[hover].you ?? '—'}</span>
          {'  '}<span style={{ color: C.top }}>{topLabel}: {points[hover].top ?? '—'}</span>
        </div>
      )}
    </div>
  )
}
