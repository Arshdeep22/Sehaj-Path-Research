// Shared parsing for the WhatsApp "ਜਾਪ" chat export.
// Used by the admin report view (/admin/chat-report) and the DB importer.
//
// Two report shapes exist in the wild:
//   • Weekly summary — one number per category (the week total).
//   • Daily (current, ~Nov 2026+) — each category shows "ਦਿਨ/ਹਫ਼ਤਾ: DAY/WEEK"
//     plus ਅੰਮ੍ਰਿਤ ਵੇਲਾ / ਸੰਧਿਆ ਵੇਲਾ start times and a "ਦਿਨ: X/੭" week-day index.
// The weekly pass/fail view reads the WEEK number; analytics reads the DAY number.

export const CATEGORIES = [
  {
    key: 'gurmantar',
    label: 'ਗੁਰਮੰਤਰ',
    emoji: '🌼',
    weeklyTarget: 100000,
    keywords: ['ਗੁਰਮੰਤਰ', 'ਗੁਰਮੰਤ੍ਰ', 'ਗੁਰਮੰਤ', 'gurmantar', 'mantar'],
  },
  {
    key: 'brahmkavach',
    label: 'ਬ੍ਰਹਮਕਵੱਚ',
    emoji: '⚔️',
    weeklyTarget: 40,
    keywords: ['ਬ੍ਰਹਮਕਵੱਚ', 'ਬ੍ਰਹਮ ਕਵਚ', 'ਕਵੱਚ', 'ਕਵਚ', 'brahmkavach', 'kavach'],
  },
  {
    key: 'birharhe',
    label: 'ਬਿਰਹੜੇ',
    emoji: '💘',
    weeklyTarget: 15,
    keywords: ['ਬਿਰਹੜੇ', 'ਬਿਰਹ', 'birharhe', 'birhare'],
  },
  {
    key: 'japji',
    label: 'ਜਪਜੀ ਸਾਹਿਬ',
    emoji: '⏰',
    weeklyTarget: 3.5,
    keywords: ['ਜਪਜੀ', 'ਜਪੁਜੀ', 'ਉਠਦਿਆ', 'japji'],
  },
  {
    key: 'sewa',
    label: 'ਹੱਥੀ ਸੇਵਾ',
    emoji: '🤲🏻',
    weeklyTarget: 5,
    keywords: ['ਸੇਵਾ', 'ਹੱਥੀ', 'sewa'],
  },
  {
    key: 'sehajpath',
    label: 'ਸਹਿਜ ਪਾਠ',
    emoji: '📖',
    weeklyTarget: 7,
    keywords: ['ਸਹਿਜ ਪਾਠ', 'ਸਹਿਜਪਾਠ', 'ਸਹਿਜ', 'sehaj path', 'sehajpath', 'sehaj'],
  },
]

// Per-day expectation used to colour the analytics calendar (weekly / 7).
export const CATEGORY_DAILY = CATEGORIES.map(c => ({ ...c, dailyTarget: c.weeklyTarget / 7 }))

// ── Number helpers ──────────────────────────────────────────────────────────

export function punjNumToArabic(str) {
  return str
    .replace(/੦/g, '0').replace(/੧/g, '1').replace(/੨/g, '2').replace(/੩/g, '3')
    .replace(/੪/g, '4').replace(/੫/g, '5').replace(/੬/g, '6').replace(/੭/g, '7')
    .replace(/੮/g, '8').replace(/੯/g, '9')
}

export function extractNumber(text) {
  const normalized = punjNumToArabic(text).replace(/,/g, '').replace(/،/g, '')
  const matches = [...normalized.matchAll(/\d+(?:\.\d+)?/g)]
  if (!matches.length) return null
  // Use the largest number — avoids taking small ordinals like ੧ in "੧ ਹਫ਼ਤੇ - ੬੦,੦੦੦"
  return Math.max(...matches.map(m => parseFloat(m[0])))
}

// From a "ਦਿਨ/ਹਫ਼ਤਾ: D/W" (or single-number) line → { day, week }.
// First number is the day's count, second (if any) the week's running total.
export function extractDailyPair(line) {
  const normalized = punjNumToArabic(line).replace(/,/g, '').replace(/،/g, '')
  const nums = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]))
  if (!nums.length) return null
  return { day: nums[0], week: nums.length > 1 ? nums[1] : null }
}

// From a "ਦਿਨ: X/੭" header, return the week-day index/indices the message covers.
// Usually one ("ਦਿਨ: ੨/੭" → [2]), but people catch up on two or more days in a
// single message and write "ਦਿਨ: ੬+੭/੭" (= days 6 and 7, with a COMBINED total
// in each category). Also handles "6,7", "6 7", and "5-7" (range → [5,6,7]).
// Commas are NOT stripped here (unlike extractDailyPair) because on the day side
// a comma separates days, it is not a thousands separator — indices are ≤ 7.
export function extractDayIndices(line) {
  const normalized = punjNumToArabic(line)
  const daySide = normalized.replace(/^[^:：]*[:：]/, '').split('/')[0]
  const nums = [...daySide.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]))
  if (!nums.length) return []
  // "5-7" range (gap > 1) → expand; "6-7"/"6+7"/"6,7" are already the full list.
  if (nums.length === 2 && /\d\s*-\s*\d/.test(daySide) && nums[1] > nums[0] + 1) {
    const out = []
    for (let d = nums[0]; d <= nums[1]; d++) out.push(d)
    return out
  }
  return nums
}

// Parse a vela time string → minutes since midnight (local day).
// Handles "੩:੧੫ am", "੧੨.੧੫ am", "੬ pm", "ਸਵੇਰੇ ੩:੦੦", "ਸ਼ਾਮ ੭:੦੦".
// defaultMeridiem ('am' | 'pm') is used only when the text gives no am/pm hint.
export function parseVelaTime(str, defaultMeridiem) {
  if (!str) return { min: null, raw: '' }
  const raw = str.trim()
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
  // no meridiem: take the hour as written (24h-ish)

  const min = hour * 60 + (Number.isNaN(minute) ? 0 : minute)
  return { min: min >= 0 && min < 1440 ? min : null, raw }
}

// ── Timestamp / date helpers ──────────────────────────────────────────────────

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

// Reporting week range anchored to refDate (Sunday→Saturday, end extended to
// the following Sunday 6 PM so Sunday-morning reports are still counted).
export function getReportWeekRange(refDate = new Date()) {
  const d = refDate.getDay()
  const daysToSat = d === 6 ? 0 : d + 1

  const reportSaturday = new Date(refDate)
  reportSaturday.setDate(reportSaturday.getDate() - daysToSat)
  reportSaturday.setHours(0, 0, 0, 0)

  const reportSunday = new Date(reportSaturday)
  reportSunday.setDate(reportSunday.getDate() - 6)

  const sundayAfter = new Date(reportSaturday)
  sundayAfter.setDate(sundayAfter.getDate() + 1)
  sundayAfter.setHours(18, 0, 0, 0)

  return { start: reportSunday, end: sundayAfter }
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

// ── Weekly (summary) parsing — used by the pass/fail report view ───────────────

export function parseMessageForCategories(text) {
  const lines = text.split('\n')
  const result = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const cat of CATEGORIES) {
      if (result[cat.key] !== undefined) continue
      if (cat.keywords.some(kw => line.includes(kw))) {
        const num = extractNumber(line)
        if (num !== null) {
          result[cat.key] = num
        } else {
          let fallbackNum = null
          let weeklyNum = null
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nxt = lines[j]
            if (CATEGORIES.some(c => c.key !== cat.key && c.keywords.some(kw => nxt.includes(kw)))) break
            const n = extractNumber(nxt)
            if (n !== null) {
              if (fallbackNum === null) fallbackNum = n
              if (/ਹਫ਼ਤ|ਹਫ਼ਤੇ|ਹਫ਼ਤਾ|week/i.test(nxt) && weeklyNum === null) weeklyNum = n
            }
          }
          const chosen = weeklyNum ?? fallbackNum
          if (chosen !== null) result[cat.key] = chosen
        }
      }
    }
  }
  return result
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
    } else if (TIMESTAMP_RE.test(line) || line.startsWith('## ') || line.startsWith('# ') || line.startsWith('---')) {
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

export function getLatestReport(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const parsed = parseMessageForCategories(texts[i])
    if (Object.keys(parsed).length > 0) return parsed
  }
  return null
}

// ── Daily parsing (analytics) ──────────────────────────────────────────────────

const DAY_HEADER_RE = /^\s*ਦਿਨ\s*[:：]/   // "ਦਿਨ: ੨/੭" — NOT "ਦਿਨ/ਹਫ਼ਤਾ: ..."
const FATEH_RE = /ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ/

// Does this text look like a daily/weekly sadhana report at all?
// Needs ≥2 category keywords AND actual report structure — a "ਦਿਨ/ਹਫ਼ਤਾ: X/Y"
// value line or a "ਦਿਨ: N/੭" day header. This rejects announcements that merely
// name categories or mention ਵੇਲਾ in prose (e.g. the weekly-rules message).
export function looksLikeReport(text) {
  const hits = CATEGORIES.filter(c => c.keywords.some(kw => text.includes(kw))).length
  if (hits < 2) return false
  return /ਦਿਨ\s*\/\s*ਹਫ/.test(text) || /ਦਿਨ\s*[:：]\s*[੦-੯\d]/.test(text)
}

// Split one message into report blocks so a message covering multiple days
// (people sometimes catch up two days at once) yields one record per day.
function splitReportBlocks(text) {
  const lines = text.split('\n')
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    if (DAY_HEADER_RE.test(lines[i])) starts.push(i)
  }
  // No explicit day headers → fall back to ਫ਼ਤਿਹ greeting boundaries, else one block.
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

// Parse a single block's lines into category day-values, vela times, day index.
function parseBlock(blockLines) {
  const out = { values: {}, weeks: {}, day_index: null, day_indices: null, amrit: { min: null, raw: '' }, sandhya: { min: null, raw: '' } }

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i]

    // Day index "ਦਿਨ: X/੭" — may carry several ("ਦਿਨ: ੬+੭/੭" = days 6 & 7).
    if (out.day_indices === null && DAY_HEADER_RE.test(line)) {
      const idxs = extractDayIndices(line)
      if (idxs.length) { out.day_indices = idxs; out.day_index = idxs[0] }
    }

    // Vela lines
    if (out.amrit.min === null && line.includes('ਅੰਮ੍ਰਿਤ') && line.includes('ਵੇਲਾ')) {
      out.amrit = parseVelaTime(line.split(/[:：]/).slice(1).join(':'), 'am')
    }
    if (out.sandhya.min === null && line.includes('ਸੰਧਿਆ')) {
      out.sandhya = parseVelaTime(line.split(/[:：]/).slice(1).join(':'), 'pm')
    }

    // Category label → read the value from the same or next ≤2 lines.
    for (const cat of CATEGORIES) {
      if (out.values[cat.key] !== undefined) continue
      // Skip the vela lines (they contain ਵੇਲਾ, never a category value)
      if (line.includes('ਵੇਲਾ')) continue
      if (!cat.keywords.some(kw => line.includes(kw))) continue

      for (let j = i; j < Math.min(i + 3, blockLines.length); j++) {
        const probe = blockLines[j]
        // The value line carries "ਦਿਨ/ਹਫ਼ਤਾ" or at least a number; skip other category labels.
        if (j !== i && CATEGORIES.some(c => c.key !== cat.key && c.keywords.some(kw => probe.includes(kw)))) break
        if (probe.includes('ਵੇਲਾ')) continue
        const isValueLine = /ਦਿਨ\s*\/\s*ਹਫ|ਹਫ਼ਤਾ|ਹਫਤਾ/.test(probe) || (j > i && /\d|[੦-੯]/.test(probe))
        if (!isValueLine) continue
        const pair = extractDailyPair(probe)
        if (pair) { out.values[cat.key] = pair.day; out.weeks[cat.key] = pair.week; break }
      }
    }
  }
  return out
}

// Expand a block that covers multiple days ("ਦਿਨ: ੬+੭/੭" with a combined total)
// into one block per day. The combined category totals are split EVENLY across
// the days (we have no per-day breakdown); vela times stay on the latest day
// only, since a wake/evening time can't be divided.
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
      // Interpolate the cumulative so consecutive sub-day deltas equal the split.
      for (const key of Object.keys(b.weeks || {})) {
        const w = b.weeks[key]
        const d = b.values[key]
        weeks[key] = (w == null || d == null) ? (isLatest ? w : null) : w - (k - 1 - i) * (d / k)
      }
      out.push({
        values,
        weeks,
        day_index: idx,
        day_indices: [idx],
        amrit: isLatest ? b.amrit : { min: null, raw: '' },
        sandhya: isLatest ? b.sandhya : { min: null, raw: '' },
      })
    })
  }
  return out
}

// Parse a whole message (with its timestamp) into per-day records.
// Returns [] when the message isn't a report.
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
    return rec
  })
}

// Build DB-ready records for every real sender across the whole chat.
// Per sender the reports are split into reporting weeks (cumulative resets), and
// within each week: catch-up gaps are filled, per-category day values are
// reconciled against the running total, and records are placed on calendar days
// inside that week. People don't post duplicate reports, so each genuine report
// resolves to one distinct day.
export function buildDailyRecords(messages, removedNames = new Set()) {
  const bySender = new Map()
  for (const msg of messages) {
    if (msg.sender === 'You' || removedNames.has(msg.sender)) continue
    const recs = parseDailyReports(msg.text, msg.timestamp)
    if (!recs.length) continue
    if (!bySender.has(msg.sender)) bySender.set(msg.sender, [])
    for (const rec of recs) bySender.get(msg.sender).push({ rec, ts: msg.timestamp, raw: msg.text })
  }

  const out = []
  for (const [sender, items] of bySender) {
    items.sort((a, b) => (a.ts?.getTime() || 0) - (b.ts?.getTime() || 0))
    for (const seg of segmentByWeek(items)) {
      for (const { rec, raw, date } of processSegment(seg)) {
        const { _weeks, ...clean } = rec
        out.push({ whatsapp_name: sender, raw_message: raw, ...clean, report_date: date })
      }
    }
  }
  return out
}

// Turn one reporting-week segment into dated day-records.
//  • When the day-index (ਦਿਨ: N/੭) forms a reliable ladder (strictly increasing,
//    within 1..7), map each day to its calendar date (weekStart + N−1) and rebuild
//    every category from the running-total deltas, spreading a delta across any
//    skipped day-indices. This treats the cumulative as the source of truth and
//    handles catch-ups (Guneet, Harleen) and stale day fields alike, while the
//    day-index ladder fixes scrambled posting dates.
//  • When the day-index is unreliable (duplicated/missing labels, e.g. Arsh), fall
//    back to magnitude-based gap filling + date-ordered consistency resolution,
//    then place dates within the reporting week.
function processSegment(seg) {
  const dis = seg.map(it => it.rec.day_index)
  const reliable = seg.length >= 2 &&
    dis.every(d => d != null && d >= 1 && d <= 7) &&
    dis.every((d, i) => i === 0 || d > dis[i - 1])

  if (!reliable) {
    const filled = fillSenderGaps(seg)
    resolveByDate(filled)
    return assignWeekDates(filled)
  }

  let latestTs = null
  for (const it of seg) { const t = it.ts?.getTime?.(); if (t != null && (latestTs == null || t > latestTs)) latestTs = t }
  const start = new Date(getReportWeekRange(latestTs != null ? new Date(latestTs) : new Date()).start)
  start.setHours(0, 0, 0, 0)
  const dateForDi = di => { const d = new Date(start); d.setDate(d.getDate() + (di - 1)); return toLocalDateStr(d) }

  const byDi = new Map(seg.map(it => [it.rec.day_index, it]))
  const minDi = Math.min(...dis), maxDi = Math.max(...dis)
  const chain = []
  for (let di = minDi; di <= maxDi; di++) {
    const existing = byDi.get(di)
    if (existing) {
      chain.push({ ...existing, rec: { ...existing.rec, report_date: dateForDi(di) } })
    } else {
      const template = byDi.get(maxDi)
      const rec = { report_date: dateForDi(di), day_index: di, _weeks: {}, amrit_vela_min: null, amrit_vela_raw: null, sandhya_vela_min: null, sandhya_vela_raw: null }
      for (const c of CATEGORIES) { rec[c.key] = null; rec._weeks[c.key] = null }
      chain.push({ rec, ts: template?.ts ?? null, raw: template?.raw ?? null })
    }
  }

  // Rebuild each category from running-total deltas, spread over day-index gaps.
  for (const cat of CATEGORIES) {
    const key = cat.key
    const hasWeek = chain.some(e => e.rec._weeks?.[key] != null)
    if (!hasWeek) continue   // no cumulative info → keep whatever day values exist
    let prevW = 0, prevDi = minDi - 1
    for (const e of chain) {
      const w = e.rec._weeks?.[key]
      if (w == null) continue
      const di = e.rec.day_index
      const span = Math.max(1, di - prevDi)
      const per = Math.max(0, (w - prevW) / span)
      for (let d = prevDi + 1; d <= di; d++) {
        const target = chain.find(x => x.rec.day_index === d)
        if (target) target.rec[key] = per
      }
      prevW = w; prevDi = di
    }
  }

  return chain.map(e => ({ rec: e.rec, raw: e.raw, date: e.rec.report_date }))
}

// Split a sender's chronologically-sorted reports into reporting weeks. A new
// week begins where the gurmantar running total resets (drops below the current
// segment's max) or after a long (>9 day) gap between messages. This keeps two
// different weeks posted close together (e.g. a prior-week summary and the new
// week's day 1 on the same day) from being mixed.
function segmentByWeek(items) {
  const segments = []
  let cur = []
  let maxG = null
  let lastTs = null
  for (const it of items) {
    const g = it.rec._weeks?.gurmantar
    const ts = it.ts?.getTime?.() ?? null
    const longGap = lastTs != null && ts != null && (ts - lastTs) > 9 * 86400000
    const reset = g != null && maxG != null && g < maxG - 1e-6
    if (cur.length && (reset || longGap)) { segments.push(cur); cur = []; maxG = null }
    cur.push(it)
    if (g != null) maxG = maxG == null ? g : Math.max(maxG, g)
    if (ts != null) lastTs = ts
  }
  if (cur.length) segments.push(cur)
  return segments
}

// Fallback resolution for segments whose day-index ladder is unreliable: trust
// the per-day field, but if the day values don't add up to the week's running
// total, rebuild them from the running-total deltas in date order (no gap
// spreading). Categories that already reconcile are left untouched. Mutates records.
function resolveByDate(items) {
  if (!items.length) return
  const ordered = [...items].sort((a, b) =>
    (a.rec.report_date < b.rec.report_date ? -1 : a.rec.report_date > b.rec.report_date ? 1 : 0) ||
    ((a.ts?.getTime() || 0) - (b.ts?.getTime() || 0))
  )
  for (const cat of CATEGORIES) {
    const key = cat.key
    let prevW = 0, sumDay = 0, finalW = null, haveWeek = false
    const steps = []
    for (const it of ordered) {
      const d = it.rec[key]
      let w = it.rec._weeks?.[key]
      if (w == null) w = prevW           // carry forward → zero delta this step
      else haveWeek = true
      steps.push({ it, w })
      sumDay += (d == null ? 0 : d)
      finalW = w
      prevW = w
    }
    if (!haveWeek || finalW == null) continue        // no cumulative info → keep day field
    const tol = Math.max(0.5, finalW * 0.1)
    if (Math.abs(sumDay - finalW) <= tol) continue    // consistent → keep day field
    let pw = 0
    for (const st of steps) {
      st.it.rec[key] = Math.max(0, st.w - pw)
      pw = st.w
    }
  }
}

// Place a week segment's records on calendar days within their reporting week.
// The week is derived from the latest report (getReportWeekRange); each record's
// anchored date is clamped into [weekSunday, weekSaturday] and same-day
// collisions are spread to free days within that week. This keeps a previous
// week's summary in its own week rather than leaking into the current week.
function assignWeekDates(items) {
  let latestTs = null
  for (const it of items) {
    const t = it.ts?.getTime?.()
    if (t != null && (latestTs == null || t > latestTs)) latestTs = t
  }
  const wk = getReportWeekRange(latestTs != null ? new Date(latestTs) : new Date())
  const start = new Date(wk.start); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 6)   // Saturday
  const startStr = toLocalDateStr(start), endStr = toLocalDateStr(end)
  const clamped = items.map(it => {
    let ds = it.rec.report_date
    if (ds < startStr) ds = startStr
    else if (ds > endStr) ds = endStr
    return { ...it, rec: { ...it.rec, report_date: ds } }
  })
  return assignDistinctDates(clamped)
}

// Catch-up without the explicit "ਦਿਨ: ੬+੭" marker: a sender skips a day index
// (e.g. logs day 5 then day 7) and writes one unusually large value that really
// spans the skipped day(s). Detected by a day_index gap combined with a gurmantar
// value well above the sender's own normal day (median × 1.5). The value is split
// evenly across the gap days (with the running total interpolated to match);
// vela times stay on the latest day only. A normal-sized value after a gap is
// left alone (that day was genuinely skipped).
function fillSenderGaps(items) {
  const gVals = items.map(it => it.rec.gurmantar).filter(v => v != null && v > 0).sort((a, b) => a - b)
  const typical = gVals.length ? gVals[Math.floor(gVals.length / 2)] : null

  const out = []
  let prev = null
  for (const it of items) {
    const di = it.rec.day_index
    const pi = prev?.rec.day_index
    const gap = (di != null && pi != null) ? di - pi : 1
    const cur = it.rec.gurmantar
    const isBigCatchUp = gap > 1 && gap <= 6 && typical != null && cur != null && cur > typical * 1.5

    if (isBigCatchUp) {
      const k = gap
      const baseDate = parseDateStr(it.rec.report_date)
      for (let s = 0; s < k; s++) {
        const dayIdx = pi + 1 + s
        const isLatest = dayIdx === di
        const d = new Date(baseDate); d.setDate(d.getDate() - (di - dayIdx))
        const rec = { ...it.rec, report_date: toLocalDateStr(d), day_index: dayIdx }
        const weeks = {}
        for (const cat of CATEGORIES) {
          const v = it.rec[cat.key]
          rec[cat.key] = v == null ? v : v / k
          const W = it.rec._weeks?.[cat.key]
          weeks[cat.key] = (W == null || v == null) ? (isLatest ? W : null) : W - (k - 1 - s) * (v / k)
        }
        rec._weeks = weeks
        if (!isLatest) {
          rec.amrit_vela_min = null; rec.amrit_vela_raw = null
          rec.sandhya_vela_min = null; rec.sandhya_vela_raw = null
        }
        out.push({ rec, ts: it.ts, raw: it.raw })
      }
      prev = it
      continue
    }

    out.push(it)
    prev = it
  }
  return out
}

function parseDateStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

// Give every report its own day. Reports that resolved to the same candidate
// date are spread across consecutive free days *ending* at that date — ordered
// by day_index when present (most-recent day keeps the latest date), else by
// message time. Collision-free dates are claimed first so spreading only fills
// genuine gaps and never clobbers a day that was reported on its own.
function assignDistinctDates(items) {
  const groups = new Map()
  for (const it of items) {
    const d = it.rec.report_date
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(it)
  }

  const used = new Set()
  const result = []

  for (const [d, grp] of groups) {
    if (grp.length === 1) { used.add(d); result.push({ ...grp[0], date: d }) }
  }

  for (const [d, grp] of groups) {
    if (grp.length === 1) continue
    grp.sort((a, b) =>
      ((a.rec.day_index ?? 0) - (b.rec.day_index ?? 0)) ||
      ((a.ts?.getTime() || 0) - (b.ts?.getTime() || 0))
    )
    const cursor = parseDateStr(d)
    for (let i = grp.length - 1; i >= 0; i--) {
      let cs = toLocalDateStr(cursor)
      while (used.has(cs)) { cursor.setDate(cursor.getDate() - 1); cs = toLocalDateStr(cursor) }
      used.add(cs)
      result.push({ ...grp[i], date: cs })
      cursor.setDate(cursor.getDate() - 1)
    }
  }
  return result
}
