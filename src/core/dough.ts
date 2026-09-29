// No React or DOM imports here, so this file can be reused as-is in React Native or NativeScript.

export type YeastType = 'fresh' | 'instant' | 'active'
export type Surface = 'tray' | 'stone' | 'steel'
export type Mixing = 'hand' | 'stand' | 'spiral'

export interface Inputs {
  pizzas: number
  ballG: number
  hydration: number
  saltPct: number
  oilPct: number
  sugarPct: number
  protein: number
  yeast: YeastType
  roomC: number
  fridgeC: number
  flourC: number
  ddtC: number
  mixing: Mixing
  autolysisMin: number
  bulkH: number
  coldH: number
  proofH: number
  ovenC: number
  surface: Surface
  bakeAt: number // epoch ms, when the first pizza goes in
}

export interface Stage {
  label: string
  kind: 'prep' | 'room' | 'cold' | 'oven'
  start: number
  min: number
  note: string
  overlap?: boolean
}

export const PRESETS = {
  'Same day': { autolysisMin: 30, bulkH: 4, coldH: 0, proofH: 2 },
  Overnight: { autolysisMin: 30, bulkH: 2, coldH: 18, proofH: 2.5 },
  'Multi-day': { autolysisMin: 30, bulkH: 1.5, coldH: 62, proofH: 3 },
}

const FRICTION: Record<Mixing, number> = { hand: 4, stand: 12, spiral: 9 }
const YEAST_X: Record<YeastType, number> = { fresh: 1, instant: 1 / 3, active: 0.4 }
const SURFACE_BAKE: Record<Surface, number> = { tray: 1.4, stone: 1.15, steel: 1 }

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

// Yeast activity relative to 20 C. Doubles roughly every 7 C, capped at 35 C.
const activity = (c: number) => Math.exp(0.095 * (Math.min(c, 35) - 20))

// Fresh yeast % times room-equivalent hours. 2.8 puts a long room-temperature rise near
// 0.125% fresh yeast and a 24 h fridge dough near 0.3%. Tune it if your dough runs fast or slow.
const K = 2.8

export function suggestHydration(protein: number, surface: Surface, ovenC: number) {
  const base = 32 + 2.45 * protein
  const adj = (surface === 'tray' ? -3 : 0) + (ovenC < 250 ? -2 : 0)
  return Math.round((base + adj) * 2) / 2
}

export function compute(i: Inputs) {
  const eq = i.bulkH * activity(i.roomC) + i.coldH * activity(i.fridgeC) + i.proofH * activity(i.roomC)
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
  const preheat = i.surface === 'tray' ? 30 : 60

  const M = 60000
  const stages: Stage[] = [
    {
      label: 'Bake',
      kind: 'oven',
      start: i.bakeAt,
      min: i.pizzas * (bakeMin + 2),
      note: `${bakeMin.toFixed(1)} min per pizza at ${i.ovenC} °C, plus 2 min between pizzas`,
    },
  ]
  let t = i.bakeAt
  const before = (label: string, kind: Stage['kind'], min: number, note: string) => {
    if (min <= 0) return
    t -= min * M
    stages.unshift({ label, kind, start: t, min, note })
  }
  const wt = waterTemp.toFixed(0)
  before('Shape and top', 'prep', 20, 'Take the balls out only once the oven is at temperature')
  before('Balls at room temperature', 'room', i.proofH * 60, `${i.roomC} °C, covered`)
  before('Balls in the fridge', 'cold', i.coldH * 60, `${i.fridgeC} °C, sealed and lightly oiled`)
  before('Divide and ball', 'prep', 15, 'Tight balls, 1 cm apart in a lidded tray')
  before('Bulk rise', 'room', i.bulkH * 60, `${i.roomC} °C, covered`)
  before('Mix and knead', 'prep', 12, `Add salt and yeast. Aim for a ${i.ddtC} °C dough`)
  before('Autolysis', 'room', i.autolysisMin, `Flour and water at ${wt} °C only, no salt or yeast yet`)
  stages.push({
    label: 'Oven preheat',
    kind: 'oven',
    start: i.bakeAt - preheat * M,
    min: preheat,
    note: i.surface === 'tray' ? 'Highest setting, rack in the top third' : 'Highest setting with the stone or steel inside',
    overlap: true,
  })
  stages.sort((a, b) => a.start - b.start)

  const warnings: string[] = []
  const total = i.bulkH + i.coldH + i.proofH
  const cap = Math.max(8, 24 + (i.protein - 10.5) * 24)
  if (total > cap)
    warnings.push(`${total.toFixed(0)} h of fermentation is long for ${i.protein}% protein flour (comfortable up to about ${cap.toFixed(0)} h). The dough will turn slack and sticky.`)
  if (waterTemp > 40) warnings.push(`The water would need to be ${wt} °C, which damages yeast. Lower the target dough temperature or use cooler flour.`)
  if (waterTemp < 2) warnings.push(`The water would need to be ${wt} °C. Use ice water and lower the flour temperature.`)
  if ((i.surface === 'tray' || i.ovenC < 280) && i.sugarPct + i.oilPct === 0)
    warnings.push('Below about 300 °C without a steel the crust colours slowly. About 1% sugar and 2% oil help.')

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
    warnings,
  }
}
