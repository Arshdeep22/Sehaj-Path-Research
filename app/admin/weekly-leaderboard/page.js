'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'
import TopBar from '../../../components/TopBar'

export default function WeeklyLeaderboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Manual-trigger state
  const [resetOn, setResetOn] = useState(false)       // reset toggle (false = backup only)
  const [showConfirm, setShowConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState(null)            // { kind: 'ok' | 'err', text }

  const fetchSnapshot = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/weekly-leaderboard', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error || 'ਡਾਟਾ ਲੋਡ ਨਹੀਂ ਹੋਇਆ')
      return
    }
    const { entries: rows, snapshotAt: ts } = await res.json()
    setEntries(rows || [])
    setSnapshotAt(ts)
    setError('')
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'admin') { router.push('/topics'); return }
      setProfile(prof)

      await fetchSnapshot()
      setLoading(false)
    }
    load()
  }, [router, fetchSnapshot])

  async function handleRun() {
    setRunning(true)
    setToast(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/weekly-leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ reset: resetOn }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setToast({ kind: 'err', text: err.error || 'ਕਾਰਵਾਈ ਅਸਫਲ ਰਹੀ' })
    } else {
      const data = await res.json()
      setToast({
        kind: 'ok',
        text: resetOn
          ? `ਸਨੈਪਸ਼ਾਟ ਲਿਆ ਗਿਆ (${data.snapshot}) ਅਤੇ ${data.resetCount} ਵਰਤੋਂਕਾਰਾਂ ਦੇ ਅੰਕ ਰੀਸੈੱਟ ਹੋਏ`
          : `ਸਨੈਪਸ਼ਾਟ ਲਿਆ ਗਿਆ (${data.snapshot}) — ਅੰਕ ਨਹੀਂ ਰੀਸੈੱਟ ਕੀਤੇ`,
      })
      await fetchSnapshot()
    }
    setShowConfirm(false)
    setRunning(false)
    setTimeout(() => setToast(null), 5000)
  }

  if (loading) return <LoadingScreen />

  const top3 = entries.slice(0, 3)
  const snapshotDate = snapshotAt
    ? new Date(snapshotAt).toLocaleString('pa-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="page-body">
      <TopBar profile={profile} />

      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/admin" className="inline-flex items-center gap-2 mb-4 text-sm transition-opacity"
          style={{ color: 'rgba(12,36,64,0.45)' }}>
          ← ਡੈਸ਼ਬੋਰਡ ਵੱਲ ਵਾਪਸ
        </Link>

        {/* Header */}
        <div className="text-center mb-6 animate-fadeInUp">
          <div className="text-5xl mb-3">📜</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#0c2540' }}>ਪਿਛਲੇ ਹਫ਼ਤੇ ਦੀ ਸਰਵੋਤਮ ਸੂਚੀ</h1>
          <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
            {snapshotDate
              ? <>ਸੁਰੱਖਿਅਤ: <span className="font-semibold" style={{ color: '#0c2540' }}>{snapshotDate}</span></>
              : 'ਅਜੇ ਕੋਈ ਡਾਟਾ ਨਹੀਂ ਸੁਰੱਖਿਅਤ ਹੈ'}
          </p>
        </div>

        {/* Manual trigger panel */}
        <div className="glass-card-static rounded-2xl p-5 mb-6 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-bold mb-1" style={{ color: '#0c2540' }}>ਮੈਨੂਅਲ ਸਨੈਪਸ਼ਾਟ</h3>
              <p className="text-sm" style={{ color: 'rgba(12,36,64,0.5)' }}>
                ਮੌਜੂਦਾ ਲੀਡਰਬੋਰਡ ਸੁਰੱਖਿਅਤ ਕਰੋ। ਟੌਗਲ ਚਾਲੂ ਹੋਵੇ ਤਾਂ ਸਾਰੇ ਅੰਕ ਵੀ ਰੀਸੈੱਟ ਹੋਣਗੇ।
              </p>
            </div>

            {/* Reset toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <span className="text-sm font-medium" style={{ color: '#0c2540' }}>ਅੰਕ ਰੀਸੈੱਟ ਕਰੋ</span>
              <span
                onClick={() => !running && setResetOn(v => !v)}
                className="relative inline-block transition-colors duration-200"
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: resetOn ? '#ef4444' : 'rgba(14,65,110,0.18)',
                  cursor: running ? 'not-allowed' : 'pointer',
                }}
              >
                <span
                  className="absolute top-0.5 transition-all duration-200"
                  style={{
                    left: resetOn ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </span>
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={running}
              className={resetOn ? 'btn-danger text-sm px-5 py-2.5' : 'btn-royal text-sm px-5 py-2.5'}
            >
              {running
                ? 'ਚੱਲ ਰਿਹਾ...'
                : resetOn ? '💾 ਸੁਰੱਖਿਅਤ ਕਰੋ + ਰੀਸੈੱਟ' : '💾 ਸੁਰੱਖਿਅਤ ਕਰੋ'}
            </button>
            {resetOn && (
              <span className="text-xs font-medium" style={{ color: '#dc2626' }}>
                ⚠ ਇਸ ਨਾਲ ਸਾਰੇ ਵਰਤੋਂਕਾਰਾਂ ਦੇ ਅੰਕ 0 ਹੋ ਜਾਣਗੇ
              </span>
            )}
          </div>

          {toast && (
            <div className="mt-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: toast.kind === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${toast.kind === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: toast.kind === 'ok' ? '#15803d' : '#dc2626',
              }}>
              {toast.text}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 mb-6 text-sm text-center"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {entries.length === 0 && !error && (
          <div className="glass-card-static rounded-2xl p-12 text-center animate-fadeInUp">
            <div className="text-5xl mb-3">🌱</div>
            <p className="font-medium mb-1" style={{ color: '#0c2540' }}>ਕੋਈ ਡਾਟਾ ਨਹੀਂ</p>
            <p className="text-sm" style={{ color: 'rgba(12,36,64,0.45)' }}>
              ਉਪਰ ਦਿੱਤੇ ਬਟਨ ਨਾਲ ਜਾਂ ਹਫ਼ਤਾਵਾਰੀ ਰੀਸੈੱਟ ਤੋਂ ਬਾਅਦ ਡਾਟਾ ਦਿਖਾਈ ਦੇਵੇਗਾ
            </p>
          </div>
        )}

        {/* Podium — only cards for users who actually scored */}
        {entries.length > 0 && (
          <div
            className={`grid gap-4 mb-10 animate-fadeInUp ${
              top3.length === 1 ? 'grid-cols-1 max-w-[200px] mx-auto'
              : top3.length === 2 ? 'grid-cols-2 max-w-md mx-auto'
              : 'grid-cols-3'
            }`}
            style={{ animationDelay: '0.1s' }}
          >
            {top3.length >= 2 && <PodiumCard entry={top3[1]} rank={2} />}
            <PodiumCard entry={top3[0]} rank={1} tall />
            {top3.length >= 3 && <PodiumCard entry={top3[2]} rank={3} />}
          </div>
        )}

        {/* Full list */}
        {entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((e, i) => (
              <div key={`${e.user_id || 'x'}-${i}`} className="lb-row animate-fadeInUp"
                style={{ animationDelay: `${0.05 * i}s` }}>
                <div className="w-8 text-center">
                  {e.rank === 1 && <span className="text-xl">🥇</span>}
                  {e.rank === 2 && <span className="text-xl">🥈</span>}
                  {e.rank === 3 && <span className="text-xl">🥉</span>}
                  {e.rank > 3 && <span className="text-sm font-bold" style={{ color: 'rgba(12,36,64,0.4)' }}>#{e.rank}</span>}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${rankGradient(i)})`, color: 'white' }}>
                  {(e.full_name || e.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#0c2540' }}>{e.full_name}</p>
                  <p className="text-xs" style={{ color: 'rgba(12,36,64,0.45)' }}>@{e.username}</p>
                </div>
                <div className="text-right">
                  <span className="font-black text-xl" style={{ color: '#b45309' }}>{e.score}</span>
                  <p className="text-xs" style={{ color: 'rgba(12,36,64,0.35)' }}>ਅੰਕ</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !running && setShowConfirm(false)}>
          <div className="modal-box">
            <h3 className="text-lg font-bold mb-2" style={{ color: '#0c2540' }}>
              {resetOn ? 'ਸਨੈਪਸ਼ਾਟ ਲਵੋ ਅਤੇ ਅੰਕ ਰੀਸੈੱਟ ਕਰੋ?' : 'ਸਨੈਪਸ਼ਾਟ ਲਵੋ?'}
            </h3>
            <p className="text-sm mb-6" style={{ color: 'rgba(12,36,64,0.55)' }}>
              {resetOn
                ? 'ਮੌਜੂਦਾ ਲੀਡਰਬੋਰਡ ਸੁਰੱਖਿਅਤ ਹੋ ਜਾਵੇਗਾ (ਪਿਛਲਾ ਡਾਟਾ ਬਦਲ ਜਾਵੇਗਾ) ਅਤੇ ਸਾਰੇ ਵਰਤੋਂਕਾਰਾਂ ਦੇ ਅੰਕ 0 ਹੋ ਜਾਣਗੇ। ਇਹ ਕਾਰਵਾਈ ਵਾਪਸ ਨਹੀਂ ਹੋ ਸਕਦੀ।'
                : 'ਮੌਜੂਦਾ ਲੀਡਰਬੋਰਡ ਸੁਰੱਖਿਅਤ ਹੋ ਜਾਵੇਗਾ (ਪਿਛਲਾ ਸਨੈਪਸ਼ਾਟ ਬਦਲ ਜਾਵੇਗਾ)। ਵਰਤੋਂਕਾਰਾਂ ਦੇ ਅੰਕ ਨਹੀਂ ਬਦਲਣਗੇ।'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={running} className="btn-ghost flex-1 py-3">ਰੱਦ ਕਰੋ</button>
              <button
                onClick={handleRun}
                disabled={running}
                className={`${resetOn ? 'btn-danger' : 'btn-royal'} flex-1 py-3`}
              >
                {running ? 'ਚੱਲ ਰਿਹਾ...' : 'ਪੁਸ਼ਟੀ ਕਰੋ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PodiumCard({ entry, rank, tall }) {
  if (!entry) return null
  const rankColors = { 1: '#b45309', 2: '#6b7280', 3: '#92400e' }
  const rankEmojis = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div className="glass-card-static rounded-2xl p-4 text-center transition-all"
      style={tall ? { boxShadow: '0 12px 40px rgba(14,65,110,0.12), 0 0 0 1px rgba(245,158,11,0.2)', marginTop: '-16px' } : {}}>
      <div className="text-3xl mb-2">{rankEmojis[rank]}</div>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg mx-auto mb-2"
        style={{ background: `linear-gradient(135deg, ${rankGradient(rank - 1)})`, color: 'white' }}>
        {(entry.full_name || entry.username || '?')[0].toUpperCase()}
      </div>
      <p className="font-semibold text-sm truncate" style={{ color: '#0c2540' }}>{entry.full_name}</p>
      <p className="font-black text-2xl mt-1" style={{ color: rankColors[rank] }}>{entry.score}</p>
      <p className="text-xs mt-1" style={{ color: 'rgba(12,36,64,0.35)' }}>ਅੰਕ</p>
    </div>
  )
}

function rankGradient(i) {
  const g = ['#d97706, #b45309', '#9ca3af, #6b7280', '#cd7f32, #a0522d', '#1a5f8f, #0c2540', '#0ea5e9, #0284c7']
  return g[i % g.length]
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(14,65,110,0.1), rgba(56,189,248,0.07))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-3xl ik-onkar">ੴ</span>
        </div>
        <p style={{ color: 'rgba(12,36,64,0.45)' }}>ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...</p>
      </div>
    </div>
  )
}