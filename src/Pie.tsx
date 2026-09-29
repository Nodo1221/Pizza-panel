export interface Slice { key: string; name: string; g: number }

const R = 86
// Charred spots on the crust, as degrees and radius. Fixed so the pizza doesn't change between renders.
const SPOTS = [[15, 2], [62, 1.5], [118, 2.2], [170, 1.6], [228, 2], [281, 1.7], [329, 2.3]].map(([deg, r]) => ({
  x: 100 + 91 * Math.cos((deg * Math.PI) / 180),
  y: 100 + 91 * Math.sin((deg * Math.PI) / 180),
  r,
}))
const CUTS = Array.from({ length: 8 }, (_, i) => ((i + 0.5) * Math.PI) / 4)
const pt = (t: number) => `${(100 + R * Math.cos(t)).toFixed(2)} ${(100 + R * Math.sin(t)).toFixed(2)}`

export default function Pie({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, x) => a + x.g, 0)
  if (total <= 0) return null
  let from = -Math.PI / 2
  return (
    <svg className="pie" viewBox="0 0 200 200" role="img" aria-label="Share of each ingredient in the dough, by weight">
      <circle className="crust" cx="100" cy="100" r="91" />
      {slices.map(x => {
        const span = (x.g / total) * 2 * Math.PI
        const d = `M100 100 L${pt(from)} A${R} ${R} 0 ${span > Math.PI ? 1 : 0} 1 ${pt(from + span)} Z`
        from += span
        return (
          <path key={x.key} d={d} style={{ fill: `var(--p-${x.key})`, stroke: `var(--p-${x.key})` }}>
            <title>{`${x.name}: ${((x.g / total) * 100).toFixed(1)}% of the dough by weight`}</title>
          </path>
        )
      })}
      {SPOTS.map((p, i) => <circle key={i} className="spot" cx={p.x} cy={p.y} r={p.r} />)}
      {CUTS.map(t => <line key={t} className="cut" x1="100" y1="100" x2={100 + 97 * Math.cos(t)} y2={100 + 97 * Math.sin(t)} />)}
    </svg>
  )
}
