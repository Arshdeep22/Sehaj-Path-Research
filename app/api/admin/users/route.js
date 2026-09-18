import { getAdminClient } from '../../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

async function getCallerProfile(request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? profile : null
}

// POST: Create user
export async function POST(request) {
  const caller = await getCallerProfile(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { full_name, username } = await request.json()
  if (!full_name?.trim() || !username?.trim()) {
    return Response.json({ error: 'ਨਾਮ ਅਤੇ ਵਰਤੋਂਕਾਰ ਨਾਮ ਜ਼ਰੂਰੀ ਹਨ' }, { status: 400 })
  }

  const admin = getAdminClient()
  const email = `${username.trim().toLowerCase()}@sehajpath.local`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: '131313',
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), username: username.trim().toLowerCase(), must_change_password: true },
  })

  if (error) {
    return Response.json({ error: error.message.includes('already registered') ? 'ਇਹ ਵਰਤੋਂਕਾਰ ਨਾਮ ਪਹਿਲਾਂ ਤੋਂ ਮੌਜੂਦ ਹੈ' : error.message }, { status: 400 })
  }

  return Response.json({ success: true, id: data.user.id })
}

// DELETE: Remove user
export async function DELETE(request) {
  const caller = await getCallerProfile(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'ID ਜ਼ਰੂਰੀ ਹੈ' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}

// PATCH: Reset password to default
export async function PATCH(request) {
  const caller = await getCallerProfile(request)
  if (!caller) return Response.json({ error: 'ਅਧਿਕਾਰ ਨਹੀਂ' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return Response.json({ error: 'ID ਜ਼ਰੂਰੀ ਹੈ' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, { password: '131313' })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  await admin.from('profiles').update({ must_change_password: true }).eq('id', id)

  return Response.json({ success: true })
}
