/**
 * Validates sleep (ਨੀਂਦ) parsing for every user in the zip.
 * Run: node scripts/validate-sleep.mjs
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

// ── load JSZip ────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url)
const JSZip   = require('jszip')

// ── load parser (ESM) ─────────────────────────────────────────────────────────
import {
  parseWhatsAppChat,
  getReportWeekRange,
  buildDailyRecords,
  extractWeeklyTotals,
} from '../lib/jaapParser.js'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtHM(h) {
  if (h == null || !isFinite(h)) return '—'
  const total = Math.round(h * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2,'0')}`
}

function sanitizeHoursNeend(v) {
  // mirrors sanitizeHours in the parser (cap=100)
  if (v > 100) return v / 60
  return v
}

// ── read zip ──────────────────────────────────────────────────────────────────
const ZIP_PATH = '/Users/i516386/Downloads/WhatsApp Chat with ਜਾਪ (1).zip'
const buf  = fs.readFileSync(ZIP_PATH)
const zip  = await JSZip.loadAsync(buf)

const allFiles = Object.keys(zip.files).filter(
  f => !zip.files[f].dir && (f.endsWith('.txt') || f.endsWith('.md')) && !f.includes('__MACOSX')
)
const txtFiles = allFiles.filter(f => f.endsWith('.txt'))
const candidates = txtFiles.length ? txtFiles : allFiles
const chatFile = candidates.find(f => f.toLowerCase().includes('chat')) || candidates[0]
const chatText = await zip.files[chatFile].async('text')

console.log(`\nUsing chat file: ${chatFile}\n`)

// ── parse ─────────────────────────────────────────────────────────────────────
const { messages, memberNames, removedNames } = parseWhatsAppChat(chatText)

let latestTs = null
for (const m of messages) if (m.timestamp && (!latestTs || m.timestamp > latestTs)) latestTs = m.timestamp
const { start, end: graceEnd } = getReportWeekRange(latestTs || new Date())

const inWindow = messages.filter(m => !m.timestamp || (m.timestamp >= start && m.timestamp <= graceEnd))
const records  = buildDailyRecords(inWindow, removedNames)

// group by name
const byName = new Map()
for (const r of records) {
  if (!byName.has(r.whatsapp_name)) byName.set(r.whatsapp_name, [])
  byName.get(r.whatsapp_name).push(r)
}

// ── validate ──────────────────────────────────────────────────────────────────
console.log('='.repeat(90))
console.log('SLEEP VALIDATION — per-user detail')
console.log('='.repeat(90))

let anyMismatch = false

for (const [name, rows] of [...byName].sort((a,b) => a[0].localeCompare(b[0]))) {
  const { totals } = extractWeeklyTotals(rows)

  // raw per-day neend values (before sanitize)
  const rawDayVals = rows
    .map(r => ({ date: r.report_date, day: r.neend, week: r._weeks?.neend }))
    .filter(x => x.day != null || x.week != null)
    .sort((a,b) => a.date < b.date ? -1 : 1)

  // what the parser computed
  const computedAvg   = (totals.neend || 0) / 7
  const computedTotal = totals.neend_sum || 0

  // manual recalculation for cross-check
  const sanitizedDays = rawDayVals
    .filter(x => x.day != null && isFinite(Number(x.day)) && Number(x.day) > 0)
    .map(x => sanitizeHoursNeend(Number(x.day)))
  const manualDaySum  = sanitizedDays.reduce((a,b) => a+b, 0)
  const weekVals = rawDayVals
    .filter(x => x.week != null && isFinite(Number(x.week)) && Number(x.week) > 0)
    .map(x => sanitizeHoursNeend(Number(x.week)))
  const manualWeekMax = weekVals.length ? Math.max(...weekVals) : null

  // mismatch flag: avg doesn't match total/7
  const expectedAvg = computedTotal / 7
  const mismatch = Math.abs(computedAvg - expectedAvg) > 0.02   // >1 min drift

  if (mismatch) anyMismatch = true

  console.log(`\n${name} (${rows.length}/7 days)`)
  console.log(`  Parser output  → avg: ${fmtHM(computedAvg)} | total (neend_sum): ${fmtHM(computedTotal)}`)
  console.log(`  Cross-check    → total/7: ${fmtHM(expectedAvg)} ${mismatch ? '⚠️  MISMATCH' : '✓'}`)
  console.log(`  Manual day-sum → ${fmtHM(manualDaySum)}h  |  /WEEK max → ${manualWeekMax != null ? fmtHM(manualWeekMax) : '—'}`)

  if (rawDayVals.length) {
    console.log('  Raw values:')
    for (const x of rawDayVals) {
      const daySan = x.day != null ? sanitizeHoursNeend(Number(x.day)) : null
      const wkSan  = x.week != null ? sanitizeHoursNeend(Number(x.week)) : null
      console.log(`    ${x.date}  day=${x.day ?? '—'} (→${daySan != null ? fmtHM(daySan) : '—'})  /WEEK=${x.week ?? '—'} (→${wkSan != null ? fmtHM(wkSan) : '—'})`)
    }
  } else {
    console.log('  (no neend data)')
  }
}

console.log('\n' + '='.repeat(90))
console.log(anyMismatch ? '⚠️  Some avg/total pairs are inconsistent (avg ≠ total÷7)' : '✓  All sleep avg/total pairs are consistent')
console.log('='.repeat(90) + '\n')
