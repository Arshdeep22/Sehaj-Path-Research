'use client'

import { supabase } from './supabaseClient'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission   // 'default' | 'granted' | 'denied'
}

export async function registerServiceWorker() {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

// Ask permission, subscribe, and persist the subscription on the server.
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: permission }

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker())
  if (!reg) return { ok: false, reason: 'no-sw' }
  await navigator.serviceWorker.ready

  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  })

  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(sub),
  })
  if (!res.ok) return { ok: false, reason: 'server' }
  return { ok: true }
}

// Is there an active push subscription in this browser right now?
export async function isSubscribed() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

// Turn notifications OFF: drop the subscription locally and on the server.
export async function disablePush() {
  if (!pushSupported()) return { ok: false }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { ok: true }
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }

  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* ignore */ }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ endpoint }),
    })
  } catch { /* best-effort */ }

  return { ok: true }
}

// Fire a push to everyone (except the author) that a shabad was added.
export async function notifyShabadAdded(shabadId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ shabadId }),
    })
  } catch {
    // best-effort — never block the UI on notification delivery
  }
}

// Fire a push to everyone (except the asker) that a new question was posted.
export async function notifyQuestionAdded(angleId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/push/notify-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ angleId }),
    })
  } catch {
    // best-effort
  }
}
