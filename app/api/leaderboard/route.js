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

  const admin = getAdminClient()

  const { data: users, error } = await admin
    .from('profiles')
    .select('id, full_name, username, score, created_at')
    .eq('role', 'user')
    .order('score', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (!users?.length) return Response.json({ users: [], stats: {} })

  const stats = {}
  await Promise.all(users.map(async u => {
    const [{ count: a }, { count: s }] = await Promise.all([
      admin.from('angles').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
      admin.from('shabads').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
    ])
    stats[u.id] = { angles: a || 0, shabads: s || 0 }
  }))

  return Response.json({ users, stats })
}
