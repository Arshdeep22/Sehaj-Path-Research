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

// GET — the caller's kanth (memorized) shabads, newest-added first
export async function GET(request) {
  const user = await getCallerUser(request)
  if (!user) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 401 })

  const admin = getAdminClient()

  const { data: rows, error } = await admin
    .from('shabad_kanth')
    .select(`
      created_at,
      shabad:shabads!inner(
        id, shabad_text, comment, created_at,
        angle:angles!inner(
          id, title,
          topic:topics!inner(id, title)
        ),
        author:profiles!shabads_created_by_fkey(id, full_name, username)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const shabads = (rows || []).map(r => r.shabad).filter(Boolean)
  return Response.json({ shabads })
}
