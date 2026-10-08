import { getAdminClient } from '../../../../lib/supabaseAdmin'

// Weekly score reset. Triggered by Vercel Cron (see vercel.json).
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set,
// so we reject anything that doesn't match — keeps the endpoint from being hit publicly.
//
// Flow:
//   1. Snapshot everyone with a positive score into `weekly_leaderboard` (only the LAST week is kept).
//   2. Reset all non-zero `profiles.score` back to 0.
//
// Order matters: we snapshot BEFORE resetting, so the leaderboard captures the week that just ended.
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = getAdminClient()

  // 1. Pull every regular user — including those still on 0 — so the backup records who was active that week
  const { data: allUsers, error: fetchErr } = await admin
    .from('profiles')
    .select('id, full_name, username, score')
    .eq('role', 'user')
    .order('score', { ascending: false })

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 })

  // 2. Replace last week's snapshot with this week's (only ever keep one week on hand)
  const { error: deleteErr } = await admin
    .from('weekly_leaderboard')
    .delete()
    .not('id', 'is', null)   // delete-all requires a predicate on supabase-js

  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 })

  let snapshotCount = 0
  if (allUsers && allUsers.length) {
    const snapshotAt = new Date().toISOString()
    // Tie-aware rank (1,1,3,…) — matches the live leaderboard's ranking rules
    const rows = allUsers.map(u => ({
      user_id: u.id,
      full_name: u.full_name,
      username: u.username,
      score: u.score || 0,
      rank: allUsers.filter(x => (x.score || 0) > (u.score || 0)).length + 1,
      snapshot_at: snapshotAt,
    }))
    const { error: insertErr } = await admin.from('weekly_leaderboard').insert(rows)
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
    snapshotCount = rows.length
  }

  // 3. Reset every non-zero score back to 0
  const { error: resetErr } = await admin
    .from('profiles')
    .update({ score: 0 })
    .neq('score', 0)   // only touch rows that aren't already zero

  if (resetErr) return Response.json({ error: resetErr.message }, { status: 500 })

  return Response.json({
    ok: true,
    reset: true,
    snapshot: snapshotCount,
    at: new Date().toISOString(),
  })
}