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
        { href: '/admin', label: 'ਡੈਸ਼ਬੋਰਡ' },
        { href: '/admin/topics', label: 'ਵਿਸ਼ੇ' },
        { href: '/leaderboard', label: 'ਸਰਵੋਤਮ ਸੂਚੀ' },
      ]
    : [
        { href: '/topics', label: 'ਵਿਸ਼ੇ' },
        { href: '/leaderboard', label: 'ਸਰਵੋਤਮ ਸੂਚੀ' },
      ]

  return (
    <div className="topbar">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        <Link href={isAdmin ? '/admin' : '/topics'} className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.08))',
              border: '1px solid rgba(245,158,11,0.3)',
              boxShadow: '0 2px 12px rgba(14,65,110,0.1)',
            }}>
            <span className="text-xl ik-onkar">ੴ</span>
          </div>
          <span className="text-sm font-semibold hidden sm:block" style={{ color: '#0c2540', fontFamily: 'Noto Sans Gurmukhi' }}>
            ਸਹਿਜ ਪਾਠ ਖੋਜ
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-tab ${pathname === link.href ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Right: Score + User + Logout */}
      <div className="flex items-center gap-3">
        {profile && profile.role !== 'admin' && (
          <div className="score-badge hidden sm:flex">
            <span className="text-lg">✦</span>
            <span className="text-base font-bold">{profile.score || 0}</span>
            <span className="text-xs opacity-70">ਅੰਕ</span>
          </div>
        )}

        {profile && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(14,65,110,0.06)', border: '1px solid rgba(14,65,110,0.1)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #1a5f8f, #0c2540)', color: 'white' }}>
              {(profile.full_name || profile.username || 'U')[0].toUpperCase()}
            </div>
            <span className="text-sm font-medium" style={{ color: '#0c2540' }}>
              {profile.full_name || profile.username}
            </span>
          </div>
        )}

        <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">
          ਬਾਹਰ ਜਾਓ
        </button>
      </div>
    </div>
  )
}
