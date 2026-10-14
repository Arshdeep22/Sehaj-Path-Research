import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../../../lib/supabaseAdmin'

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

// GET — returns admin-created prasangs + the caller's own personal prasangs (deduplicated)
export async function GET(request) {
  const profile = await getCallerProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdminClient()

  const { data, error } = await admin
    .from('prasangs')
    .select('*')
    .or(`is_admin_created.eq.true,created_by.eq.${profile.id}`)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prasangs: data || [] })
}

// POST — create a new prasang (admin = shared + notifies; user = personal, no notification)
export async function POST(request) {
  const profile = await getCallerProfile(request)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const title = body?.title?.trim()
  const description = body?.description?.trim() || null
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const isAdminCreated = profile.role === 'admin'

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('prasangs')
    .insert({ title, description, is_admin_created: isAdminCreated, created_by: profile.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ prasang: data, shouldNotify: isAdminCreated })
}
