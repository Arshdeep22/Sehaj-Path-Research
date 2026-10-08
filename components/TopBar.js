'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import { clearCache } from '../lib/clientCache'
import { registerServiceWorker, enablePush, disablePush, notificationPermission, pushSupported } from '../lib/push'

export default function TopBar({ profile }) {
  const router = useRouter()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const [pushState, setPushState] = useState('unknown')   // unknown | default | granted | denied | unsupported
  const [pushOn, setPushOn] = useState(false)             // is there an active subscription
  const [pushNote, setPushNote] = useState('')            // transient hint under the bell
  const pendingRef = useRef(0)   // views applied locally before the next count fetch

  async function handleLogout() {
    clearCache()
    await supabase.auth.signOut()
    router.push('/')
  }

  const isAdmin = profile?.role === 'admin'

  // Register the service worker, reflect current state, and auto-prompt once.
  // After that first automatic ask, the bell tap re-triggers the prompt on demand.
  useEffect(() => {
    if (!profile?.id) return
    if (!pushSupported()) { setPushState('unsupported'); return }
    registerServiceWorker()
    const perm = notificationPermission()
    setPushState(perm)

    if (perm === 'granted') {
      enablePush().then(res => setPushOn(res.ok))   // keep subscription fresh
    } else if (perm === 'default' && !localStorage.getItem('push:auto-asked')) {
      // First authenticated visit → prompt automatically (once per browser)
      localStorage.setItem('push:auto-asked', '1')
      enablePush().then(res => {
        setPushState(res.ok ? 'granted' : (res.reason === 'denied' ? 'denied' : notificationPermission()))
        setPushOn(res.ok)
      })
    }
  }, [profile?.id])

  // Toggle notifications on/off (bell is always available so users can change their mind)
  async function handleTogglePush() {
    setPushNote('')
    if (pushOn) {
      await disablePush()
      setPushOn(false)
      return
    }
    if (notificationPermission() === 'denied') {
      // Browser blocks programmatic re-enable — must be changed in site settings
      setPushNote('ਸੂਚਨਾਵਾਂ ਬ੍ਰਾਊਜ਼ਰ ਸੈਟਿੰਗ ਵਿੱਚ ਬੰਦ ਹਨ। ਸਾਈਟ ਸੈਟਿੰਗ ਤੋਂ ਚਾਲੂ ਕਰੋ।')
      setPushState('denied')
      setTimeout(() => setPushNote(''), 5000)
      return
    }
    const res = await enablePush()
    setPushState(res.ok ? 'granted' : (res.reason === 'denied' ? 'denied' : notificationPermission()))
    setPushOn(res.ok)
    if (!res.ok && res.reason === 'denied') {
      setPushNote('ਸੂਚਨਾਵਾਂ ਬ੍ਰਾਊਜ਼ਰ ਸੈਟਿੰਗ ਵਿੱਚ ਬੰਦ ਹਨ। ਸਾਈਟ ਸੈਟਿੰਗ ਤੋਂ ਚਾਲੂ ਕਰੋ।')
      setTimeout(() => setPushNote(''), 5000)
    }
  }

  // Unread shabads = total shabads the user hasn't viewed yet (feed badge)
  useEffect(() => {
    if (!profile?.id || isAdmin) return
    let cancelled = false
    pendingRef.current = 0   // a fresh fetch reflects the latest server truth
    async function countUnread() {
      const [{ count: total }, { count: viewed }] = await Promise.all([
        supabase.from('shabads').select('id', { count: 'exact', head: true }),
        supabase.from('shabad_views').select('shabad_id', { count: 'exact', head: true }).eq('user_id', profile.id),
      ])
      if (!cancelled) setUnread(Math.max(0, (total || 0) - (viewed || 0) - pendingRef.current))
    }
    countUnread()
    return () => { cancelled = true }
  }, [profile?.id, isAdmin, pathname])

  // Decrement live as the feed marks cards viewed — no extra API call
  useEffect(() => {
    function onViewed() {
      pendingRef.current += 1
      setUnread(n => Math.max(0, n - 1))
    }
    window.addEventListener('shabad:viewed', onViewed)
    return () => window.removeEventListener('shabad:viewed', onViewed)
  }, [])

  const navLinks = isAdmin
    ? [
        { href: '/admin', label: 'ਡੈਸ਼ਬੋਰਡ', Icon: DashboardIcon },
        { href: '/admin/topics', label: 'ਵਿਸ਼ੇ', Icon: TopicsIcon },
        { href: '/admin/chat-report', label: 'ਜਾਪ', Icon: ChatReportIcon },
        { href: '/leaderboard', label: 'ਸਰਵੋਤਮ', Icon: LeaderboardIcon },
      ]
    : [
        { href: '/topics', label: 'ਵਿਸ਼ੇ', Icon: TopicsIcon },
        { href: '/prashan', label: 'ਪ੍ਰਸ਼ਨ', Icon: QuestionIcon },
        { href: '/jhalak', label: 'ਸਾਂਝ', Icon: JhalakIcon, badge: unread },
        { href: '/leaderboard', label: 'ਸਰਵੋਤਮ', Icon: LeaderboardIcon },
      ]

  return (
    <>
      {/* Compact top header */}
      <div className="topbar">
        <Link href={isAdmin ? '/admin' : '/topics'} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.08))',
              border: '1px solid rgba(245,158,11,0.3)',
              boxShadow: '0 2px 10px rgba(14,65,110,0.1)',
            }}>
            <span className="text-lg ik-onkar">ੴ</span>
          </div>
          <span className="text-sm font-semibold" style={{ color: '#0c2540', fontFamily: 'Noto Sans Gurmukhi' }}>
            ਸਹਿਜ ਪਾਠ ਖੋਜ
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {profile?.role !== 'admin' && (
            <div className="score-badge py-1.5 px-3">
              <span className="text-sm">✦</span>
              <span className="text-sm font-bold">{profile?.score || 0}</span>
            </div>
          )}

          {profile && pushState !== 'unsupported' && (
            <div className="relative">
              <button
                onClick={handleTogglePush}
                title={pushOn ? 'ਸੂਚਨਾਵਾਂ ਬੰਦ ਕਰੋ' : 'ਸੂਚਨਾਵਾਂ ਚਾਲੂ ਕਰੋ'}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={pushOn
                  ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }
                  : { background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.12)' }}
              >
                <BellIcon muted={!pushOn} on={pushOn} />
              </button>
              {pushNote && (
                <div className="absolute right-0 mt-2 px-3 py-2 rounded-xl text-xs z-50"
                  style={{
                    top: '100%', width: 200, color: '#0c2540',
                    background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(14,65,110,0.15)',
                    boxShadow: '0 8px 24px rgba(14,65,110,0.14)',
                  }}>
                  {pushNote}
                </div>
              )}
            </div>
          )}

          {profile && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
              {(profile.full_name || profile.username || 'U')[0].toUpperCase()}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="text-xs px-3 py-2 rounded-lg transition-all"
            style={{ color: 'rgba(12,36,64,0.6)', background: 'rgba(14,65,110,0.07)', border: '1px solid rgba(14,65,110,0.12)' }}>
            ਬਾਹਰ
          </button>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav className="bottom-nav">
        {navLinks.map(({ href, label, Icon, badge }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} className={`bottom-nav-item ${active ? 'active' : ''}`}>
              <span className="nav-icon-wrap">
                <Icon active={active} />
                {badge > 0 && (
                  <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>
                )}
              </span>
              <span className="bottom-nav-label">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

function TopicsIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function LeaderboardIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function ChatReportIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function DashboardIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
    </svg>
  )
}

function JhalakIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="13" y2="14" />
    </svg>
  )
}

function QuestionIcon({ active }) {
  const c = active ? '#1a5f8f' : 'rgba(12,36,64,0.4)'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function BellIcon({ muted, on }) {
  const c = on ? '#d97706' : 'rgba(12,36,64,0.5)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'rgba(245,158,11,0.25)' : 'none'} stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}
