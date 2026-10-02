// No React or DOM imports here, so this file can be reused as-is in React Native or NativeScript.

export type YeastType = 'fresh' | 'instant' | 'active'
export type Surface = 'tray' | 'stone' | 'steel'
export type Mixing = 'hand' | 'stand' | 'spiral'
export type Style = 'same' | 'overnight' | 'multi'

export interface Inputs {
  pizzas: number
  ballG: number
  hydration: number
  saltPct: number
  oilPct: number
  sugarPct: number
  protein: number
  w: number // alveograph W, 0 if unknown
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

// Yeast activity relative to 20 C. Doubles roughly every 7 C, capped at 35 C.
const activity = (c: number) => Math.exp(0.095 * (Math.min(c, 35) - 20))

// Fresh yeast % times room-equivalent hours. 2.8 puts a long room-temperature rise near
// 0.125% fresh yeast and a 24 h fridge dough near 0.3%. Tune it if your dough runs fast or slow.
const K = 2.8

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

export function compute(i: Inputs) {
  const w = i.w > 0 ? i.w : estimateW(i.protein)

  // The times are worked out here, not entered: the style sets the aim, the flour's W limits it.
  const { min, max } = fermentRange(w)
  const want = WANT[i.style]
  const total = clamp(want, min, max)
  const chilled = i.style !== 'same' || total > 14
  const bulkH = chilled ? 2 : total * 0.65
  const proofH = chilled ? 2.5 : total - bulkH
  const coldH = chilled ? Math.max(0, total - bulkH - proofH) : 0
  const autolysisMin = w < 200 ? 20 : w < 320 ? 30 : 45
  const eq = bulkH * activity(i.roomC) + coldH * activity(i.fridgeC) + proofH * activity(i.roomC)
  const freshPct = clamp(K / Math.max(eq, 0.5), 0.02, 2)
  const pct: Record<YeastType, number> = {
    fresh: freshPct,
    instant: freshPct * YEAST_X.instant,
    active: freshPct * YEAST_X.active,
  }
  const yPct = pct[i.yeast]

  const dough = i.pizzas * i.ballG
  const flour = dough / (1 + (i.hydration + i.saltPct + i.oilPct + i.sugarPct + yPct) / 100)
  const amt = (p: number) => (flour * p) / 100
  const yeastG = amt(yPct)
  const dilute = yeastG > 0 && yeastG < 1 ? { solution: yeastG * 100, waterIn: yeastG * 99 } : null

  const waterTemp = 3 * i.ddtC - i.flourC - i.roomC - FRICTION[i.mixing]
  const bakeMin = (4 + (300 - i.ovenC) * 0.06) * SURFACE_BAKE[i.surface]

  const M = 60000
  const stages: Stage[] = [
    {
      label: 'Bake',
      kind: 'oven',
      start: 0,
      min: i.pizzas * (bakeMin + 2),
      note: `${bakeMin.toFixed(1)} min per pizza at ${i.ovenC} °C, plus 2 min between pizzas`,
    },
  ]
  let t = 0
  const before = (label: string, kind: Stage['kind'], min: number, note: string) => {
    if (min <= 0) return
    t -= min * M
    stages.unshift({ label, kind, start: t, min, note })
  }
  const wt = waterTemp.toFixed(0)
  before('Shape and top', 'prep', 20, 'Take the balls out only once the oven is at temperature')
  before('Balls at room temperature', 'room', proofH * 60, `${i.roomC} °C, covered`)
  before('Balls in the fridge', 'cold', coldH * 60, `${i.fridgeC} °C, sealed and lightly oiled`)
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

  const warnings: { text: string; alert: boolean }[] = []
  const alert = (text: string) => warnings.push({ text, alert: true })
  const wText = i.w > 0 ? `W ${w.toFixed(0)}` : `W ~${w.toFixed(0)}`
  if (Math.abs(total - want) > 2)
    alert(`${STYLES[i.style]} wants about ${want} h, but ${wText} works for ${min}\u2013${max.toFixed(0)} h. Planned ${total.toFixed(0)} h.`)
  if (waterTemp > 40) alert(`Water would need to be ${wt} \u00b0C, too hot for yeast. Cool the flour or lower the target dough temperature.`)
  if (waterTemp < 2) alert(`Water would need to be ${wt} \u00b0C. Use ice water and cooler flour.`)
  if ((i.surface === 'tray' || i.ovenC < 280) && i.sugarPct + i.oilPct === 0)
    warnings.push({ text: 'Below about 300 \u00b0C without a steel the crust colours slowly. About 1% sugar and 2% oil help.', alert: false })

  return {
    flour,
    water: amt(i.hydration),
    salt: amt(i.saltPct),
    oil: amt(i.oilPct),
    sugar: amt(i.sugarPct),
    yeastG,
    yeastAll: { fresh: amt(pct.fresh), instant: amt(pct.instant), active: amt(pct.active) },
    dilute,
    waterTemp,
    bakeMin,
    stages,
    range: { min, max },
    plan: { autolysisMin, bulkH, coldH, proofH, total },
    warnings,
  }
}
