import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

async function getCaller(request) {
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
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('id', user.id).single()
  return profile || null
}

const CAT_KEYS = ['gurmantar', 'brahmkavach', 'birharhe', 'japji', 'sewa', 'sehajpath']

// GET: analytics for the last ~2 months.
//   ?profileId=  — admins may view anyone; non-admins are forced to their own id.
// Returns the caller's daily rows plus the per-day/per-category max across all
// users (the "top performer of the day" line) — numbers only, no names.
export async function GET(request) {
  const caller = await getCaller(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const requested = searchParams.get('profileId')
  const targetId = caller.role === 'admin' && requested ? requested : caller.id

  const cutoff = new Date()
  cutoff.setDate(1)
  cutoff.setMonth(cutoff.getMonth() - 1)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`

  const admin = getAdminClient()

  const [{ data: mine }, { data: all }] = await Promise.all([
    admin.from('jaap_reports').select('*').eq('profile_id', targetId).gte('report_date', cutoffStr).order('report_date'),
    admin.from('jaap_reports').select('report_date, profile_id, amrit_vela_min, sandhya_vela_min, ' + CAT_KEYS.join(', ')).gte('report_date', cutoffStr),
  ])

  // Per-date per-category max across everyone (the "top performer" line).
  const dailyMax = {}
  // Per-date best vela among OTHER people. "Best" = closest to 12am (midnight),
  // i.e. the smallest minutes-since-midnight value. Used for the golden line.
  const velaBest = {}
  for (const row of all || []) {
    const d = row.report_date
    if (!dailyMax[d]) dailyMax[d] = {}
    for (const k of CAT_KEYS) {
      const v = row[k]
      if (v === null || v === undefined) continue
      if (dailyMax[d][k] === undefined || v > dailyMax[d][k]) dailyMax[d][k] = v
    }
    if (row.profile_id !== targetId) {
      if (!velaBest[d]) velaBest[d] = { amrit: null, sandhya: null }
      const a = row.amrit_vela_min, s = row.sandhya_vela_min
      if (a !== null && a !== undefined && (velaBest[d].amrit === null || a < velaBest[d].amrit)) velaBest[d].amrit = a
      if (s !== null && s !== undefined && (velaBest[d].sandhya === null || s < velaBest[d].sandhya)) velaBest[d].sandhya = s
    }
  }

  return Response.json({ mine: mine || [], dailyMax, velaBest, targetId })
}
