import { getAdminClient } from '../../../../lib/supabaseAdmin'

// Weekly score reset. Triggered by Vercel Cron (see vercel.json).
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set,
// so we reject anything that doesn't match — keeps the endpoint from being hit publicly.
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ score: 0 })
    .neq('score', 0)   // only touch rows that aren't already zero

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, reset: true, at: new Date().toISOString() })
}
