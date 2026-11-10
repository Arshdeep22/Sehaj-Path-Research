// Decorative "sky" colouring for the vela charts, driven by India's sunrise/
// sunset times for the current month. The chart's y-axis is clock time, so each
// row can be painted with the real sky colour for that time of day, and stars
// only appear where it is genuinely night.

// Approximate monthly sunrise / sunset for India (minutes since local midnight).
// Averaged across the country — good enough for a backdrop, not an almanac.
const SUN_BY_MONTH = [
  { sunrise: 430, sunset: 1070 }, // Jan  ~7:10 / 17:50
  { sunrise: 420, sunset: 1095 }, // Feb  ~7:00 / 18:15
  { sunrise: 395, sunset: 1115 }, // Mar  ~6:35 / 18:35
  { sunrise: 360, sunset: 1130 }, // Apr  ~6:00 / 18:50
  { sunrise: 335, sunset: 1145 }, // May  ~5:35 / 19:05
  { sunrise: 325, sunset: 1160 }, // Jun  ~5:25 / 19:20
  { sunrise: 335, sunset: 1155 }, // Jul  ~5:35 / 19:15
  { sunrise: 350, sunset: 1135 }, // Aug  ~5:50 / 18:55
  { sunrise: 365, sunset: 1100 }, // Sep  ~6:05 / 18:20
  { sunrise: 380, sunset: 1070 }, // Oct  ~6:20 / 17:50
  { sunrise: 400, sunset: 1050 }, // Nov  ~6:40 / 17:30
  { sunrise: 420, sunset: 1055 }, // Dec  ~7:00 / 17:35
]

export function sunTimes(date = new Date()) {
  return SUN_BY_MONTH[date.getMonth()]
}

// Absolute colour keyframes across the day, anchored to the sun events. Dusk and
// dawn are stretched so the sky only reaches true black well after sunset / well
// before sunrise — stars then belong to that black band, not the coloured dusk.
function keyframes({ sunrise, sunset }) {
  return [
    [0, '#070b1f'],
    [sunrise - 150, '#070b1f'],
    [sunrise - 110, '#241d4a'],
    [sunrise - 70, '#5a3a6c'],
    [sunrise - 35, '#9c4f6e'],
    [sunrise - 5, '#e07a4f'],
    [sunrise + 25, '#f3c98a'],
    [sunrise + 60, '#ede1c8'],
    [sunset - 60, '#ede1c8'],
    [sunset - 25, '#f3c98a'],
    [sunset + 5, '#e07a4f'],
    [sunset + 35, '#9c4f6e'],
    [sunset + 70, '#5a3a6c'],
    [sunset + 110, '#241d4a'],
    [sunset + 150, '#070b1f'],
    [1440, '#070b1f'],
  ]
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex([r, g, b]) {
  const h = v => Math.round(v).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function lerp(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t) }
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Sky colour at a given clock minute.
export function skyColorAt(minute, sun) {
  const kf = keyframes(sun)
  if (minute <= kf[0][0]) return kf[0][1]
  for (let i = 1; i < kf.length; i++) {
    if (minute <= kf[i][0]) {
      const [m0, c0] = kf[i - 1], [m1, c1] = kf[i]
      const t = m1 === m0 ? 0 : (minute - m0) / (m1 - m0)
      return rgbToHex(lerp(hexToRgb(c0), hexToRgb(c1), t))
    }
  }
  return kf[kf.length - 1][1]
}

// Perceived luminance → is this colour dark enough to need light text on it?
export function isDarkColor(hex) {
  return luminance(hex) < 140
}

// How "starry" a given clock minute is: 1 in the black of night, fading to 0
// through dusk/dawn so stars never appear over a still-coloured sky.
export function nightAlpha(minute, sun) {
  const lum = luminance(skyColorAt(minute, sun))
  const HI = 42, LO = 14
  return Math.max(0, Math.min(1, (HI - lum) / (HI - LO)))
}

// Gradient stops mapping a time domain [yMin,yMax] top→bottom to sky colours.
export function skyStops(yMin, yMax, sun, steps = 14) {
  const out = []
  for (let i = 0; i <= steps; i++) {
    const m = yMin + (yMax - yMin) * (i / steps)
    out.push({ offset: i / steps, color: skyColorAt(m, sun) })
  }
  return out
}

