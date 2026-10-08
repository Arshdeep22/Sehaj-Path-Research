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

  // Total shabads in the system — unread per user = total − that user's views
  const { count: totalShabads } = await admin
    .from('shabads')
    .select('*', { count: 'exact', head: true })

  const stats = {}
  await Promise.all(users.map(async u => {
    const [{ count: a }, { count: s }, { count: viewed }] = await Promise.all([
      admin.from('angles').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
      admin.from('shabads').select('*', { count: 'exact', head: true }).eq('created_by', u.id),
      admin.from('shabad_views').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
    ])
    stats[u.id] = {
      angles: a || 0,
      shabads: s || 0,
      unread: Math.max(0, (totalShabads || 0) - (viewed || 0)),
    }
  }))

  return Response.json({ users, stats })
}
