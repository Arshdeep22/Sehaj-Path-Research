import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { buildSnapshotRows } from '../../../../lib/weeklySnapshot'
import { createClient } from '@supabase/supabase-js'

// Verify the caller is an authenticated admin.
async function getCallerProfile(request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? profile : null
}

// GET: Return the most recent weekly leaderboard snapshot (admin only).
// The row-level security policy already restricts this to admins, but we also
// double-check here so we can send a clear 403 for non-admin tokens.
export async function GET(request) {
  const caller = await getCallerProfile(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('weekly_leaderboard')
    .select('user_id, full_name, username, score, rank, unread_shabads, snapshot_at')
    .order('rank', { ascending: true })
    .order('score', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    entries: data || [],
    snapshotAt: data?.[0]?.snapshot_at || null,
  })
}

// POST: Admin-triggered snapshot (and optional reset).
// Body: { reset: boolean }   — reset=true wipes profile scores after snapshotting.
// Mirrors the cron logic in `/api/cron/reset-scores/route.js`, except the "reset"
// step is now opt-in so admins can take a mid-week backup without zeroing points.
export async function POST(request) {
  const caller = await getCallerProfile(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const shouldReset = body?.reset === true

  const admin = getAdminClient()

  // 1. Build the snapshot rows (score, rank, and unread shabad count per regular user)
  let rows, snapshotCount
  try {
    ({ rows } = await buildSnapshotRows(admin))
    snapshotCount = rows.length
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }

  // 2. Replace previous snapshot with this new one (we only ever keep one week)
  const { error: deleteErr } = await admin
    .from('weekly_leaderboard')
    .delete()
    .not('id', 'is', null)

  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 })

  if (rows.length) {
    const { error: insertErr } = await admin.from('weekly_leaderboard').insert(rows)
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // 3. Optional reset — zero out non-zero scores only if the admin toggled it on
  let resetCount = 0
  if (shouldReset) {
    const { error: resetErr, count } = await admin
      .from('profiles')
      .update({ score: 0 }, { count: 'exact' })
      .neq('score', 0)
    if (resetErr) return Response.json({ error: resetErr.message }, { status: 500 })
    resetCount = count || 0
  }

  return Response.json({
    ok: true,
    snapshot: snapshotCount,
    reset: shouldReset,
    resetCount,
    at: new Date().toISOString(),
  })
}