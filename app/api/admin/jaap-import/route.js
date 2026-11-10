import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

async function getAdminCaller(request) {
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
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

const CAT_KEYS = ['gurmantar', 'brahmkavach', 'birharhe', 'japji', 'sewa', 'sehajpath']

// POST: bulk-upsert parsed daily records. Body: { records: [...] }
export async function POST(request) {
  const caller = await getAdminCaller(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { records } = await request.json()
  if (!Array.isArray(records) || !records.length) {
    return Response.json({ error: 'ਕੋਈ ਰਿਕਾਰਡ ਨਹੀਂ ਮਿਲੇ' }, { status: 400 })
  }

  const admin = getAdminClient()

  // Resolve profile_id for each record from the alias map.
  const { data: aliases } = await admin.from('jaap_aliases').select('whatsapp_name, profile_id')
  const aliasMap = new Map((aliases || []).map(a => [a.whatsapp_name, a.profile_id]))

  const rows = records.map(r => {
    const row = {
      whatsapp_name: r.whatsapp_name,
      profile_id: aliasMap.get(r.whatsapp_name) || null,
      report_date: r.report_date,
      amrit_vela_min: r.amrit_vela_min ?? null,
      amrit_vela_raw: r.amrit_vela_raw ?? null,
      sandhya_vela_min: r.sandhya_vela_min ?? null,
      sandhya_vela_raw: r.sandhya_vela_raw ?? null,
      day_index: r.day_index ?? null,
      raw_message: r.raw_message ?? null,
    }
    for (const k of CAT_KEYS) row[k] = r[k] ?? null
    return row
  })

  const { error } = await admin
    .from('jaap_reports')
    .upsert(rows, { onConflict: 'whatsapp_name,report_date' })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Retain only the current + previous calendar month.
  const cutoff = new Date()
  cutoff.setDate(1)
  cutoff.setMonth(cutoff.getMonth() - 1)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`
  await admin.from('jaap_reports').delete().lt('report_date', cutoffStr)

  // Names that still have no mapping (so the UI can prompt the admin) vs. names
  // auto-resolved from previously-saved aliases (so the UI can show it worked).
  const unmappedNames = [...new Set(rows.filter(r => !r.profile_id).map(r => r.whatsapp_name))]
  const autoMappedCount = new Set(rows.filter(r => r.profile_id).map(r => r.whatsapp_name)).size

  return Response.json({ imported: rows.length, unmappedNames, autoMappedCount })
}
