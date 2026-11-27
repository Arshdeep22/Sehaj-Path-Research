// Shared parsing for the WhatsApp "ਜਾਪ" chat export (new hour-based format
// introduced mid-November 2026).
//
// Each daily report now looks like:
//   ਦਿਨ: ੨/੭
//   🌼ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ ਕੇ: ੧/੨                  (hours day/week, "H:MM" or decimal)
//   🌼ਗੁਰਮੰਤ੍ਰ ਤੁਰਦੇ ਫਿਰਦੇ: ੪/੭              (hours)
//   📖ਗੁਰਬਾਣੀ: ੨/੪                           (hours)
//   🎙️ਵਿਚਾਰ: ੨੫/੪੫                          (MINUTES — see note below)
//   ⏰ਉਠਦਿਆ ਜਪਜੀ ਸਾਹਿਬ: ੦.੫/੧              (count)
//   ⚔️ਬ੍ਰਹਮ ਕਵਚ: ੧੦/੨੫                       (count)
//   💘ਬਿਰਹੜੇ: ੦/੬                             (count)
//   🤲🏻ਹੱਥੀ ਸੇਵਾ: ੦/੦                        (days)
//   📖ਸਹਿਜ ਪਾਠ: ੩੦/੬੦                        (minutes)
//   🛌ਨੀਂਦ: ੬/੬                               (hours)
//   🌕ਅੰਮ੍ਰਿਤ ਵੇਲਾ: ੫:੩੦ am
//   🌅ਸੰਧਿਆ ਵੇਲਾ: ੯ pm
//   👁️ਅੱਖਾਂ ਦਾ ਬਿਬੇਕ: ✅ / ❌
//   🤐 ਅਵਗੁਣ ਨਹੀਂ ਚਿਤਾਰਨੇ: ✅ / ❌
//   🙇🏻‍♂️ਸ਼ਿਕਾਇਤ ਨਹੀ ਕਰਨੀ: ✅ / ❌
//
// Note on ਵਿਚਾਰ: Admin instruction says vichar target is 2 ਘੰਟੇ (hours), but in
// practice people write it in minutes (e.g. ੨੫ = 25 minutes). We store the raw
// number as given and treat it as HOURS when it parses as H:MM, else as minutes
// if integer > 10 and no colon, else as hours. See parseHourValue.

// ── Categories ────────────────────────────────────────────────────────────────
// Each category stores either hours (float) or a count. Weekly target is per the
// Nov-15 rules. Labels appear exactly as in the chat (modulo leading emoji).
export const CATEGORIES = [
  {
    key: 'gurmantar_tikaa',
    label: 'ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ ਕੇ',
    emoji: '🌼',
    unit: 'hours',
    weeklyTarget: 7,
    keywords: ['ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ', 'ਗੁਰਮੰਤਰ ਟਿਕਾ', 'ਟਿਕਾ ਕੇ', 'ਟਿਕਾ ਵਾਲਾ'],
  },
  {
    key: 'gurmantar_turde',
    label: 'ਗੁਰਮੰਤ੍ਰ ਤੁਰਦੇ ਫਿਰਦੇ',
    emoji: '🌼',
    unit: 'hours',
    weeklyTarget: 28,
    keywords: ['ਤੁਰਦੇ ਫਿਰਦੇ', 'ਤੁਰਦੇ', 'ਫਿਰਦੇ'],
  },
  {
    key: 'gurbani',
    label: 'ਗੁਰਬਾਣੀ',
    emoji: '📖',
    unit: 'hours',
    weeklyTarget: 15,
    keywords: ['ਗੁਰਬਾਣੀ'],
  },
  {
    key: 'vichar',
    label: 'ਵਿਚਾਰ',
    emoji: '🎙️',
    unit: 'hours',
    weeklyTarget: 2,
    keywords: ['ਵਿਚਾਰ'],
  },
  {
    key: 'japji',
    label: 'ਉਠਦਿਆ ਜਪਜੀ ਸਾਹਿਬ',
    emoji: '⏰',
    unit: 'count',
    weeklyTarget: 7,
    keywords: ['ਜਪਜੀ', 'ਜਪੁਜੀ', 'ਉਠਦਿਆ'],
  },
  {
    key: 'brahmkavach',
    label: 'ਬ੍ਰਹਮ ਕਵਚ',
    emoji: '⚔️',
    unit: 'count',
    weeklyTarget: 0,
    keywords: ['ਬ੍ਰਹਮ ਕਵਚ', 'ਬ੍ਰਹਮਕਵੱਚ', 'ਕਵੱਚ', 'ਕਵਚ'],
  },
  {
    key: 'birharhe',
    label: 'ਬਿਰਹੜੇ',
    emoji: '💘',
    unit: 'count',
    weeklyTarget: 0,
    keywords: ['ਬਿਰਹੜੇ', 'ਬਿਰਹ'],
  },
  {
    key: 'sewa',
    label: 'ਹੱਥੀ ਸੇਵਾ',
    emoji: '🤲🏻',
    unit: 'days',
    weeklyTarget: 2,
    keywords: ['ਹੱਥੀ ਸੇਵਾ', 'ਸੇਵਾ', 'ਹੱਥੀ'],
  },
  {
    key: 'sehajpath',
    label: 'ਸਹਿਜ ਪਾਠ',
    emoji: '📖',
    unit: 'minutes',
    weeklyTarget: 7,
    keywords: ['ਸਹਿਜ ਪਾਠ', 'ਸਹਿਜਪਾਠ', 'ਸਹਿਜ'],
  },
  {
    key: 'neend',
    label: 'ਨੀਂਦ',
    emoji: '🛌',
    unit: 'hours',
    weeklyTarget: 0,
    keywords: ['ਨੀਂਦ', 'ਨੀਦ'],
  },
]

// Daily targets for the Jivan calendar colouring (just target/7).
export const CATEGORY_DAILY = CATEGORIES.map(c => ({ ...c, dailyTarget: c.weeklyTarget / 7 }))

// Yes/no disciplines reported as ✅ / ❌ at the end of a daily report.
// Stored as booleans (✅ = true, ❌ = false, absent = null).
export const BOOL_FIELDS = [
  { key: 'eye_bibek',   label: 'ਅੱਖਾਂ ਦਾ ਬਿਬੇਕ',       emoji: '👁️',    keywords: ['ਬਿਬੇਕ', 'ਅੱਖਾਂ'] },
  { key: 'no_faults',   label: 'ਅਵਗੁਣ ਨਹੀਂ ਚਿਤਾਰਨੇ',  emoji: '🤐',    keywords: ['ਅਵਗੁਣ', 'ਚਿਤਾਰ'] },
  { key: 'no_complaint',label: 'ਸ਼ਿਕਾਇਤ ਨਹੀ ਕਰਨੀ',    emoji: '🙇',    keywords: ['ਸ਼ਿਕਾਇਤ'] },
]
export const BOOL_KEYS = BOOL_FIELDS.map(b => b.key)

function parseTick(line) {
  if (/✅|✔|☑/.test(line)) return true
  if (/❌|✖|❎|✗|🚫/.test(line)) return false
  return undefined
}

// ── Number helpers ──────────────────────────────────────────────────────────

export function punjNumToArabic(str) {
  return str
    .replace(/੦/g, '0').replace(/੧/g, '1').replace(/੨/g, '2').replace(/੩/g, '3')
    .replace(/੪/g, '4').replace(/੫/g, '5').replace(/੬/g, '6').replace(/੭/g, '7')
    .replace(/੮/g, '8').replace(/੯/g, '9')
}

// Parse a single token like "੧:੩੦", "੨.੫", "੦.੨੦", "੪", "੩੦" into a number.
// For HOURS fields: "H:MM" → H + MM/60. "0.30" is treated as 0h30m (people write
// decimal with : meaning) ONLY if the fractional part looks like minutes (>=.6
// would be invalid, so we accept any; but convention here says 0.30 = 30 min).
// Actually to stay safe we treat "H.MM" as decimal unless it has `:`. The admin
// clarified: "ਅਗਰ ਢਾਈ ਘੰਟੇ ਪੜ੍ਹੀ ਤਾਂ ੨:੩੦ ਲਿਖਣਾ ਜੀ ਨਾਕੀ ੨.੫" — meaning H:MM is
// the canonical hour-minute form. But many messages still use decimal like "੨.੫"
// or "੦.੩੦" meaning 30 min. We interpret:
//   - contains ':'  → H + MM/60
//   - decimal like 0.30, 1.45, 0.20 (fractional >= .6 is impossible)
//     → treat as H + (fractional * 100)/60   ⇒ e.g. 0.30 = 30 min, 1.20 = 1h20
//   - otherwise plain decimal
function parseHourToken(tok) {
  if (!tok) return null
  const t = tok.trim()
  if (/^\d+:\d{1,2}$/.test(t)) {
    const [h, m] = t.split(':').map(Number)
    return h + (m || 0) / 60
  }
  // Decimal forms:
  //   H.X    — single-digit fractional → decimal (4.5 = 4.5 hours)
  //   H.XX   — two-digit fractional with XX < 60 → minutes (0.30 = 0h30m)
  //   H.XX   — two-digit fractional with XX ≥ 60 → decimal
  // The chat admin says H:MM is canonical for hours+minutes, so we only treat
  // two-digit fractional as minutes (matches what people actually write).
  const m2 = t.match(/^(\d+)\.(\d{2})$/)
  if (m2) {
    const h = parseInt(m2[1], 10)
    const mm = parseInt(m2[2], 10)
    if (mm < 60) return h + mm / 60
    return parseFloat(t)
  }
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

// Extract (day, week) from a value line. Supports many user-written forms:
//   "੧/੨"          — day=1, week=2  (both hours, or both minutes — caller decides)
//   "੧:੩੦/੨:੦੦"    — day=1h30m, week=2h  (both H:MM)
//   "੦.੩੦/੧"       — day=0h30m, week=1h  (decimal 0.30 = 30 min; plain 1 = 1h)
//   "੨੫/੪੫"        — both plain (unit decided by caller / sanitizeHours)
//   "੧੦/੨੫"        — count-based categories (gurbani/kavach/birharhe/sewa)
//
// CRITICAL: when ONE side is H:MM (hours+minutes) and the OTHER side is a plain
// integer, the admin has actually told us the unit. Example from Bhupinder:
//   🌼ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ ਕੇ: ੪੦/੪:੦੩
//              day=40     week=4h3m
// She slipped 40 **minutes** on day 7, and the cumulative for the week is
// 4h 3m. A naive read would take day=40 hours, which is absurd. The rule:
//   • If EITHER side uses "H:MM" form, any plain integer on the OTHER side is
//     reinterpreted as MINUTES (/60 to convert to hours).
// This mirrors the per-row sanitize in extractWeeklyTotals, but lifts the
// interpretation into the parser so the raw record also reflects the author's
// true intent (makes DB imports correct too).
export function extractDailyPair(line) {
  const noEmojiOrLabel = line.replace(/^[^:：]*[:：]/, '').trim()
  // remove trailing ✅/❌ marks after the value
  const cleaned = punjNumToArabic(noEmojiOrLabel).replace(/[,،]/g, '').replace(/[✅❌✔✖☑❎✗🚫]/g, '').trim()
  if (!cleaned) return null
  // Split on '/' so we know which side each token came from (preserves intent).
  const parts = cleaned.split('/')
  if (!parts.length) return null

  // For each side, find the FIRST numeric token and its RAW text (we need to
  // know whether it used "H:MM" form so we can disambiguate the other side).
  // Also detect a MINUTE SUFFIX ("min", "mins", "minutes", "ਮਿੰਟ") that the
  // user typed right after the number — that's an explicit unit declaration.
  function firstToken(side) {
    const m = side.match(/(\d+(?::\d{1,2}|\.\d{1,2})?)\s*(min(?:utes?|s)?|ਮਿੰਟ|ਮਿਨ)?/i)
    if (!m) return null
    return {
      raw: m[1],
      val: parseHourToken(m[1]),
      hasMinSuffix: !!m[2],
    }
  }
  const dSide = firstToken(parts[0] || '')
  const wSide = parts.length > 1 ? firstToken(parts[1] || '') : null

  if (!dSide || dSide.val == null) return null

  const dayHasColon  = dSide.raw.includes(':')
  const weekHasColon = !!(wSide && wSide.raw.includes(':'))
  const dayHasDot    = dSide.raw.includes('.')
  const weekHasDot   = !!(wSide && wSide.raw.includes('.'))

  // Mixed-unit disambiguation: when ONE side uses H:MM and the OTHER is a
  // plain integer, the plain integer *might* be minutes. But we can't just
  // always reinterpret — the plain integer is often an hours value too.
  // Two real-world examples:
  //   Bhupinder: ੪੦/੪:੦੩   → day=40 (min), week=4h3m   ✓ day was minutes
  //   Arshdeep:  ੨:੩੦/੧੮   → day=2h30m, week=18 (h)    ✗ week is HOURS
  //
  // The decisive signal is the DAY ≤ WEEK invariant (weekly is cumulative, so
  // the per-day figure must not exceed the weekly total). If treating the
  // plain integer as HOURS violates that, reinterpret it as minutes; otherwise
  // leave it alone.
  const dayIsPlainInt  = /^\d+$/.test(dSide.raw)
  const weekIsPlainInt = !!(wSide && /^\d+$/.test(wSide.raw))

  let day  = dSide.val
  let week = wSide ? wSide.val : null

  // Rule 0 (strongest): explicit "min" / "ਮਿੰਟ" suffix wins. The user said so.
  if (dSide.hasMinSuffix) day = day / 60
  if (wSide && wSide.hasMinSuffix && week != null) week = week / 60

  // Case A: week has colon, day is plain. If day-as-hours > week, day was min.
  if (weekHasColon && dayIsPlainInt && week != null && day > week && !dSide.hasMinSuffix) {
    day = day / 60
  }
  // Case B: day has colon, week is plain. If week-as-hours < day, week was min.
  if (dayHasColon && weekIsPlainInt && week != null && week < day && !(wSide && wSide.hasMinSuffix)) {
    week = week / 60
  }

  // Extra heuristic for the DAY field: a day only has 24 hours. If the day
  // value exceeds that it HAS to be minutes (regardless of whether either
  // side used H:MM). Only applies to plain-integer day values — an H:MM like
  // "25:00" would already be invalid user input and is rare enough to ignore.
  if (dayIsPlainInt && day > 24 && !dSide.hasMinSuffix) day = day / 60

  return { day, week }
}

// For the "ਦਿਨ: X/੭" header. Returns array of day indices (usually [N]).
// Handles "ਦਿਨ: ੨/੭", "ਦਿਨ: ੬+੭/੭", "ਦਿਨ: ੫-੭/੭".
export function extractDayIndices(line) {
  const normalized = punjNumToArabic(line)
  const daySide = normalized.replace(/^[^:：]*[:：]/, '').split('/')[0]
  const nums = [...daySide.matchAll(/\d+/g)].map(m => parseInt(m[0], 10))
  if (!nums.length) return []
  if (nums.length === 2 && /\d\s*-\s*\d/.test(daySide) && nums[1] > nums[0] + 1) {
    const out = []
    for (let d = nums[0]; d <= nums[1]; d++) out.push(d)
    return out
  }
  return nums
}

// Parse a vela time string → minutes since midnight. Accepts punj numbers,
// "੩:੧੫ am", "੧੨.੧੫ am", "੬ pm", "12pm", "ਸਵੇਰੇ ੩:੦੦". Returns {min, raw}.
// "ਰੈਣ ਸਬਾਈ" (all-night) returns min=null raw=original. "-" or "❌" → null.
export function parseVelaTime(str, defaultMeridiem) {
  if (!str) return { min: null, raw: '' }
  const raw = str.trim()
  if (/^[-–—❌✖]+$/.test(raw.replace(/\s/g, ''))) return { min: null, raw }
  if (/ਰੈਣ|ਸਬਾਈ/.test(raw)) return { min: null, raw }
  const norm = punjNumToArabic(raw).toLowerCase()

  let meridiem = null
  if (/\bam\b|a\.m|ਸਵੇਰੇ|ਸਵੇਰ/.test(norm)) meridiem = 'am'
  else if (/\bpm\b|p\.m|ਸ਼ਾਮ|ਸ਼ਾਮੀ|ਰਾਤ|ਸੰਧਿਆ|ਦੁਪਹਿਰ/.test(norm)) meridiem = 'pm'
  else meridiem = defaultMeridiem || null

  const m = norm.match(/(\d{1,2})[:.\s]+(\d{2})/) || norm.match(/(\d{1,2})/)
  if (!m) return { min: null, raw }
  let hour = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  if (Number.isNaN(hour) || hour > 23) return { min: null, raw }

  if (meridiem === 'pm') { if (hour !== 12) hour += 12 }
  else if (meridiem === 'am') { if (hour === 12) hour = 0 }

  const min = hour * 60 + (Number.isNaN(minute) ? 0 : minute)
  return { min: min >= 0 && min < 1440 ? min : null, raw }
}

// ── Timestamp helpers ─────────────────────────────────────────────────────────

export function parseLineTimestamp(line) {
  // New format: DD/MM/YY, H:MM am/pm
  const m1 = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})\s*([ap]m)/i)
  if (m1) {
    let [, d, mo, y, h, min, ap] = m1
    let year = parseInt(y); if (year < 100) year += 2000
    let hour = parseInt(h)
    const isPm = ap.toLowerCase() === 'pm'
    if (isPm && hour !== 12) hour += 12
    if (!isPm && hour === 12) hour = 0
    return new Date(year, parseInt(mo) - 1, parseInt(d), hour, parseInt(min))
  }
  // Old format: [M/D/YY, H:MM:SS AM/PM]
  const m2 = line.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp][Mm]))?\]/)
  if (m2) {
    let [, mo, d, y, h, min, ap] = m2
    let year = parseInt(y); if (year < 100) year += 2000
    let hour = parseInt(h)
    if (ap) {
      const isPm = ap.toLowerCase() === 'pm'
      if (isPm && hour !== 12) hour += 12
      if (!isPm && hour === 12) hour = 0
    }
    return new Date(year, parseInt(mo) - 1, parseInt(d), hour, parseInt(min))
  }
  return null
}

// Reporting week range anchored to refDate.
//
// A "week" is the Sunday→Saturday calendar slice THAT JUST ENDED relative to
// refDate, with a GRACE DEADLINE at the following Sunday 6 PM. So a Sunday
// morning (say 10 AM, before the 6 PM deadline) is treated as belonging to
// the week that ran Sun-prev → Sat-just-past.
//
// Rule:
//   • If refDate is a Sunday BEFORE 6 PM, the active week is [prev Sun, Sat].
//     Its graceEnd is this Sunday 6 PM.
//   • Otherwise (Mon-Sat, or Sun ≥ 6 PM), the active week is the most recent
//     Sun→Sat that CONTAINS refDate (or just ended for Sun ≥ 6 PM).
//     graceEnd is the following Sunday 6 PM.
//
// Returns { start: Sunday 00:00, end: nextSunday 18:00 (grace) }.
export function getReportWeekRange(refDate = new Date()) {
  const day = refDate.getDay()               // 0=Sun … 6=Sat
  const sixPM = 18

  // Find "last Saturday 23:59:59" relative to refDate — that's the end of the
  // week being graded. If refDate is a Sunday before 6 PM, we treat it as
  // still inside the previous week's grace window → last-Saturday is yesterday.
  // Otherwise the last-Saturday is the Saturday just passed.
  const inGraceOfPrev = day === 0 && refDate.getHours() < sixPM
  let daysBackToSat
  if (inGraceOfPrev) daysBackToSat = 1              // yesterday is Saturday
  else if (day === 6) daysBackToSat = 0             // today is Saturday
  else if (day === 0) daysBackToSat = 1             // Sun ≥ 6 PM → yesterday Sat
  else daysBackToSat = day + 1                       // Mon → 2, Tue → 3, ... Fri → 6

  const sat = new Date(refDate)
  sat.setHours(0, 0, 0, 0)
  sat.setDate(sat.getDate() - daysBackToSat)

  // Week start = previous Sunday (6 days before that Saturday).
  const start = new Date(sat)
  start.setDate(start.getDate() - 6)

  // Grace deadline = the Sunday AFTER sat, at 6 PM.
  const graceEnd = new Date(sat)
  graceEnd.setDate(graceEnd.getDate() + 1)
  graceEnd.setHours(sixPM, 0, 0, 0)

  return { start, end: graceEnd }
}

export function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Local YYYY-MM-DD (avoids UTC drift from toISOString)
export function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function truncateName(name) {
  const m = name.match(/(.*?(singh|kaur|ਸਿੰਘ|ਕੌਰ))/i)
  return m ? m[1].trim() : name
}

// ── Chat splitter (all known WhatsApp export formats) ──────────────────────────

export function parseWhatsAppChat(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')
  const messages = []
  const memberHistory = new Map()
  let current = null

  function recordMemberEvent(name, action) {
    const n = name.trim()
    if (n) memberHistory.set(n, action)
  }

  function extractMembersFromContent(content) {
    const youAdded = content.match(/^You added (.+)$/i)
    if (youAdded) { youAdded[1].split(' and ').forEach(n => recordMemberEvent(n, 'add')); return }
    const youRemoved = content.match(/^You removed (.+)$/i)
    if (youRemoved) { recordMemberEvent(youRemoved[1], 'remove'); return }
    const xLeft = content.match(/^(.+)\s+left$/i)
    if (xLeft) { recordMemberEvent(xLeft[1], 'remove'); return }
    const xAdded = content.match(/^.+ added (.+)$/i)
    if (xAdded) recordMemberEvent(xAdded[1], 'add')
  }

  const SYSTEM_RE = [
    /^You (added|removed|changed|created|turned|left|updated)/i,
    /\b(added|removed|left|turned off disappearing|joined using|was added)\b/i,
    /^\[System notification\]$/,
    /^Messages and calls are end-to-end/,
    /^<Media omitted>$/,
    /^This message was deleted$/,
    /^null$/,
  ]
  const isSystem = t => SYSTEM_RE.some(r => r.test(t.trim()))

  const TIMESTAMP_RE = /^(?:\[?\d{1,2}\/\d{1,2}\/\d{2,4}[,\s]|\d{1,2}\/\d{1,2}\/\d{2,4},)/

  for (const line of lines) {
    const newNamed = line.match(
      /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*[ap]m\s*-\s*([^:]+?):\s*(.*)/i
    )
    const newSystem = !newNamed && line.match(
      /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*[ap]m\s*-\s*(.*)/i
    )
    const oldNamed = !newNamed && !newSystem && line.match(
      /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\]\s+([^:\-[\]]+[^:\s]):\s*(.*)/
    )
    const oldDash = !newNamed && !newSystem && !oldNamed && line.match(
      /^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\]\s+-\s+(.*)/
    )
    const mdNamed = !newNamed && !newSystem && !oldNamed && !oldDash && line.match(
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^_:[\]<>][^:[\]<>]*?):\s+(.*)/
    )

    if (newNamed) {
      if (current) messages.push(current)
      current = { sender: newNamed[1].trim(), text: newNamed[2], timestamp: parseLineTimestamp(line) }
    } else if (newSystem) {
      if (current) messages.push(current)
      const content = newSystem[1]
      if (isSystem(content)) { extractMembersFromContent(content); current = null }
      else current = { sender: 'You', text: content, timestamp: parseLineTimestamp(line) }
    } else if (oldNamed) {
      if (current) messages.push(current)
      current = { sender: oldNamed[1].trim(), text: oldNamed[2], timestamp: parseLineTimestamp(line) }
    } else if (oldDash) {
      if (current) messages.push(current)
      const content = oldDash[1]
      if (isSystem(content)) { extractMembersFromContent(content); current = null }
      else current = { sender: 'You', text: content, timestamp: parseLineTimestamp(line) }
    } else if (mdNamed) {
      if (current) messages.push(current)
      current = { sender: mdNamed[2].trim(), text: mdNamed[3], timestamp: null }
    } else if (TIMESTAMP_RE.test(line) || line.startsWith('## ') || line.startsWith('# ') || /^---+$/.test(line.trim())) {
      // Pure dashes-only separator ends a block; the WhatsApp ਜਾਪ reports use
      // a "----------🪷-----------" divider mid-report which must NOT split.
      if (current) messages.push(current)
      current = null
    } else if (current) {
      current.text += '\n' + line
    }
  }
  if (current) messages.push(current)

  const memberNames = []
  const removedNames = new Set()
  for (const [name, action] of memberHistory) {
    if (action === 'add') memberNames.push(name)
    else removedNames.add(name)
  }
  return { messages, memberNames, removedNames }
}

// ── Daily parsing ─────────────────────────────────────────────────────────────

const DAY_HEADER_RE = /^\s*ਦਿਨ\s*[:：]/   // "ਦਿਨ: ੨/੭" — NOT "ਦਿਨ/ਹਫ਼ਤਾ: ..."
const FATEH_RE = /ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ/

// Does this text look like a daily sadhana report? Needs the ਦਿਨ: N/੭ header
// AND at least two category keywords. Rejects announcements/rules messages.
export function looksLikeReport(text) {
  if (!DAY_HEADER_RE.test(text) && !/\nਦਿਨ\s*[:：]/.test(text)) return false
  const hits = CATEGORIES.filter(c => c.keywords.some(kw => text.includes(kw))).length
  return hits >= 2
}

// Find the category this line is reporting. Returns the category object or null.
// Longest matching keyword wins (so "ਗੁਰਮੰਤ੍ਰ ਟਿਕਾ ਕੇ" beats generic "ਗੁਰਮੰਤ੍ਰ").
function matchCategory(line) {
  let best = null, bestLen = 0
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (line.includes(kw) && kw.length > bestLen) { best = cat; bestLen = kw.length }
    }
  }
  return best
}

// Split one message into report blocks for multi-day catchups ("ਦਿਨ: ੬+੭/੭").
function splitReportBlocks(text) {
  const lines = text.split('\n')
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    if (DAY_HEADER_RE.test(lines[i])) starts.push(i)
  }
  if (!starts.length) {
    for (let i = 0; i < lines.length; i++) {
      if (FATEH_RE.test(lines[i])) starts.push(i)
    }
  }
  if (!starts.length) return [lines]
  const blocks = []
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length
    blocks.push(lines.slice(from, to))
  }
  return blocks
}

// Parse a single block → values/weeks/bools/vela/day_index.
function parseBlock(blockLines) {
  const out = {
    values: {}, weeks: {}, bools: {},
    day_index: null, day_indices: null,
    amrit: { min: null, raw: '' }, sandhya: { min: null, raw: '' },
  }

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i]

    if (out.day_indices === null && DAY_HEADER_RE.test(line)) {
      const idxs = extractDayIndices(line)
      if (idxs.length) { out.day_indices = idxs; out.day_index = idxs[0] }
      continue
    }

    // Vela lines first — they also contain the "ਵੇਲਾ" word.
    if (out.amrit.min === null && line.includes('ਅੰਮ੍ਰਿਤ') && line.includes('ਵੇਲਾ')) {
      out.amrit = parseVelaTime(line.split(/[:：]/).slice(1).join(':'), 'am')
      continue
    }
    if (out.sandhya.min === null && line.includes('ਸੰਧਿਆ')) {
      out.sandhya = parseVelaTime(line.split(/[:：]/).slice(1).join(':'), 'pm')
      continue
    }

    // Yes/no discipline lines
    let handledBool = false
    for (const bf of BOOL_FIELDS) {
      if (out.bools[bf.key] !== undefined) continue
      if (!bf.keywords.some(kw => line.includes(kw))) continue
      const t = parseTick(line)
      if (t !== undefined) { out.bools[bf.key] = t; handledBool = true; break }
    }
    if (handledBool) continue

    // Category value line
    if (line.includes('ਵੇਲਾ')) continue
    const cat = matchCategory(line)
    if (!cat) continue
    if (out.values[cat.key] !== undefined) continue
    const pair = extractDailyPair(line)
    if (pair) { out.values[cat.key] = pair.day; out.weeks[cat.key] = pair.week }
  }
  return out
}

// Expand a multi-day block ("ਦਿਨ: ੬+੭/੭" with a combined total) into one block
// per day, splitting values evenly.
function explodeMultiDayBlocks(blocks) {
  const out = []
  for (const b of blocks) {
    const idxs = b.day_indices && b.day_indices.length > 1 ? [...b.day_indices].sort((a, z) => a - z) : null
    if (!idxs) { out.push(b); continue }
    const k = idxs.length
    idxs.forEach((idx, i) => {
      const isLatest = i === k - 1
      const values = {}
      const weeks = {}
      for (const key of Object.keys(b.values)) {
        const v = b.values[key]
        values[key] = v == null ? v : v / k
      }
      for (const key of Object.keys(b.weeks || {})) {
        const w = b.weeks[key]
        const d = b.values[key]
        weeks[key] = (w == null || d == null) ? (isLatest ? w : null) : w - (k - 1 - i) * (d / k)
      }
      out.push({
        values, weeks,
        bools: isLatest ? b.bools : {},
        day_index: idx,
        day_indices: [idx],
        amrit: isLatest ? b.amrit : { min: null, raw: '' },
        sandhya: isLatest ? b.sandhya : { min: null, raw: '' },
      })
    })
  }
  return out
}

// Parse a whole message → array of per-day records.
export function parseDailyReports(text, messageDate) {
  if (!looksLikeReport(text)) return []
  let blocks = splitReportBlocks(text).map(parseBlock)
    .filter(b => Object.keys(b.values).length > 0 || b.amrit.min !== null || b.sandhya.min !== null)
  if (!blocks.length) return []
  blocks = explodeMultiDayBlocks(blocks)

  // Anchor dates. Late-night posts (before 4 AM) describe the previous day.
  const base = messageDate ? new Date(messageDate) : new Date()
  if (messageDate && base.getHours() < 4) base.setDate(base.getDate() - 1)
  base.setHours(12, 0, 0, 0)

  const n = blocks.length
  const haveIdx = blocks.every(b => b.day_index !== null)
  const maxIdx = haveIdx ? Math.max(...blocks.map(b => b.day_index)) : null

  return blocks.map((b, i) => {
    const date = new Date(base)
    if (n > 1) {
      const offset = haveIdx ? (maxIdx - b.day_index) : (n - 1 - i)
      date.setDate(date.getDate() - offset)
    }
    const rec = { report_date: toLocalDateStr(date), day_index: b.day_index }
    for (const cat of CATEGORIES) rec[cat.key] = b.values[cat.key] ?? null
    rec._weeks = {}
    for (const cat of CATEGORIES) rec._weeks[cat.key] = b.weeks?.[cat.key] ?? null
    rec.amrit_vela_min = b.amrit.min
    rec.amrit_vela_raw = b.amrit.raw || null
    rec.sandhya_vela_min = b.sandhya.min
    rec.sandhya_vela_raw = b.sandhya.raw || null
    for (const bf of BOOL_FIELDS) rec[bf.key] = b.bools?.[bf.key] ?? null
    return rec
  })
}

// Build DB-ready records for every real sender in the chat. Since the new format
// stores day values directly (not cumulative), we don't need the complex
// cumulative-reconciliation pipeline. We just de-duplicate by (sender, date):
// if a sender posts twice for the same day_index/date the later message wins.
// Only reports from NOV-15 2026 onward (new format) are kept.
const NEW_FORMAT_START = new Date(2026, 10, 15)   // 15 Nov 2026
NEW_FORMAT_START.setHours(0, 0, 0, 0)

// Sanity thresholds (max reasonable WEEKLY total for an hour category) — used
// to detect when a user wrote minutes instead of hours (e.g. "੨੫" for vichar
// meaning 25 min, not 25 hours). Any weekly total above the threshold is
// re-interpreted as minutes (÷60). Conservative values picked well above the
// target but well below a "could be hours" sanity cap:
//   gurmantar_tikaa: target 7h/week  — cap 50h
//   gurmantar_turde: target 28h/week — cap 80h
//   gurbani:         target 15h/week — cap 60h
//   vichar:          target 2h/week  — cap 10h (vichar is almost always minutes)
const HOUR_SANITY_CAPS = {
  gurmantar_tikaa: 50,
  gurmantar_turde: 80,
  gurbani: 60,
  vichar: 10,
  neend: 100,       // 100h/week ≈ 14h/day — anything beyond is minutes
}

function sanitizeHours(key, v) {
  if (v == null || !Number.isFinite(v)) return v
  const cap = HOUR_SANITY_CAPS[key]
  if (cap != null && v > cap) return v / 60
  return v
}

export function buildDailyRecords(messages, removedNames = new Set()) {
  const bySenderDate = new Map()       // "sender\tdate" → {rec, ts, raw}
  for (const msg of messages) {
    if (msg.sender === 'You' || removedNames.has(msg.sender)) continue
    if (msg.timestamp && msg.timestamp < NEW_FORMAT_START) continue
    const recs = parseDailyReports(msg.text, msg.timestamp)
    for (const rec of recs) {
      const key = `${msg.sender}\t${rec.report_date}`
      const prev = bySenderDate.get(key)
      const ts = msg.timestamp?.getTime?.() || 0
      if (!prev || ts >= (prev.ts?.getTime?.() || 0)) {
        bySenderDate.set(key, { rec, ts: msg.timestamp, raw: msg.text, sender: msg.sender })
      }
    }
  }

  const out = []
  for (const { rec, raw, sender } of bySenderDate.values()) {
    const { _weeks, ...clean } = rec
    // Rebuild weekly totals so the API layer can store them (see
    // extractWeeklyTotals below for how they're consumed in the report card).
    clean._weeks = _weeks
    out.push({ whatsapp_name: sender, raw_message: raw, ...clean })
  }
  return out
}

// Given all day records for ONE sender (chronologically sortable via report_date),
// return the best estimate of each category's WEEKLY total.
//
// Approach (per category, independently):
//   1. Each row's "/WEEK" cumulative value is SANITIZED first — a figure
//      bigger than that category's reasonable weekly hour cap is reinterpreted
//      as minutes. This matters because people often switch units mid-week
//      (e.g. "20" meaning 20 min on day 1, "1:40" meaning 1h40m on day 5):
//      sanitizing per-row makes the two comparable in hours.
//   2. We take the MAX of all sanitized /WEEK values. The admin's rule is to
//      post a running weekly total, so the maximum is the best claim of the
//      aggregate. Max also ignores accidental zero-resets on a later day.
//   3. If a category never had a /WEEK value, fall back to summing the per-day
//      values across all this sender's rows.
//
// Special case for ਨੀਂਦ (sleep): the "/WEEK" field is a sum-of-nights which is
// meaningless to display per-day (divided by 7 it's trivially tiny; divided by
// days reported it over-counts when the user has 3 records spanning a week of
// nights). Instead we take the LATEST row's daily value as a representative
// "nightly sleep" — closer to what people actually mean when they ask about
// someone's sleep.
export function extractWeeklyTotals(rows) {
  if (!rows || !rows.length) {
    const z = {}; for (const c of CATEGORIES) z[c.key] = 0
    return { totals: z, usedWeekFields: false, bestRow: null }
  }
  // "Latest" row kept for caller convenience (debug / ts anchoring) AND for
  // sleep's special-case (we read the latest nightly value).
  const sorted = [...rows].sort((a, b) => {
    const dA = a.day_index ?? -1, dB = b.day_index ?? -1
    if (dA !== dB) return dB - dA
    return (a.report_date < b.report_date) ? 1 : -1
  })
  const latest = sorted[0]

  const totals = {}
  let usedWeekFields = false
  for (const cat of CATEGORIES) {
    // Sleep: average the daily nightly values across posted days, then multiply
    // by 7 so that caller's ÷7 (goal-category convention) yields that average
    // back. Example: 3 posted nights of 7h / 6h / 10h → avgNight ≈ 7.67h,
    // stored as 53.67, caller divides by 7 → 7:40 shown. This matches people's
    // intuition that "ਨੀਂਦ" means "how much I'm sleeping", not "cumulative".
    if (cat.key === 'neend') {
      const nights = rows.map(r => Number(r[cat.key]))
        .filter(v => Number.isFinite(v) && v > 0)
        .map(v => sanitizeHours('neend', v))

      // Prefer the /WEEK cumulative from the latest row — users often include
      // ALL 7 nights there even if they only posted reports on some days (so it
      // represents actual total sleep better than summing reported-day values).
      const weekVals = rows
        .map(r => { const w = r._weeks?.[cat.key]; return w != null ? sanitizeHours('neend', Number(w)) : null })
        .filter(v => v != null && Number.isFinite(v) && v > 0)
      const weekTotal = weekVals.length ? Math.max(...weekVals) : null

      if (nights.length) {
        const nightSum = nights.reduce((a, b) => a + b, 0)
        // /WEEK is the authoritative running total — prefer it whenever present.
        // Fall back to per-day sum only when no /WEEK field was ever written.
        const preferredSum = weekTotal != null ? weekTotal : nightSum
        // Store as preferredSum so caller's ÷7 yields the correct per-day average.
        totals[cat.key] = preferredSum
        totals['neend_sum'] = preferredSum
        usedWeekFields = true
      } else {
        totals[cat.key] = weekTotal ?? 0
        totals['neend_sum'] = weekTotal ?? 0
      }
      continue
    }

    // Preferred source: the LATEST row's /WEEK value — that's the admin's
    // running cumulative, so the last-posted figure is the week's total.
    // Fallback-1: the max across all rows (ignores accidental zero-resets).
    // Fallback-2: sum of per-day values.
    //
    // Each /WEEK value is sanitized first (per-row unit disambiguation). Then
    // we trust the latest-row value as the authoritative weekly total.
    const rowsSortedChrono = [...rows].sort((a, b) => {
      const dA = a.day_index ?? -1, dB = b.day_index ?? -1
      if (dA !== dB) return dA - dB
      return (a.report_date < b.report_date) ? -1 : 1
    })

    // Cross-row consistency pass: the /WEEK cumulative should MONOTONICALLY
    // INCREASE across days (users sometimes forget to carry it forward, so
    // a dip is tolerated — but if an earlier row's "hours" is larger than
    // ALL later rows' /WEEK values, that earlier figure was almost certainly
    // minutes). Rebuild the per-row series with this correction.
    //
    // Collect (dayIdx, raw /WEEK, sanitized /WEEK) tuples.
    const series = []
    for (const r of rowsSortedChrono) {
      const wk = r._weeks?.[cat.key]
      if (wk == null || !Number.isFinite(Number(wk)) || wk <= 0) continue
      series.push({ day: r.day_index ?? 0, raw: Number(wk), san: sanitizeHours(cat.key, Number(wk)) })
    }
    // If the LAST row's sanitized /WEEK is significantly smaller than an
    // earlier row's sanitized /WEEK, re-check that earlier row: maybe it was
    // actually minutes but didn't trip the sanity cap. Rule: if an earlier
    // value divided by 60 (minute interpretation) is ≤ the later value and
    // still non-zero, prefer the minute interpretation.
    if (series.length >= 2) {
      const last = series[series.length - 1].san
      for (let i = 0; i < series.length - 1; i++) {
        const s = series[i]
        if (s.san > last * 1.5 && s.san / 60 < last + 1e-9 && s.san / 60 > 0) {
          s.san = s.san / 60
        }
      }
    }

    let latestWeek = series.length ? series[series.length - 1].san : null
    let maxWeek = null
    for (const s of series) maxWeek = maxWeek == null ? s.san : Math.max(maxWeek, s.san)

    if (latestWeek != null) {
      // Trust the latest cumulative figure; it's what the user signed off on.
      totals[cat.key] = latestWeek
      usedWeekFields = true
    } else if (maxWeek != null) {
      totals[cat.key] = maxWeek
      usedWeekFields = true
    } else {
      // Fallback: sum the day fields (sanitized per row) across all rows.
      let s = 0
      for (const r of rows) {
        const v = r[cat.key]
        if (v != null && Number.isFinite(Number(v))) s += sanitizeHours(cat.key, Number(v))
      }
      totals[cat.key] = s
    }
  }

  return { totals, usedWeekFields, bestRow: latest }
}

// ── Weekly aggregation / pass-fail (new rules) ────────────────────────────────
//
// Pass rules (from admin, 15 Nov 2026) — all weekly sums:
//   1. ਗੁਰਮੰਤ੍ਰ: ≥7h tikaa AND ≥28h turde (total 35h)
//   2. ਗੁਰਬਾਣੀ: ≥15h
//   3. ਵਿਚਾਰ: ≥2h
//   4. ਸਹਿਜ ਪਾਠ: ≥7 (minutes)
//   5. ਹੱਥੀ ਸੇਵਾ: ≥2 days
//   6. ≥1 day where the 3 disciplines are ticked (not necessarily the same day —
//      but at minimum the user had one day each of eye_bibek, no_faults,
//      no_complaint across the week). Admin says any mix is fine.

const PASS_REQUIRED = [
  { key: 'gurmantar_tikaa', target: 7 },
  { key: 'gurmantar_turde', target: 28 },
  { key: 'gurbani', target: 15 },
  { key: 'vichar', target: 2 },
  { key: 'sehajpath', target: 7 },
  { key: 'sewa', target: 2 },
]

// Compute weekly totals + pass status from a list of day records (one week).
// Each row is the DB shape (whatsapp_name, report_date, …).
export function computeWeekly(rows) {
  const totals = {}
  for (const cat of CATEGORIES) totals[cat.key] = 0
  const boolDays = { eye_bibek: 0, no_faults: 0, no_complaint: 0 }
  let daysReported = 0

  for (const row of rows) {
    daysReported++
    for (const cat of CATEGORIES) {
      const v = row[cat.key]
      if (v != null && Number.isFinite(Number(v))) totals[cat.key] += Number(v)
    }
    for (const bf of BOOL_FIELDS) {
      if (row[bf.key] === true) boolDays[bf.key]++
    }
  }

  const checks = PASS_REQUIRED.map(r => ({
    key: r.key,
    target: r.target,
    value: totals[r.key] || 0,
    passed: (totals[r.key] || 0) >= r.target - 1e-9,
  }))
  const disciplinePass = (boolDays.eye_bibek >= 1) && (boolDays.no_faults >= 1) && (boolDays.no_complaint >= 1)
  const allPassed = checks.every(c => c.passed) && disciplinePass

  // Combined gurmantar total (for convenience in the UI/image).
  totals.gurmantar_total = (totals.gurmantar_tikaa || 0) + (totals.gurmantar_turde || 0)

  return {
    totals,
    checks,
    boolDays,
    disciplinePass,
    daysReported,
    passed: allPassed,
  }
}