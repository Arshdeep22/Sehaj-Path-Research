import { getAdminClient } from '../../../../../lib/supabaseAdmin'
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

export async function POST(request, context) {
  const user = await getCallerUser(request)
  if (!user) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 401 })

  const { shabadId } = await context.params
  if (!shabadId) return Response.json({ error: 'shabadId missing' }, { status: 400 })

  // Desired state from the client. Idempotent: setting the same state twice is a no-op.
  // Falls back to a toggle if no explicit `liked` is sent.
  let desired
  try {
    const body = await request.json()
    if (typeof body?.liked === 'boolean') desired = body.liked
  } catch {
    // no body — treat as toggle
  }

  const admin = getAdminClient()

  if (desired === undefined) {
    const { data: existing } = await admin
      .from('shabad_likes')
      .select('id')
      .eq('shabad_id', shabadId)
      .eq('user_id', user.id)
      .maybeSingle()
    desired = !existing
  }

  if (desired) {
    const { error } = await admin
      .from('shabad_likes')
      .upsert(
        { shabad_id: shabadId, user_id: user.id },
        { onConflict: 'shabad_id,user_id', ignoreDuplicates: true }
      )
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ liked: true })
  }

  const { error } = await admin
    .from('shabad_likes')
    .delete()
    .eq('shabad_id', shabadId)
    .eq('user_id', user.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ liked: false })
}
