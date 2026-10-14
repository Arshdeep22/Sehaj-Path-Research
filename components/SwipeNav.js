'use client'

import { useEffect, useRef, startTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const TABS = ['/topics', '/prashan', '/jhalak', '/leaderboard']
const THRESHOLD = 0.38

export default function SwipeNav() {
  const pathname = usePathname()
  const router = useRouter()
  const idxRef = useRef(-1)
  idxRef.current = TABS.indexOf(pathname)

  // Pre-warm adjacent tab iframes + prefetch RSC payloads.
  // iframes are appended to <body> at z-index 2; the outer topbar/bottom-nav
  // are in the z-index:10 stacking context and paint on top, masking the inner nav.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.self !== window.top) return  // never nest iframes

    const idx = TABS.indexOf(pathname)
    if (idx === -1) return

    // Prefetch RSC payloads so navigation is instant after the swipe
    if (idx > 0) router.prefetch(TABS[idx - 1])
    if (idx < TABS.length - 1) router.prefetch(TABS[idx + 1])

    const frames = []
    let idleHandle = null

    function makeFrame(url, initialX) {
      const f = document.createElement('iframe')
      f.src = `${url}?_embed=1`
      f.setAttribute('data-adjacent', url)
      Object.assign(f.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        border: 'none',
        zIndex: '2',          // below .relative.z-10 (z-index 10) but above body bg
        pointerEvents: 'none',
        transform: `translateX(${initialX}px)`,
        transition: 'none',
        willChange: 'transform',
      })
      document.body.appendChild(f)
      frames.push(f)
    }

    const w = window.innerWidth
    const rIC = window.requestIdleCallback || (cb => setTimeout(cb, 200))
    const cIC = window.cancelIdleCallback || clearTimeout

    // Defer iframe creation to idle time so it doesn't slow down the main page render
    idleHandle = rIC(() => {
      if (idx > 0) makeFrame(TABS[idx - 1], -w)
      if (idx < TABS.length - 1) makeFrame(TABS[idx + 1], w)
    }, { timeout: 1500 })

    return () => {
      cIC(idleHandle)
      frames.forEach(f => { if (f.parentNode) document.body.removeChild(f) })
    }
  }, [pathname, router])

  // Gesture handler — runs once, queries iframes by data-adjacent attribute
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.self !== window.top) return

    const root = document.documentElement
    const g = { startX: 0, startY: 0, on: false, locked: false, dir: null }
    let snapTimer = null

    function setX(x) { root.style.setProperty('--swipe-x', `${x}px`) }

    function getFrame(url) {
      return document.querySelector(`iframe[data-adjacent="${url}"]`)
    }

    // Iframe mirrors the current page: one full screen-width offset from it
    function moveFrame(frame, dx) {
      if (!frame) return
      const w = window.innerWidth
      frame.style.transition = 'none'
      frame.style.transform = `translateX(${g.dir === 'forward' ? w + dx : -w + dx}px)`
    }

    function snapFrameTo(frame, targetDx) {
      if (!frame) return
      const w = window.innerWidth
      frame.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)'
      frame.style.transform = `translateX(${g.dir === 'forward' ? w + targetDx : -w + targetDx}px)`
    }

    function clearGesture() {
      root.removeAttribute('data-swiping')
      root.removeAttribute('data-snap')
      setX(0)
      g.dir = null
    }

    function onStart(e) {
      if (snapTimer) return
      g.startX = e.touches[0].clientX
      g.startY = e.touches[0].clientY
      g.on = false; g.locked = false; g.dir = null
    }

    function onMove(e) {
      if (g.locked) return
      const dx = e.touches[0].clientX - g.startX
      const dy = e.touches[0].clientY - g.startY

      if (!g.on && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      if (!g.on && Math.abs(dy) >= Math.abs(dx)) { g.locked = true; return }

      const idx = idxRef.current
      if (idx === -1) { g.locked = true; return }
      if (dx < 0 && idx >= TABS.length - 1) { g.locked = true; return }
      if (dx > 0 && idx <= 0) { g.locked = true; return }

      if (!g.on) g.dir = dx < 0 ? 'forward' : 'back'
      g.on = true
      e.preventDefault()

      root.dataset.swiping = '1'
      root.removeAttribute('data-snap')
      setX(dx)

      const nextUrl = TABS[dx < 0 ? idx + 1 : idx - 1]
      moveFrame(getFrame(nextUrl), dx)
    }

    function onEnd(e) {
      if (!g.on) { clearGesture(); return }
      g.on = false

      const dx = e.changedTouches[0].clientX - g.startX
      const w = window.innerWidth
      const idx = idxRef.current

      if (Math.abs(dx) / w >= THRESHOLD) {
        const nextUrl = TABS[dx < 0 ? idx + 1 : idx - 1]
        const frame = getFrame(nextUrl)
        const finalX = dx < 0 ? -w : w

        root.removeAttribute('data-swiping')
        root.dataset.snap = '1'
        setX(finalX)
        snapFrameTo(frame, finalX)   // frame arrives at x=0 in sync with page exit

        snapTimer = setTimeout(() => {
          snapTimer = null
          // clearGesture() removes data-snap, which removes the transition rule, causing
          // .page-body/.feed-reel to jump from finalX back to x=0 instantly (one frame
          // flash). Hiding them first makes the jump invisible — new page nodes are fresh
          // DOM elements unaffected by these inline styles, so they fade in normally.
          document.querySelectorAll('.page-body, .feed-reel').forEach(el => {
            el.style.opacity = '0'
            el.style.transition = 'none'
          })
          root.dataset.navIn = g.dir
          clearGesture()
          startTransition(() => router.push(nextUrl))
          setTimeout(() => root.removeAttribute('data-nav-in'), 280)
        }, 240)
      } else {
        // Revert — snap both back
        const nextUrl = TABS[dx < 0 ? idx + 1 : idx - 1]
        const frame = getFrame(nextUrl)

        root.removeAttribute('data-swiping')
        root.dataset.snap = '1'
        setX(0)
        snapFrameTo(frame, 0)        // frame returns to its off-screen rest position

        snapTimer = setTimeout(() => {
          snapTimer = null
          clearGesture()
        }, 260)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      if (snapTimer) { clearTimeout(snapTimer); snapTimer = null }
      clearGesture()
    }
  }, [])

  return null
}
