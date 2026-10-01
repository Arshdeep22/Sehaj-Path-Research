import { getAdminClient } from '../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

async function getCallerUser(request) {
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

export async function GET(request) {
  const user = await getCallerUser(request)
  if (!user) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')
  if (!ids) return Response.json({ profiles: [] })

  const idList = ids.split(',').filter(Boolean)
  if (!idList.length) return Response.json({ profiles: [] })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, username')
    .in('id', idList)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ profiles: data || [] })
}
