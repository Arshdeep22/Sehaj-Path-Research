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

const MAX_FEED = 80

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
    .limit(MAX_FEED)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!baseShabads?.length) {
    return Response.json({ shabads: [], likes: {}, views: {}, startIndex: 0, currentUserId: user.id })
  }

  const shabadIds = baseShabads.map(s => s.id)

  const [{ data: likes }, { data: views }] = await Promise.all([
    admin
      .from('shabad_likes')
      .select('shabad_id, user_id, liker:profiles!shabad_likes_user_id_fkey(id, full_name, username)')
      .in('shabad_id', shabadIds),
    admin
      .from('shabad_views')
      .select('shabad_id, user_id, viewer:profiles!shabad_views_user_id_fkey(id, full_name, username)')
      .in('shabad_id', shabadIds),
  ])

  const likesMap = {}
  const likeSeen = new Set()
  for (const like of (likes || [])) {
    const key = `${like.shabad_id}:${like.user_id}`
    if (likeSeen.has(key)) continue
    likeSeen.add(key)
    if (!likesMap[like.shabad_id]) likesMap[like.shabad_id] = []
    likesMap[like.shabad_id].push({ user_id: like.user_id, ...like.liker })
  }

  const viewsMap = {}
  const viewSeen = new Set()
  const viewedByUser = new Set()
  for (const v of (views || [])) {
    const key = `${v.shabad_id}:${v.user_id}`
    if (viewSeen.has(key)) continue
    viewSeen.add(key)
    if (!viewsMap[v.shabad_id]) viewsMap[v.shabad_id] = []
    viewsMap[v.shabad_id].push({ user_id: v.user_id, ...v.viewer })
    if (v.user_id === user.id) viewedByUser.add(v.shabad_id)
  }

  // Split preserving newest→oldest order
  const unviewed = baseShabads.filter(s => !viewedByUser.has(s.id))   // newest → oldest
  const viewed = baseShabads.filter(s => viewedByUser.has(s.id))      // newest → oldest

  let ordered
  let startIndex
  if (unviewed.length > 0) {
    // Viewed above (oldest → newest, so newest viewed sits just above the boundary),
    // then unviewed below (newest → oldest). Open at the first unviewed card.
    const viewedAbove = [...viewed].reverse()
    ordered = [...viewedAbove, ...unviewed]
    startIndex = viewedAbove.length
  } else {
    // Everything seen → normal newest → oldest from the top
    ordered = baseShabads
    startIndex = 0
  }

  return Response.json({
    shabads: ordered,
    likes: likesMap,
    views: viewsMap,
    startIndex,
    currentUserId: user.id,
  })
}
