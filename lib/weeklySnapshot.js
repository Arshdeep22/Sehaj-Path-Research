// Builds the weekly_leaderboard snapshot rows for every regular user.
// Shared by the Sunday cron (/api/cron/reset-scores) and the admin manual
// trigger (/api/admin/weekly-leaderboard) so both snapshots stay identical.

// Tally shabad_views per user_id, paginating so we never miss rows past the
// PostgREST page limit.
async function countViewsPerUser(admin) {
  const counts = {}
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('shabad_views')
      .select('user_id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const v of (data || [])) counts[v.user_id] = (counts[v.user_id] || 0) + 1
    if (!data || data.length < PAGE) break
  }
  return counts
}

// Returns { rows, snapshotAt } ready to insert into weekly_leaderboard.
// Each row carries the user's score, tie-aware rank, and unread_shabads
// (total shabads in the archive minus the ones this user has already viewed).
// Throws on any query error.
export async function buildSnapshotRows(admin) {
  // Every regular user, highest-score first (admins are excluded from the board).
  // Users still on 0 are kept too, so the backup records who was active that week.
  const { data: allUsers, error: fetchErr } = await admin
    .from('profiles')
    .select('id, full_name, username, score')
    .eq('role', 'user')
    .order('score', { ascending: false })
  if (fetchErr) throw new Error(fetchErr.message)

  const snapshotAt = new Date().toISOString()
  if (!allUsers?.length) return { rows: [], snapshotAt }

  // Total shabads in the archive → unread = total − how many the user has viewed.
  // shabad_views has UNIQUE(shabad_id, user_id) and cascades on shabad delete,
  // so each view row maps to a distinct still-existing shabad.
  const { count: totalShabads, error: countErr } = await admin
    .from('shabads')
    .select('id', { count: 'exact', head: true })
  if (countErr) throw new Error(countErr.message)
  const total = totalShabads || 0

  const viewed = await countViewsPerUser(admin)

  const rows = allUsers.map(u => ({
    user_id: u.id,
    full_name: u.full_name,
    username: u.username,
    score: u.score || 0,
    // Tie-aware rank (1,1,3,…) — matches the live leaderboard's ranking rules
    rank: allUsers.filter(x => (x.score || 0) > (u.score || 0)).length + 1,
    unread_shabads: Math.max(0, total - (viewed[u.id] || 0)),
    snapshot_at: snapshotAt,
  }))

  return { rows, snapshotAt }
}
