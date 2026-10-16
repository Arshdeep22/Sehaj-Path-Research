// Central reactive store (MVC Model layer).
//
// Uses Zustand persist so every action (markViewed, toggleFavourite, etc.) automatically
// writes the relevant slices back to localStorage — no manual setCache() calls needed.
//
// Cold-start hydration flow:
//   1. useIsomorphicLayoutEffect → seed UI from clientCache (instant paint, pre-persist)
//   2. StoreHydrator useEffect → rehydrate() populates store from localStorage
//   3. useEffect → auth + network fetch if data is stale → updates store (and localStorage)
//
// NOTE: skipHydration:true avoids an SSR mismatch — rehydrate() is called explicitly
// from StoreHydrator.js which only runs on the client.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const LEADERBOARD_TTL = 5 * 60 * 1000
const PRASANG_TTL    = 5 * 60 * 1000

// SSR-safe localStorage wrapper (server has no window)
const ssrSafeStorage = {
  getItem:    (k) => { try { return typeof window !== 'undefined' ? localStorage.getItem(k)    : null } catch { return null } },
  setItem:    (k, v) => { try { if (typeof window !== 'undefined') localStorage.setItem(k, v)    } catch {} },
  removeItem: (k) => { try { if (typeof window !== 'undefined') localStorage.removeItem(k) } catch {} },
}

export const useAppStore = create(
  persist(
    (set, get) => ({

      // ── Profile ────────────────────────────────────────────────────────────
      profile: null,
      token:   null,

      setProfile: (profile, token) => set({ profile, token }),

      // Logout — clears in-memory state; caller must also call persist.clearStorage()
      clearAll: () => set({
        profile: null, token: null,
        viewedIds: [], unreadCount: 0, favouriteIds: [], kanthIds: [],
        feedLoaded: false, feedLastFetched: null,
        leaders: [], userStats: {}, leaderboardLoaded: false, leaderboardLastFetched: null,
        kanthShabads: [], kanthShabadsLoaded: false,
        favShabads: [], favShabadsLoaded: false,
        prasangs: [], prasangsLoaded: false, prasangsLastFetched: null,
      }),

      // ── Feed / Unread ───────────────────────────────────────────────────────
      viewedIds:    [],
      unreadCount:  0,
      favouriteIds: [],
      kanthIds:     [],
      feedLoaded:   false,
      feedLastFetched: null,

      setFeedData: ({ shabads, views, viewedIds: backendViewedIds, favouriteIds, kanthIds, currentUserId }) => {
        // Use the authoritative per-user list from the backend.
        // Merge with any locally-viewed IDs that haven't hit the DB yet (fast refresh, failed POST).
        const { viewedIds: localViewedIds, userStats } = get()
        const viewedIds = backendViewedIds
          ? [...new Set([...backendViewedIds, ...localViewedIds])]
          : Object.entries(views || {})
              .filter(([, viewers]) => viewers?.some(v => v.user_id === currentUserId))
              .map(([id]) => id)
        const unreadCount = Math.max(0, (shabads?.length ?? 0) - viewedIds.length)
        const updates = {
          viewedIds,
          unreadCount,
          favouriteIds: favouriteIds ?? [],
          kanthIds:     kanthIds     ?? [],
          feedLoaded:      true,
          feedLastFetched: Date.now(),
        }

        // Feed is the authoritative source for the current user's unread count.
        // Sync it into userStats so the leaderboard badge always matches the feed badge,
        // even when the leaderboard fetch was skipped (fresh TTL) or used stale cached data.
        if (currentUserId && userStats[currentUserId]) {
          updates.userStats = {
            ...userStats,
            [currentUserId]: { ...userStats[currentUserId], unread: unreadCount },
          }
        }

        set(updates)
      },

      // Mark one shabad viewed; returns true if newly viewed (caller should POST to API).
      // Updates unreadCount AND leaderboard userStats so both reflect the read immediately.
      // Because persist is active, both changes land in localStorage automatically.
      markViewed: (shabadId) => {
        const { viewedIds, unreadCount, profile, userStats } = get()
        if (viewedIds.includes(shabadId)) return false

        const updates = {
          viewedIds:   [...viewedIds, shabadId],
          unreadCount: Math.max(0, unreadCount - 1),
        }

        if (profile?.id && userStats[profile.id]) {
          updates.userStats = {
            ...userStats,
            [profile.id]: {
              ...userStats[profile.id],
              unread: Math.max(0, (userStats[profile.id].unread ?? 0) - 1),
            },
          }
        }

        set(updates)
        return true
      },

      toggleFavourite: (shabadId) => {
        const { favouriteIds } = get()
        const nowFav = !favouriteIds.includes(shabadId)
        set({ favouriteIds: nowFav ? [...favouriteIds, shabadId] : favouriteIds.filter(id => id !== shabadId) })
        return nowFav
      },

      revertFavourite: (shabadId, wasFav) => {
        const { favouriteIds } = get()
        set({ favouriteIds: wasFav ? [...favouriteIds, shabadId] : favouriteIds.filter(id => id !== shabadId) })
      },

      toggleKanth: (shabadId) => {
        const { kanthIds } = get()
        const nowKanth = !kanthIds.includes(shabadId)
        set({ kanthIds: nowKanth ? [...kanthIds, shabadId] : kanthIds.filter(id => id !== shabadId) })
        return nowKanth
      },

      revertKanth: (shabadId, wasKanth) => {
        const { kanthIds } = get()
        set({ kanthIds: wasKanth ? [...kanthIds, shabadId] : kanthIds.filter(id => id !== shabadId) })
      },

      // ── Leaderboard ─────────────────────────────────────────────────────────
      leaders:              [],
      userStats:            {},
      leaderboardLoaded:    false,
      leaderboardLastFetched: null,

      isLeaderboardFresh: () => {
        const { leaderboardLoaded, leaderboardLastFetched } = get()
        return leaderboardLoaded && leaderboardLastFetched && (Date.now() - leaderboardLastFetched < LEADERBOARD_TTL)
      },

      // Called after a real network fetch — sets the freshness clock.
      setLeaderboardData: (leaders, userStats) => set({
        leaders,
        userStats,
        leaderboardLoaded:    true,
        leaderboardLastFetched: Date.now(),
      }),

      // Called from useIsomorphicLayoutEffect to seed the UI instantly from clientCache.
      // Does NOT update leaderboardLastFetched so the network fetch still fires.
      seedLeaderboardFromCache: (leaders, userStats) => set({
        leaders,
        userStats,
        leaderboardLoaded: true,
      }),

      // ── Kanth page ──────────────────────────────────────────────────────────
      kanthShabads:      [],
      kanthShabadsLoaded: false,

      setKanthShabads: (shabads) => set({ kanthShabads: shabads, kanthShabadsLoaded: true }),

      removeKanthShabad: (shabadId) => {
        const { kanthShabads, kanthIds } = get()
        set({
          kanthShabads: kanthShabads.filter(s => s.id !== shabadId),
          kanthIds:     kanthIds.filter(id => id !== shabadId),
        })
      },

      // ── Favourites page ─────────────────────────────────────────────────────
      favShabads:      [],
      favShabadsLoaded: false,

      setFavShabads: (shabads) => set({ favShabads: shabads, favShabadsLoaded: true }),

      removeFavShabad: (shabadId) => {
        const { favShabads, favouriteIds } = get()
        set({
          favShabads:   favShabads.filter(s => s.id !== shabadId),
          favouriteIds: favouriteIds.filter(id => id !== shabadId),
        })
      },

      addFavShabad: (shabad) => {
        const { favShabads, favouriteIds } = get()
        if (favouriteIds.includes(shabad.id)) return
        set({ favShabads: [shabad, ...favShabads], favouriteIds: [...favouriteIds, shabad.id] })
      },

      // ── Prasangs ────────────────────────────────────────────────────────────
      prasangs:            [],
      prasangsLoaded:      false,
      prasangsLastFetched: null,

      isPrasangFresh: () => {
        const { prasangsLoaded, prasangsLastFetched } = get()
        return prasangsLoaded && prasangsLastFetched && (Date.now() - prasangsLastFetched < PRASANG_TTL)
      },

      setPrasangs: (prasangs) => set({
        prasangs,
        prasangsLoaded:      true,
        prasangsLastFetched: Date.now(),
      }),

      seedPrasangsFromCache: (prasangs) => set({
        prasangs,
        prasangsLoaded: true,
      }),

      addPrasang:    (prasang) => set(s => ({ prasangs: [...s.prasangs, prasang] })),
      updatePrasang: (id, changes) => set(s => ({ prasangs: s.prasangs.map(p => p.id === id ? { ...p, ...changes } : p) })),
      deletePrasang: (id) => set(s => ({ prasangs: s.prasangs.filter(p => p.id !== id) })),
    }),
    {
      name: 'spr:store',
      storage: createJSONStorage(() => ssrSafeStorage),
      // Only persist the fields that survive sessions and aren't re-fetched on every load.
      // Large shabad lists (kanthShabads, favShabads) are excluded — they re-hydrate from API.
      partialize: (state) => ({
        viewedIds:         state.viewedIds,
        unreadCount:       state.unreadCount,
        favouriteIds:      state.favouriteIds,
        kanthIds:          state.kanthIds,
        leaders:           state.leaders,
        userStats:         state.userStats,
        leaderboardLoaded: state.leaderboardLoaded,
        // leaderboardLastFetched intentionally NOT persisted — forces a fresh network fetch
        // on every app reload so leaderboard unread counts are never stale across sessions.
        prasangs:          state.prasangs,
        prasangsLoaded:    state.prasangsLoaded,
        // prasangsLastFetched intentionally NOT persisted — same reason.
      }),
      // skipHydration avoids SSR mismatch — StoreHydrator calls rehydrate() on the client.
      skipHydration: true,
    }
  )
)
