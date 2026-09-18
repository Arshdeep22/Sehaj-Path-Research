'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const email = `${username.trim().toLowerCase()}@sehajpath.local`

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('ਵਰਤੋਂਕਾਰ ਨਾਮ ਜਾਂ ਪਾਸਵਰਡ ਗਲਤ ਹੈ')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, must_change_password')
      .eq('id', data.user.id)
      .single()

    setLoading(false)

    if (profile?.must_change_password) {
      router.push('/change-password')
    } else if (profile?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/topics')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fadeInUp">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(245,158,11,0.1) 100%)',
              border: '1px solid rgba(245,158,11,0.3)',
              boxShadow: '0 0 40px rgba(124,58,237,0.3), 0 0 60px rgba(245,158,11,0.1)',
            }}>
            <span className="text-4xl ik-onkar">ੴ</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Noto Sans Gurmukhi' }}>
            ਸਹਿਜ ਪਾਠ ਖੋਜ
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਦੀ ਸਾਂਝੀ ਵਿਚਾਰ
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card-static rounded-2xl p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                ਵਰਤੋਂਕਾਰ ਨਾਮ
              </label>
              <input
                type="text"
                className="input-royal"
                placeholder="ਆਪਣਾ ਨਾਮ ਲਿਖੋ"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                ਪਾਸਵਰਡ
              </label>
              <input
                type="password"
                className="input-royal"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-royal w-full text-base py-4 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  ਲੌਗਇਨ ਹੋ ਰਿਹਾ ਹੈ...
                </span>
              ) : 'ਲੌਗਇਨ ਕਰੋ'}
            </button>
          </form>
        </div>

        {/* Decorative bottom text */}
        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
          ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ? ਪ੍ਰਬੰਧਕ ਨਾਲ ਸੰਪਰਕ ਕਰੋ
        </p>
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
