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
  return user || null
}

const CAT_KEYS = ['gurmantar', 'brahmkavach', 'birharhe', 'japji', 'sewa', 'sehajpath']

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
function vela(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n < 1440 ? n : null
}

// POST: a user adds/edits their OWN jaap entry for one day. Upserts on
// (whatsapp_name, report_date); the name is the user's mapped alias if any, else
// a stable app:<id> key so manual entries merge with their imported chat data.
export async function POST(request) {
  const user = await getCaller(request)
  if (!user) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 401 })

  let body
  try { body = await request.json() } catch { body = null }
  const report_date = body?.report_date
  if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
    return Response.json({ error: 'ਤਾਰੀਖ਼ ਗਲਤ ਹੈ' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: aliasRows } = await admin.from('jaap_aliases').select('whatsapp_name').eq('profile_id', user.id).limit(1)
  const whatsapp_name = aliasRows?.[0]?.whatsapp_name || `app:${user.id}`

  const row = {
    whatsapp_name,
    profile_id: user.id,
    report_date,
    amrit_vela_min: vela(body.amrit_vela_min),
    amrit_vela_raw: body.amrit_vela_raw || null,
    sandhya_vela_min: vela(body.sandhya_vela_min),
    sandhya_vela_raw: body.sandhya_vela_raw || null,
    raw_message: '[app entry]',
  }
  for (const k of CAT_KEYS) row[k] = num(body[k])

  const { error } = await admin.from('jaap_reports').upsert(row, { onConflict: 'whatsapp_name,report_date' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
