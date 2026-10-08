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

  const { angleId } = await request.json().catch(() => ({}))
  if (!angleId) return Response.json({ error: 'angleId missing' }, { status: 400 })

  const admin = getAdminClient()

  const { data: angle } = await admin
    .from('angles')
    .select('id, title, created_by, topic:topics!inner(id, title)')
    .eq('id', angleId)
    .single()

  if (!angle) return Response.json({ error: 'angle not found' }, { status: 404 })

  // Everyone except the asker
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .neq('user_id', angle.created_by)

  if (!subs?.length) return Response.json({ sent: 0 })

  const payload = JSON.stringify({
    title: 'ਨਵਾਂ ਪ੍ਰਸ਼ਨ ਪੁੱਛਿਆ ਗਿਆ',
    body: angle.title,
    url: `/prashan#q-${angle.id}`,
    tag: `question-${angle.id}`,
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
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint)
    }
  }))

  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)

  return Response.json({ sent })
}
