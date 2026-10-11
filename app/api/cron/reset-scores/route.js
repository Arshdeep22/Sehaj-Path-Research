import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { buildSnapshotRows } from '../../../../lib/weeklySnapshot'

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

  // 1. Build this week's snapshot rows (score, rank, and unread shabad count per regular user)
  let rows, snapshotCount
  try {
    ({ rows } = await buildSnapshotRows(admin))
    snapshotCount = rows.length
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }

  // 2. Replace last week's snapshot with this week's (only ever keep one week on hand)
  const { error: deleteErr } = await admin
    .from('weekly_leaderboard')
    .delete()
    .not('id', 'is', null)   // delete-all requires a predicate on supabase-js

  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 })

  if (rows.length) {
    const { error: insertErr } = await admin.from('weekly_leaderboard').insert(rows)
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
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