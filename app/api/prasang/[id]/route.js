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
  const body = await request.json().catch(() => ({}))
  const title = body?.title?.trim()
  const description = body?.description?.trim() || null
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const admin = getAdminClient()
  const { data: existing } = await admin.from('prasangs').select('created_by').eq('id', id).single()
  if (!existing || (existing.created_by !== profile.id && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('prasangs')
    .update({ title, description })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prasang: data })
}

export async function DELETE(request, { params }) {
  const profile = await getCallerProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = getAdminClient()

  const { data: existing } = await admin.from('prasangs').select('created_by').eq('id', id).single()
  if (!existing || (existing.created_by !== profile.id && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Cascade: prasang_shabads → prasang_angles → prasangs
  const { data: prasangAngles } = await admin
    .from('prasang_angles')
    .select('id')
    .eq('prasang_id', id)

  if (prasangAngles?.length) {
    const angleIds = prasangAngles.map(a => a.id)
    await admin.from('prasang_shabads').delete().in('prasang_angle_id', angleIds)
    await admin.from('prasang_angles').delete().eq('prasang_id', id)
  }

  const { error } = await admin.from('prasangs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
