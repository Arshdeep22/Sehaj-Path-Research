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

  const admin = getAdminClient()
  const { error } = await admin
    .from('shabad_views')
    .upsert(
      { shabad_id: shabadId, user_id: user.id },
      { onConflict: 'shabad_id,user_id', ignoreDuplicates: true }
    )
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ viewed: true })
}
