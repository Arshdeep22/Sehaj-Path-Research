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

  // Next.js 16: params is a Promise — must await
  const { shabadId } = await context.params
  console.log('[like] shabadId:', shabadId, 'userId:', user.id)

  if (!shabadId) return Response.json({ error: 'shabadId missing' }, { status: 400 })

  const admin = getAdminClient()

  const { data: existing, error: selectError } = await admin
    .from('shabad_likes')
    .select('id')
    .eq('shabad_id', shabadId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectError) {
    console.error('[like] select error:', selectError)
    return Response.json({ error: selectError.message }, { status: 500 })
  }

  console.log('[like] existing row:', existing)

  if (existing) {
    const { error: deleteError } = await admin
      .from('shabad_likes')
      .delete()
      .eq('shabad_id', shabadId)
      .eq('user_id', user.id)
    if (deleteError) {
      console.error('[like] delete error:', deleteError)
      return Response.json({ error: deleteError.message }, { status: 500 })
    }
    console.log('[like] unliked')
    return Response.json({ liked: false })
  }

  const { error: insertError } = await admin
    .from('shabad_likes')
    .upsert(
      { shabad_id: shabadId, user_id: user.id },
      { onConflict: 'shabad_id,user_id', ignoreDuplicates: true }
    )

  if (insertError) {
    console.error('[like] insert error:', insertError)
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  const { data: liker } = await admin
    .from('profiles')
    .select('id, full_name, username')
    .eq('id', user.id)
    .single()

  console.log('[like] liked, liker:', liker?.full_name)
  return Response.json({ liked: true, liker })
}
