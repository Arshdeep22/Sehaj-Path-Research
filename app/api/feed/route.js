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
  const limit = Math.min(parseInt(searchParams.get('limit') || '15'), 50)
  const offset = parseInt(searchParams.get('offset') || '0')

  const admin = getAdminClient()

  const { data: shabads, error } = await admin
    .from('shabads')
    .select(`
      id, shabad_text, comment, created_at,
      angle:angles!inner(
        id, title,
        topic:topics!inner(id, title)
      ),
      author:profiles!shabads_created_by_fkey(id, full_name, username)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!shabads?.length) return Response.json({ shabads: [], likes: {}, currentUserId: user.id })

  const shabadIds = shabads.map(s => s.id)

  const { data: likes } = await admin
    .from('shabad_likes')
    .select('shabad_id, user_id, liker:profiles!shabad_likes_user_id_fkey(id, full_name, username)')
    .in('shabad_id', shabadIds)

  const likesMap = {}
  const seen = new Set()
  for (const like of (likes || [])) {
    const key = `${like.shabad_id}:${like.user_id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!likesMap[like.shabad_id]) likesMap[like.shabad_id] = []
    likesMap[like.shabad_id].push({ user_id: like.user_id, ...like.liker })
  }

  return Response.json({ shabads, likes: likesMap, currentUserId: user.id })
}
