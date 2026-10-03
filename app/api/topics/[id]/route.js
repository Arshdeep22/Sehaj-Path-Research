import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../../../../lib/supabaseAdmin'

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
    .select('id, role')
    .eq('id', user.id)
    .single()
  return profile || null
}

export async function PATCH(request, { params }) {
  const profile = await getCallerProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const body = await request.json()
  const title = body?.title?.trim()
  const description = body?.description?.trim() || null
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const supabaseAdmin = getAdminClient()
  const { data: existing } = await supabaseAdmin
    .from('topics')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing || (existing.created_by !== profile.id && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('topics')
    .update({ title, description })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ topic: data })
}

export async function DELETE(request, { params }) {
  const profile = await getCallerProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const supabaseAdmin = getAdminClient()
  const { data: existing } = await supabaseAdmin
    .from('topics')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!existing || (existing.created_by !== profile.id && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Cascade delete: shabads → angles → topic (in case DB lacks CASCADE)
  const { data: topicAngles } = await supabaseAdmin
    .from('angles')
    .select('id')
    .eq('topic_id', id)

  if (topicAngles?.length) {
    const angleIds = topicAngles.map(a => a.id)
    await supabaseAdmin.from('shabads').delete().in('angle_id', angleIds)
    await supabaseAdmin.from('angles').delete().eq('topic_id', id)
  }

  const { error } = await supabaseAdmin.from('topics').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
