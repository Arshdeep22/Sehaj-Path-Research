import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { getWebPush } from '../../../../lib/webpush'
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

export async function POST(request) {
  const user = await getCallerUser(request)
  if (!user) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 401 })

  const { shabadId } = await request.json().catch(() => ({}))
  if (!shabadId) return Response.json({ error: 'shabadId missing' }, { status: 400 })

  const admin = getAdminClient()

  // Resolve context server-side (don't trust client for message content)
  const { data: shabad } = await admin
    .from('shabads')
    .select(`
      id, created_by,
      angle:angles!inner( id, title, topic:topics!inner(id, title) )
    `)
    .eq('id', shabadId)
    .single()

  if (!shabad) return Response.json({ error: 'shabad not found' }, { status: 404 })

  const { data: author } = await admin
    .from('profiles')
    .select('full_name, username')
    .eq('id', shabad.created_by)
    .single()

  const authorName = author?.full_name || author?.username || 'ਕਿਸੇ'
  const topicTitle = shabad.angle?.topic?.title || ''
  const angleTitle = shabad.angle?.title || ''

  // Everyone except the author
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .neq('user_id', shabad.created_by)

  if (!subs?.length) return Response.json({ sent: 0 })

  const payload = JSON.stringify({
    title: `ਨਵਾਂ ਸ਼ਬਦ · ${topicTitle}`,
    body: `${authorName} ਨੇ "${angleTitle}" ਵਿੱਚ ਸ਼ਬਦ ਜੋੜਿਆ`,
    url: `/topics/${shabad.angle?.topic?.id}?openAngle=${shabad.angle?.id}#shabad-${shabad.id}`,
    tag: `shabad-${shabad.id}`,
  })

  const webpush = getWebPush()
  let sent = 0
  const dead = []

  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription, payload)
      sent++
    } catch (err) {
      // 404/410 → subscription expired, prune it
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint)
    }
  }))

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
  }

  return Response.json({ sent })
}
