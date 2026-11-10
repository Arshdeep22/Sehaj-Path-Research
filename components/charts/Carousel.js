'use client'

import { useRef, useState, useEffect } from 'react'

// Swipeable, scroll-snapping carousel with tab labels + dots.
// The viewport height follows the ACTIVE slide so a short slide (e.g. a graph)
// doesn't inherit empty space from a taller one (e.g. a calendar).
// slides: [{ key, label, content }]  — first slide is the default view.
// tabsOnDark / dotsOnDark style the tabs (top) and dots (bottom) light-on-dark.
// tabBg / dotBg paint the tab/dot strips a solid colour (flush with the slide)
// so a full-bleed gradient slide reads as one continuous image without the
// controls overlapping its content. onActiveChange(i) fires on every change.
export default function Carousel({ slides, accent = '#1a5f8f', tabsOnDark = false, dotsOnDark = false, tabBg, dotBg, onActiveChange }) {
  const trackRef = useRef(null)
  const slideRefs = useRef([])
  const [active, setActive] = useState(0)
  const [height, setHeight] = useState()

  useEffect(() => { onActiveChange?.(active) }, [active, onActiveChange])

  function goTo(i) {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })
    setActive(i)
  }

  function onScroll() {
    const track = trackRef.current
    if (!track) return
    const i = Math.round(track.scrollLeft / track.clientWidth)
    if (i !== active) setActive(i)
  }

  // Track the active slide's height (and keep it in sync as content/layout changes).
  useEffect(() => {
    const el = slideRefs.current[active]
    if (!el) return
    const update = () => setHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [active, slides.length])

  // Keep the active slide aligned if the width changes (orientation, resize)
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onResize = () => track.scrollTo({ left: active * track.clientWidth })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  const tabs = (
    <div className="flex gap-2" style={{ background: tabBg, padding: tabBg ? '10px 12px 8px' : undefined, marginBottom: tabBg ? 0 : 12 }}>
      {slides.map((s, i) => (
        <button key={s.key} onClick={() => goTo(i)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={tabsOnDark ? {
            background: active === i ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${active === i ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)'}`,
            color: active === i ? '#fff' : 'rgba(255,255,255,0.75)',
          } : {
            background: active === i ? `${accent}1a` : 'rgba(255,255,255,0.55)',
            border: `1px solid ${active === i ? `${accent}44` : 'rgba(12,36,64,0.12)'}`,
            color: active === i ? (accent === '#ffffff' ? '#0c2540' : accent) : 'rgba(12,36,64,0.6)',
          }}>
          {s.label}
        </button>
      ))}
    </div>
  )

  const dots = slides.length > 1 && (
    <div className="flex justify-center gap-1.5" style={{ background: dotBg, padding: dotBg ? '8px 0 10px' : undefined, marginTop: dotBg ? 0 : 12 }}>
      {slides.map((s, i) => (
        <button key={s.key} onClick={() => goTo(i)} aria-label={s.label}
          style={{
            width: active === i ? 18 : 7, height: 7, borderRadius: 4,
            background: active === i ? (dotsOnDark ? '#fff' : accent === '#ffffff' ? '#0c2540' : accent) : (dotsOnDark ? 'rgba(255,255,255,0.35)' : 'rgba(12,36,64,0.2)'),
            transition: 'all 0.2s',
          }} />
      ))}
    </div>
  )

  const track = (
    <div ref={trackRef} onScroll={onScroll} data-hswipe
      className="flex overflow-x-auto items-start"
      style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'hidden', height, transition: 'height 0.2s ease' }}>
      {slides.map((s, i) => (
        <div key={s.key} ref={el => (slideRefs.current[i] = el)}
          className="w-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
          {s.content}
        </div>
      ))}
    </div>
  )

  return (
    <div>
      {tabs}
      {track}
      {dots}
    </div>
  )
}

