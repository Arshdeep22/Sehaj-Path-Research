'use client'

import { useEffect } from 'react'
import { useAppStore } from '../lib/store'

// Triggers Zustand's persist rehydration after the first client-side render.
// skipHydration:true in the store prevents SSR mismatch; this component runs
// rehydrate() in a useEffect so the browser's localStorage is read on the client only.
// Guards against overwriting store data that was already seeded from clientCache
// by checking whether the Zustand key actually exists before rehydrating.
export default function StoreHydrator() {
  useEffect(() => {
    try {
      if (localStorage.getItem('spr:store')) {
        useAppStore.persist.rehydrate()
      }
    } catch {}
  }, [])
  return null
}
