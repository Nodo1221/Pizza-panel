export interface Slice { key: string; name: string; g: number }

const CX = 210
const CY = 125
const R = 92 // slices
const RIM = 103 // outer edge of the crust
const H = 260
const GAP = 17 // minimum vertical distance between labels
const TAU = Math.PI * 2

// Charred spots on the crust, as degrees and radius. Fixed so the pizza doesn't change between renders.
const SPOTS = [[15, 2], [62, 1.5], [118, 2.2], [170, 1.6], [228, 2], [281, 1.7], [329, 2.3]].map(([deg, r]) => ({
  x: CX + 97 * Math.cos((deg * Math.PI) / 180),
  y: CY + 97 * Math.sin((deg * Math.PI) / 180),
  r,
}))
const at = (t: number, rad: number) => `${(CX + rad * Math.cos(t)).toFixed(2)} ${(CY + rad * Math.sin(t)).toFixed(2)}`
const dir = (t: number): 1 | -1 => (Math.cos(t) >= 0 ? 1 : -1)

export default function Pie({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, x) => a + x.g, 0)
  if (total <= 0) return null

  let from = -Math.PI / 2
  const items = slices.map(x => {
    const span = (x.g / total) * TAU
    const it = { ...x, from, span, mid: from + span / 2, share: (x.g / total) * 100 }
    from += span
    return it
  })

  // One cut line per slice boundary. Boundaries closer than about 1.5 degrees merge into a single line.
  const cuts: number[] = []
  for (const it of items) {
    const last = cuts[cuts.length - 1]
    if (last !== undefined && it.from - last < 0.026) cuts[cuts.length - 1] = (last + it.from) / 2
    else cuts.push(it.from)
  }
  if (cuts.length > 1 && cuts[0] + TAU - cuts[cuts.length - 1] < 0.026) {
    cuts[0] = (cuts[0] + TAU + cuts[cuts.length - 1]) / 2 - TAU
    cuts.pop()
  }

  // Labels sit left or right of the pizza; spread them so they never overlap.
  const labels = items.map(it => ({ it, s: dir(it.mid), y: Math.max(12, CY + (RIM + 22) * Math.sin(it.mid)) }))
  for (const s of [1, -1]) {
    const col = labels.filter(l => l.s === s).sort((a, b) => a.y - b.y)
    col.forEach((l, i) => {
      if (i > 0) l.y = Math.max(l.y, col[i - 1].y + GAP)
    })
    const over = col.length ? col[col.length - 1].y - (H - 10) : 0
    if (over > 0) col.forEach(l => { l.y -= over })
  }

  return (
    <svg className="pie" viewBox="0 0 420 260" role="img" aria-label="Share of each ingredient in the dough, by weight">
      <circle className="crust" cx={CX} cy={CY} r="97" />
      {items.map(it => (
        <path
          key={it.key}
          d={`M${CX} ${CY} L${at(it.from, R)} A${R} ${R} 0 ${it.span > Math.PI ? 1 : 0} 1 ${at(it.from + it.span, R)} Z`}
          style={{ fill: `var(--p-${it.key})`, stroke: `var(--p-${it.key})` }}
        >
          <title>{`${it.name}: ${it.share.toFixed(1)}% of the dough by weight`}</title>
        </path>
      ))}
      {SPOTS.map((p, i) => <circle key={i} className="spot" cx={p.x} cy={p.y} r={p.r} />)}
      {cuts.map(t => <line key={t} className="cut" x1={CX} y1={CY} x2={CX + 104 * Math.cos(t)} y2={CY + 104 * Math.sin(t)} />)}
      {labels.map(({ it, s, y }) => {
        const ex = CX + s * (RIM + 22)
        const lx = ex + s * 6
        return (
          <g key={it.key}>
            <path className="lead" d={`M${at(it.mid, RIM)} L${ex} ${y} L${lx} ${y}`} />
            <text x={lx + s * 4} y={y + 4} textAnchor={s === 1 ? 'start' : 'end'}>
              {it.name.replace(/ \(.*\)$/, '')} <tspan>{it.share.toFixed(it.share < 1 ? 2 : 1)}%</tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}
