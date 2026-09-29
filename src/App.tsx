import { useMemo, useState, type ReactNode } from 'react'
import { FLOURS } from './core/flours'
import { PRESETS, compute, suggestHydration, type Inputs, type Mixing, type Surface, type YeastType } from './core/dough'

type S = Omit<Inputs, 'bakeAt'> & { flourId: string; bakeStr: string; preset: string }
type NumKey = { [K in keyof S]: S[K] extends number ? K : never }[keyof S]

const pad = (n: number) => String(n).padStart(2, '0')
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const when = (ms: number) => new Date(ms).toLocaleString('pl-PL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const dur = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`)

function evening() {
  const d = new Date()
  d.setHours(19, 0, 0, 0)
  while (d.getTime() < Date.now() + 26 * 36e5) d.setDate(d.getDate() + 1)
  return local(d)
}

const init: S = {
  pizzas: 4, ballG: 250, hydration: suggestHydration(12.5, 'tray', 275), saltPct: 2.8, oilPct: 0, sugarPct: 0,
  protein: 12.5, flourId: 'caputo-pizzeria', yeast: 'fresh',
  roomC: 21, fridgeC: 4, flourC: 21, ddtC: 24, mixing: 'hand',
  ...PRESETS.Overnight, preset: 'Overnight',
  ovenC: 275, surface: 'tray', bakeStr: evening(),
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  )
}

const F = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="f"><span>{label}</span>{children}</label>
)
const Grp = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="f"><span>{label}</span>{children}</div>
)
const More = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <details className="more">
    <summary>{title}<span>{sub}</span></summary>
    <div className="body">{children}</div>
  </details>
)

export default function App() {
  const [s, setS] = useState<S>(init)
  const set = <K extends keyof S>(k: K, v: S[K]) => setS(p => ({ ...p, [k]: v }))
  const tune = <K extends keyof S>(k: K, v: S[K]) => setS(p => ({ ...p, [k]: v, preset: 'Custom' }))
  const bakeAt = new Date(s.bakeStr).getTime() || Date.now()
  const r = useMemo(() => compute({ ...s, bakeAt }), [s, bakeAt])
  const sug = suggestHydration(s.protein, s.surface, s.ovenC)
  const first = r.stages[0]

  const num = (k: NumKey, put: typeof set = set, step = 1) => (
    <input type="number" inputMode="decimal" step={step} value={s[k]} onChange={e => put(k, parseFloat(e.target.value) || 0)} />
  )
  const yName = { fresh: 'fresh', instant: 'instant dry', active: 'active dry' }[s.yeast]
  const rows: [string, number, number, number][] = [
    ['Flour', r.flour, 100, 0],
    ['Water', r.water, s.hydration, 0],
    ['Salt', r.salt, s.saltPct, 1],
    ...(s.oilPct > 0 ? [['Olive oil', r.oil, s.oilPct, 1] as [string, number, number, number]] : []),
    ...(s.sugarPct > 0 ? [['Sugar', r.sugar, s.sugarPct, 1] as [string, number, number, number]] : []),
    [`Yeast (${yName})`, r.yeastG, (r.yeastG / r.flour) * 100, 2],
  ]

  return (
    <div className="app">
      <aside className="side">
        <h1>Pizza dough</h1>

        <div className="g">
          <div className="row">
            <F label="Pizzas">{num('pizzas')}</F>
            <F label="Ball weight (g)">{num('ballG')}</F>
          </div>
          <F label="First pizza in the oven at">
            <input type="datetime-local" value={s.bakeStr} onChange={e => set('bakeStr', e.target.value)} />
          </F>
        </div>

        <div className="g">
          <F label="Flour">
            <select
              value={s.flourId}
              onChange={e => {
                const f = FLOURS.find(x => x.id === e.target.value)
                setS(p => ({ ...p, flourId: e.target.value, protein: f ? f.protein : p.protein }))
              }}
            >
              {FLOURS.map(f => <option key={f.id} value={f.id}>{f.name}{f.w ? `, W ${f.w}` : ''}</option>)}
              <option value="custom">Other flour</option>
            </select>
          </F>
          {s.flourId === 'custom' && (
            <F label="Protein (g per 100 g)">
              <input type="number" step={0.1} value={s.protein} onChange={e => set('protein', parseFloat(e.target.value) || 0)} />
            </F>
          )}
          <F label="Hydration (%)">{num('hydration', set, 0.5)}</F>
          {sug !== s.hydration && (
            <p className="hint">Suggested: {sug}%. <button type="button" className="link" onClick={() => set('hydration', sug)}>Use it</button></p>
          )}
          <Grp label="Yeast">
            <Seg<YeastType> value={s.yeast} onPick={v => set('yeast', v)} options={[['fresh', 'Fresh'], ['instant', 'Instant'], ['active', 'Active dry']]} />
          </Grp>
        </div>

        <div className="g">
          <Grp label="Schedule">
            <Seg
              value={s.preset}
              options={[...Object.keys(PRESETS), 'Custom'].map(k => [k, k] as [string, string])}
              onPick={k => k in PRESETS && setS(p => ({ ...p, ...PRESETS[k as keyof typeof PRESETS], preset: k }))}
            />
          </Grp>
        </div>

        <div className="stack">
          <More title="Times" sub={`${s.bulkH + s.coldH + s.proofH} h fermentation`}>
            <div className="row">
              <F label="Autolysis (min)">{num('autolysisMin', tune, 5)}</F>
              <F label="Bulk at room (h)">{num('bulkH', tune, 0.5)}</F>
              <F label="Fridge (h)">{num('coldH', tune, 1)}</F>
              <F label="Balls at room (h)">{num('proofH', tune, 0.5)}</F>
            </div>
          </More>
          <More title="Salt, oil, sugar" sub={`Salt ${s.saltPct}%${s.oilPct ? `, oil ${s.oilPct}%` : ''}${s.sugarPct ? `, sugar ${s.sugarPct}%` : ''}`}>
            <div className="row">
              <F label="Salt (%)">{num('saltPct', set, 0.1)}</F>
              <F label="Olive oil (%)">{num('oilPct', set, 0.5)}</F>
              <F label="Sugar (%)">{num('sugarPct', set, 0.5)}</F>
            </div>
          </More>
          <More title="Kitchen" sub={`${s.roomC} °C room, ${s.fridgeC} °C fridge`}>
            <div className="row">
              <F label="Room (°C)">{num('roomC')}</F>
              <F label="Fridge (°C)">{num('fridgeC')}</F>
              <F label="Flour (°C)">{num('flourC')}</F>
              <F label="Target dough (°C)">{num('ddtC')}</F>
            </div>
            <Grp label="Mixing">
              <Seg<Mixing> value={s.mixing} onPick={v => set('mixing', v)} options={[['hand', 'By hand'], ['stand', 'Stand mixer'], ['spiral', 'Spiral']]} />
            </Grp>
          </More>
          <More title="Oven" sub={`${s.ovenC} °C, ${s.surface}`}>
            <F label="Temperature (°C)">{num('ovenC', set, 5)}</F>
            <Grp label="Baking surface">
              <Seg<Surface> value={s.surface} onPick={v => set('surface', v)} options={[['tray', 'Tray'], ['stone', 'Stone'], ['steel', 'Steel']]} />
            </Grp>
          </More>
        </div>
      </aside>

      <main className="main">
        <h2 className="lede">Start {when(first.start)}, first pizza in at {when(bakeAt)}</h2>
        {first.start < Date.now() && <p className="note">The first stage is already in the past. Move the bake time later or pick a shorter schedule.</p>}

        <h3 className="sec">{s.pizzas} × {s.ballG} g</h3>
        <table className="tbl">
          <tbody>
            {rows.map(([name, g, pc, d]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="pc">{pc.toFixed(pc < 10 ? 2 : 1)}%</td>
                <td className="big">{g.toFixed(d)} <small>g</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        <More title="Other yeast types">
          <p className="hint">
            {r.yeastAll.fresh.toFixed(2)} g fresh, {r.yeastAll.instant.toFixed(2)} g instant, {r.yeastAll.active.toFixed(2)} g active dry.
            {r.dilute && ` Under 1 g is hard to weigh: stir 1 g of yeast into 99 g of water, use ${r.dilute.solution.toFixed(0)} g of that mix and take ${r.dilute.waterIn.toFixed(0)} g off the water.`}
          </p>
        </More>
        {r.warnings.map(w => <p className="note" key={w}>{w}</p>)}

        <h3 className="sec">Schedule</h3>
        <table className="tbl">
          <tbody>
            {r.stages.map(x => (
              <tr key={x.label}>
                <td className="when">{when(x.start)}</td>
                <td>
                  <span className="dot" style={{ background: `var(--${x.kind})` }} />{x.label}
                  <div className="hint">{x.note}</div>
                </td>
                <td className="len">{dur(x.min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  )
}
