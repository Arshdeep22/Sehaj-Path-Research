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

  // Newest → oldest base order
  const { data: baseShabads, error } = await admin
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
    .limit(1000)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!baseShabads?.length) {
    return Response.json({ shabads: [], views: {}, favouriteIds: [], startIndex: 0, currentUserId: user.id })
  }

  const shabadIds = baseShabads.map(s => s.id)

  const { data: views } = await admin
    .from('shabad_views')
    .select('shabad_id, user_id, viewer:profiles!shabad_views_user_id_fkey(id, full_name, username)')
    .in('shabad_id', shabadIds)
    .limit(10000)

  // Separate query for ONLY the current user's views — one user never exceeds the
  // PostgREST row cap, so this is always the complete and accurate set for ordering.
  const { data: myViewRows } = await admin
    .from('shabad_views')
    .select('shabad_id')
    .eq('user_id', user.id)
    .in('shabad_id', shabadIds)

  // Which of these shabads the current user has favourited (for the ☆ star state)
  const { data: favRows } = await admin
    .from('shabad_favourites')
    .select('shabad_id')
    .eq('user_id', user.id)
    .in('shabad_id', shabadIds)
  const favouriteIds = (favRows || []).map(f => f.shabad_id)

  const viewsMap = {}
  const viewSeen = new Set()
  for (const v of (views || [])) {
    const key = `${v.shabad_id}:${v.user_id}`
    if (viewSeen.has(key)) continue
    viewSeen.add(key)
    if (!viewsMap[v.shabad_id]) viewsMap[v.shabad_id] = []
    viewsMap[v.shabad_id].push({ user_id: v.user_id, ...v.viewer })
  }

  // Use the dedicated per-user query for the unread/read split — always complete.
  const viewedByUser = new Set((myViewRows || []).map(v => v.shabad_id))

  // All unread first (newest → oldest), then all read (newest → oldest).
  // Guarantees new additions always surface at the top and scroll never dead-ends.
  const unviewed = baseShabads.filter(s => !viewedByUser.has(s.id))
  const viewed   = baseShabads.filter(s =>  viewedByUser.has(s.id))
  const ordered  = [...unviewed, ...viewed]
  const startIndex = 0

  return Response.json({
    shabads: ordered,
    views: viewsMap,
    favouriteIds,
    startIndex,
    currentUserId: user.id,
  })
}
