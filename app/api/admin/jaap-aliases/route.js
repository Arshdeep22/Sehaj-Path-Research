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

// GET: everything the mapping UI needs — existing aliases, all app users, and
// the distinct WhatsApp names in jaap_reports that still have no alias.
export async function GET(request) {
  const caller = await getAdminCaller(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const admin = getAdminClient()
  const [{ data: aliases }, { data: users }, { data: reportNames }] = await Promise.all([
    admin.from('jaap_aliases').select('whatsapp_name, profile_id'),
    admin.from('profiles').select('id, full_name, username').eq('role', 'user').order('full_name'),
    admin.from('jaap_reports').select('whatsapp_name'),
  ])

  const mapped = new Set((aliases || []).map(a => a.whatsapp_name))
  const unmappedNames = [...new Set((reportNames || []).map(r => r.whatsapp_name))]
    .filter(n => !mapped.has(n))
    .sort()

  return Response.json({ aliases: aliases || [], users: users || [], unmappedNames })
}

// POST: assign a WhatsApp name to a profile (or clear it with profile_id=null).
// Back-fills jaap_reports.profile_id for that name so existing rows link up.
export async function POST(request) {
  const caller = await getAdminCaller(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { whatsapp_name, profile_id } = await request.json()
  if (!whatsapp_name?.trim()) {
    return Response.json({ error: 'ਨਾਮ ਜ਼ਰੂਰੀ ਹੈ' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('jaap_aliases')
    .upsert({ whatsapp_name, profile_id: profile_id || null }, { onConflict: 'whatsapp_name' })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  await admin.from('jaap_reports').update({ profile_id: profile_id || null }).eq('whatsapp_name', whatsapp_name)

  return Response.json({ success: true })
}
