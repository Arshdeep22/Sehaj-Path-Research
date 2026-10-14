// Stale-while-revalidate cache backed by localStorage.
// Persists across full page reloads and browser restarts (cleared on logout).
// An in-memory mirror keeps reads fast during a session.
//
// IMPORTANT: don't read the cache in a useState initializer / during render —
// the server has no localStorage, so that would cause hydration mismatches.
// Hydrate via `useIsomorphicLayoutEffect` instead (runs before paint, no flash).

import { useEffect, useLayoutEffect } from 'react'
import { supabase } from './supabaseClient'

const PREFIX = 'spr:cache:'
const mem = new Map()

function ls() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function getCache(key) {
  if (mem.has(key)) return mem.get(key)
  const store = ls()
  if (!store) return undefined
  try {
    const raw = store.getItem(PREFIX + key)
    if (raw == null) return undefined
    const val = JSON.parse(raw)
    mem.set(key, val)
    return val
  } catch {
    return undefined
  }
}

export function setCache(key, value) {
  mem.set(key, value)
  const store = ls()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // quota / serialization errors are non-fatal — the in-memory copy still works
  }
}

export function removeCache(key) {
  mem.delete(key)
  const store = ls()
  if (!store) return
  try {
    store.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

export function clearCache() {
  mem.clear()
  const store = ls()
  if (!store) return
  try {
    Object.keys(store).forEach(k => { if (k.startsWith(PREFIX)) store.removeItem(k) })
  } catch {
    // ignore
  }
}

// Returns { profile, token } from cache+session without a network round-trip,
// or null if the cache is cold or the session has expired.
// Use this in pages instead of getUser()+profiles.select() when you have a
// warm cache — avoids duplicate Supabase calls from pre-warmed iframes.
export async function getProfileCached() {
  const profile = getCache('profile')
  if (!profile) return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return { profile, token: session.access_token }
  } catch {
    return null
  }
}

// useLayoutEffect on the client, useEffect on the server (avoids SSR warning)
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
