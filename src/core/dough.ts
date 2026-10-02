// No React or DOM imports here, so this file can be reused as-is in React Native or NativeScript.

export type YeastType = 'fresh' | 'instant' | 'active'
export type Surface = 'tray' | 'stone' | 'steel'
export type Mixing = 'hand' | 'stand' | 'spiral'
export type Style = 'same' | 'overnight' | 'multi'

export interface Inputs {
  pizzas: number
  ballG: number
  hydration: number
  w: number // flour strength, alveograph W
  wEst: boolean // true when W was estimated from protein instead of read from the pack
  yeast: YeastType
  roomC: number
  fridgeC: number
  flourC: number
  ddtC: number
  mixing: Mixing
  style: Style
  ovenC: number
  surface: Surface
}

export interface Stage {
  label: string
  kind: 'prep' | 'room' | 'cold' | 'oven'
  start: number // ms relative to the first pizza going in, so zero or negative
  min: number
  note: string
  overlap?: boolean
}

export const STYLES: Record<Style, string> = { same: 'Same day', overnight: 'Overnight', multi: 'Multi-day' }
// Total fermentation hours each style aims for, before it is fitted to the flour.
const WANT: Record<Style, number> = { same: 12, overnight: 24, multi: 48 }

const FRICTION: Record<Mixing, number> = { hand: 4, stand: 12, spiral: 9 }
const YEAST_X: Record<YeastType, number> = { fresh: 1, instant: 1 / 3, active: 0.4 }
const SURFACE_BAKE: Record<Surface, number> = { tray: 1.4, stone: 1.15, steel: 1 }

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

// Yeast activity relative to 20 C, doubling about every 4.7 C (dough at 3 C ferments roughly 11 times
// slower than at 20 C). Capped at 35 C.
const activity = (c: number) => Math.exp(0.147 * (Math.min(c, 35) - 20))

// Fresh yeast % for a schedule given as [hours, temperature] pieces: K / eq^P, where eq is the schedule
// in room-temperature-equivalent hours. Fitted to TXCraig1's yeast prediction chart and a Dough Doctor
// example (about 0.6% for 80 h at 3 C, 0.1% for 29 h at 17 C plus 2 h at 24 C, 0.15% for 20 h at 17 C
// plus 2 h at 24 C, 0.24% for 72 h at 7 C), all within about 15%. AVPN's own doses for 8 and 24 h at
// 23 C are about 2.6 times lower than this. Change K if your dough runs fast or slow.
const K = 9.4
const P = 1.48
export function freshYeastPct(parts: [number, number][]) {
  const eq = parts.reduce((a, [h, c]) => a + h * activity(c), 0)
  return clamp(K / Math.pow(Math.max(eq, 1), P), 0.01, 3)
}

// Typical W for a given protein %, from the midpoints of the ranges in Ooni's protein/W table.
// Protein and W do not convert reliably, so this is only a fallback when the pack has no W.
const PROTEIN_W: [number, number][] = [[9.5, 155], [10.5, 200], [11.5, 240], [12.5, 265], [13.5, 305], [14.5, 375]]
export function estimateW(protein: number) {
  if (protein <= PROTEIN_W[0][0]) return PROTEIN_W[0][1]
  for (let k = 1; k < PROTEIN_W.length; k++) {
    const [p1, w1] = PROTEIN_W[k]
    const [p0, w0] = PROTEIN_W[k - 1]
    if (protein <= p1) return w0 + ((protein - p0) / (p1 - p0)) * (w1 - w0)
  }
  return PROTEIN_W[PROTEIN_W.length - 1][1]
}

// Comfortable total fermentation hours by W, fitted to Ooni's W table: the upper limit rises
// about 0.35 h per W point, the lower limit steps up for strong flours.
export function fermentRange(w: number) {
  const max = Math.max(6, 0.35 * w - 58)
  const min = w < 225 ? 6 : w < 245 ? 8 : w < 295 ? 12 : w < 315 ? 16 : w < 345 ? 20 : w < 385 ? 24 : w < 425 ? 30 : 36
  return { min, max }
}

export function suggestHydration(w: number, surface: Surface, ovenC: number) {
  const base = 47 + 0.06 * w
  const adj = (surface === 'tray' ? -3 : 0) + (ovenC < 250 ? -2 : 0)
  return Math.round((base + adj) * 2) / 2
}

// Rough minutes per pizza on a steel at a given oven temperature; stone and tray are slower.
const BAKE: [number, number][] = [[230, 10], [250, 8], [275, 6], [300, 4.5], [350, 3], [400, 2], [450, 1.5], [500, 1.25]]
export function bakeTime(ovenC: number, surface: Surface) {
  let m = BAKE[BAKE.length - 1][1]
  if (ovenC <= BAKE[0][0]) m = BAKE[0][1]
  else
    for (let k = 1; k < BAKE.length; k++) {
      const [t1, m1] = BAKE[k]
      const [t0, m0] = BAKE[k - 1]
      if (ovenC <= t1) {
        m = m0 + ((ovenC - t0) / (t1 - t0)) * (m1 - m0)
        break
      }
    }
  return m * SURFACE_BAKE[surface]
}

export function compute(i: Inputs) {
  const w = clamp(i.w, 100, 450)

  // The times are worked out here, not entered: the style sets the aim, the flour's W limits it.
  const { min, max } = fermentRange(w)
  const want = WANT[i.style]
  const total = clamp(want, min, max)
  const chilled = i.style !== 'same' || total > 14
  const bulkH = chilled ? 2 : total * 0.65
  const proofH = chilled ? 2.5 : total - bulkH
  const coldH = chilled ? Math.max(0, total - bulkH - proofH) : 0
  const autolysisMin = w < 200 ? 20 : w < 320 ? 30 : 45

  // Four ingredients only, as in the AVPN spec. Salt is its 50-55 g per litre of water (5% to 5.5% of
  // the water, more for strong flour); yeast follows from the schedule and your kitchen temperatures.
  const saltPct = i.hydration * (0.05 + 0.005 * clamp((w - 280) / 30, 0, 1))
  const freshPct = freshYeastPct([[bulkH, i.roomC], [coldH, i.fridgeC], [proofH, i.roomC]])
  const yPct = freshPct * YEAST_X[i.yeast]

  const dough = Math.max(0, i.pizzas) * Math.max(0, i.ballG)
  const flour = dough / (1 + (i.hydration + saltPct + yPct) / 100)
  const amt = (p: number) => (flour * p) / 100
  const yeastG = amt(yPct)
  const dilute = yeastG > 0 && yeastG < 1 ? { solution: yeastG * 100, waterIn: yeastG * 99 } : null

  const waterTemp = 3 * i.ddtC - i.flourC - i.roomC - FRICTION[i.mixing]
  const bakeMin = bakeTime(i.ovenC, i.surface)

  const M = 60000
  const stages: Stage[] = [
    {
      label: 'Bake',
      kind: 'oven',
      start: 0,
      min: Math.max(0, i.pizzas) * (bakeMin + 2),
      note: `${bakeMin.toFixed(1)} min per pizza at ${i.ovenC} °C, plus 2 min between pizzas`,
    },
  ]
  let t = 0
  const before = (label: string, kind: Stage['kind'], mins: number, note: string) => {
    if (mins <= 0) return
    t -= mins * M
    stages.unshift({ label, kind, start: t, min: mins, note })
  }
  const wt = waterTemp.toFixed(0)
  before('Shape and top', 'prep', 20, 'Take the balls out only once the oven is at temperature')
  before('Balls at room temperature', 'room', proofH * 60, `${i.roomC} °C, covered`)
  before('Balls in the fridge', 'cold', coldH * 60, `${i.fridgeC} °C, sealed`)
  before('Divide and ball', 'prep', 15, 'Tight balls, 1 cm apart in a lidded tray')
  before('Bulk rise', 'room', bulkH * 60, `${i.roomC} °C, covered`)
  before('Mix and knead', 'prep', 12, `Add salt and yeast. Aim for a ${i.ddtC} °C dough`)
  before('Autolysis', 'room', autolysisMin, `Flour and water at ${wt} °C only, no salt or yeast yet`)
  if (i.surface !== 'tray')
    stages.push({
      label: 'Oven preheat',
      kind: 'oven',
      start: -60 * M,
      min: 60,
      note: 'Highest setting with the stone or steel inside',
      overlap: true,
    })
  stages.sort((a, b) => a.start - b.start)

  const alerts: string[] = []
  const wText = i.wEst ? `W ~${w.toFixed(0)}` : `W ${w.toFixed(0)}`
  if (Math.abs(total - want) > 2)
    alerts.push(`${STYLES[i.style]} wants about ${want} h, but ${wText} works for ${min}\u2013${max.toFixed(0)} h. Planned ${total.toFixed(0)} h.`)
  if (waterTemp > 40) alerts.push(`Water would need to be ${wt} \u00b0C, too hot for yeast. Cool the flour or lower the target dough temperature.`)
  if (waterTemp < 2) alerts.push(`Water would need to be ${wt} \u00b0C. Use ice water and cooler flour.`)

  return {
    flour,
    water: amt(i.hydration),
    salt: amt(saltPct),
    yeastG,
    dilute,
    waterTemp,
    bakeMin,
    stages,
    range: { min, max },
    pct: { salt: saltPct, yeast: yPct },
    plan: { autolysisMin, bulkH, coldH, proofH, total },
    alerts,
  }
}
