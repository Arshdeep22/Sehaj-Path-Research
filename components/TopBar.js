'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

export default function TopBar({ profile }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isAdmin = profile?.role === 'admin'

  const navLinks = isAdmin
    ? [
        { href: '/admin', label: 'ਡੈਸ਼ਬੋਰਡ', Icon: DashboardIcon },
        { href: '/admin/topics', label: 'ਵਿਸ਼ੇ', Icon: TopicsIcon },
        { href: '/leaderboard', label: 'ਸਰਵੋਤਮ', Icon: LeaderboardIcon },
      ]
    : [
        { href: '/topics', label: 'ਵਿਸ਼ੇ', Icon: TopicsIcon },
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
        {navLinks.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} className={`bottom-nav-item ${active ? 'active' : ''}`}>
              <Icon active={active} />
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
