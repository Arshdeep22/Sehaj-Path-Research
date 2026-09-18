'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (pw1.length < 6) return setError('ਪਾਸਵਰਡ ਘੱਟੋ-ਘੱਟ 6 ਅੱਖਰਾਂ ਦਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ')
    if (pw1 !== pw2) return setError('ਪਾਸਵਰਡ ਮੇਲ ਨਹੀਂ ਖਾਂਦੇ')
    if (pw1 === '131313') return setError('ਕਿਰਪਾ ਕਰਕੇ ਨਵਾਂ ਪਾਸਵਰਡ ਚੁਣੋ')

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password: pw1 })
    if (updateError) {
      setError('ਪਾਸਵਰਡ ਬਦਲਣ ਵਿੱਚ ਅਸਫਲਤਾ')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    router.push(profile?.role === 'admin' ? '/admin' : '/topics')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fadeInUp">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(245,158,11,0.1) 100%)',
              border: '1px solid rgba(245,158,11,0.3)',
              boxShadow: '0 0 30px rgba(124,58,237,0.3)',
            }}>
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">ਪਾਸਵਰਡ ਬਦਲੋ</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            ਪਹਿਲੀ ਵਾਰ ਲੌਗਇਨ — ਨਵਾਂ ਪਾਸਵਰਡ ਸੈੱਟ ਕਰੋ
          </p>
        </div>

        <div className="glass-card-static rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                ਨਵਾਂ ਪਾਸਵਰਡ
              </label>
              <input
                type="password"
                className="input-royal"
                placeholder="ਘੱਟੋ-ਘੱਟ 6 ਅੱਖਰ"
                value={pw1}
                onChange={e => setPw1(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                ਪਾਸਵਰਡ ਦੁਬਾਰਾ ਲਿਖੋ
              </label>
              <input
                type="password"
                className="input-royal"
                placeholder="••••••••"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-royal w-full py-4 text-base">
              {loading ? 'ਸੁਰੱਖਿਅਤ ਹੋ ਰਿਹਾ ਹੈ...' : 'ਸੁਰੱਖਿਅਤ ਕਰੋ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
