import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource/young-serif'
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { FLOURS } from './core/flours'
import { PRESETS, compute, estimateW, suggestHydration, type Inputs, type Mixing, type Surface, type YeastType } from './core/dough'

type S = Inputs & { flourId: string; preset: string }
type NumKey = { [K in keyof S]: S[K] extends number ? K : never }[keyof S]

const dur = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`)

const init: S = {
  pizzas: 4, ballG: 250, hydration: suggestHydration(260, 'tray', 275), saltPct: 2.8, oilPct: 0, sugarPct: 0,
  protein: 12.5, w: 260, flourId: 'caputo-pizzeria', yeast: 'fresh',
  roomC: 21, fridgeC: 4, flourC: 21, ddtC: 24, mixing: 'hand',
  ...PRESETS.Overnight, preset: 'Overnight',
  ovenC: 275, surface: 'tray',
}

const KEY = 'pizza-calc:v2'

const SIDE_KEY = 'pizza-calc:side:v2'
const SIDE_MIN = 300
const sideMax = () => Math.max(SIDE_MIN, Math.round(window.innerWidth * 0.7))
// About a third of the window, so roughly 490 px on a 1450 px wide window.
const defaultSide = () => Math.min(640, Math.max(380, Math.round(window.innerWidth * 0.34)))

function loadSide() {
  try {
    const n = Number(localStorage.getItem(SIDE_KEY))
    if (n >= SIDE_MIN) return n
  } catch {
    // storage blocked: use the default width
  }
  return defaultSide()
}

function load(): S {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...init, ...JSON.parse(raw) }
  } catch {
    // storage blocked or the saved data is corrupt: start from the defaults
  }
  return init
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
  const [s, setS] = useState<S>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // storage blocked: settings just won't persist
    }
  }, [s])
  const [side, setSide] = useState(loadSide)
  // Only a width the user chose is saved, so the default keeps following the window size.
  const pick = (n: number) => {
    setSide(n)
    try {
      localStorage.setItem(SIDE_KEY, String(n))
    } catch {
      // storage blocked: the width just won't persist
    }
  }
  const resetSide = () => {
    setSide(defaultSide())
    try {
      localStorage.removeItem(SIDE_KEY)
    } catch {
      // storage blocked: nothing to clear
    }
  }
  const drag = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => pick(Math.min(sideMax(), Math.max(SIDE_MIN, Math.round(ev.clientX - 4))))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  const set = <K extends keyof S>(k: K, v: S[K]) => setS(p => ({ ...p, [k]: v }))
  const tune = <K extends keyof S>(k: K, v: S[K]) => setS(p => ({ ...p, [k]: v, preset: 'Custom' }))
  const r = useMemo(() => compute(s), [s])
  const flour = FLOURS.find(f => f.id === s.flourId)
  const effW = s.w > 0 ? s.w : estimateW(s.protein)
  const sug = suggestHydration(effW, s.surface, s.ovenC)
  const first = r.stages[0]

  const num = (k: NumKey, put: typeof set = set, step = 1) => (
    <input type="number" inputMode="decimal" step={step} value={s[k]} onChange={e => put(k, parseFloat(e.target.value) || 0)} />
  )
  const yName = { fresh: 'fresh', instant: 'instant dry', active: 'active dry' }[s.yeast]
  type Row = { key: string; name: string; g: number; pc: number; d: number }
  const rows: Row[] = [
    { key: 'flour', name: 'Flour', g: r.flour, pc: 100, d: 0 },
    { key: 'water', name: 'Water', g: r.water, pc: s.hydration, d: 0 },
    { key: 'salt', name: 'Salt', g: r.salt, pc: s.saltPct, d: 1 },
    ...(s.oilPct > 0 ? [{ key: 'oil', name: 'Olive oil', g: r.oil, pc: s.oilPct, d: 1 }] : []),
    ...(s.sugarPct > 0 ? [{ key: 'sugar', name: 'Sugar', g: r.sugar, pc: s.sugarPct, d: 1 }] : []),
    { key: 'yeast', name: `Yeast (${yName})`, g: r.yeastG, pc: (r.yeastG / r.flour) * 100, d: 2 },
  ]

  return (
    <div className="app" style={{ '--side': `${side}px` } as CSSProperties}>
      <aside className="side">
        <h1>Pizza panel</h1>
        <div className="side-body">
          <div className="g">
            <div className="row">
              <F label="Pizzas">{num('pizzas')}</F>
              <F label="Ball weight (g)">{num('ballG')}</F>
            </div>
          </div>

          <div className="g">
            <F label="Flour">
              <select
                value={s.flourId}
                onChange={e => {
                  const f = FLOURS.find(x => x.id === e.target.value)
                  setS(p => ({ ...p, flourId: e.target.value, protein: f ? f.protein : p.protein, w: f ? f.w ?? 0 : p.w }))
                }}
              >
                {FLOURS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="custom">Other flour</option>
              </select>
            </F>
            <div className="row">
              <F label="W (if printed)">
                <input type="number" step={5} value={s.w || ''} placeholder={`~${Math.round(estimateW(s.protein))}`} onChange={e => setS(p => ({ ...p, flourId: 'custom', w: parseFloat(e.target.value) || 0 }))} />
              </F>
              <F label="Protein (%)">
                <input type="number" step={0.1} value={s.protein} onChange={e => setS(p => ({ ...p, flourId: 'custom', protein: parseFloat(e.target.value) || 0 }))} />
              </F>
            </div>
            <p className="hint">{flour ? `${flour.where}. ` : ''}{s.w > 0 ? `Using W ${s.w}.` : `No W entered, so W is estimated as ${Math.round(effW)} from protein.`}</p>
            <F label="Hydration (%)">{num('hydration', set, 0.5)}</F>
            {sug !== s.hydration && (
              <p className="hint">Suggested for this flour and oven: {sug}%. <button type="button" className="link" onClick={() => set('hydration', sug)}>Use it</button></p>
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
            <p className="hint">Comfortable for this flour: {r.range.min} to {Math.round(r.range.max)} h in total, currently {s.bulkH + s.coldH + s.proofH} h.</p>
          </div>

          <div className="stack">
            <More title="Times" sub={`${s.autolysisMin} min autolysis, ${s.bulkH + s.coldH + s.proofH} h fermentation`}>
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
                <Seg<Surface> value={s.surface} onPick={v => set('surface', v)} options={[['tray', 'Tray or rack'], ['stone', 'Stone'], ['steel', 'Steel']]} />
              </Grp>
            </More>
          </div>
        </div>
        <button type="button" className="link" onClick={() => setS(init)}>Reset to defaults</button>
      </aside>
      <div
        className="grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the inputs column"
        aria-valuenow={side}
        aria-valuemin={SIDE_MIN}
        tabIndex={0}
        onPointerDown={drag}
        onDoubleClick={resetSide}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') pick(Math.max(SIDE_MIN, side - 20))
          if (e.key === 'ArrowRight') pick(Math.min(sideMax(), side + 20))
        }}
      />

      <main className="main">
        <section>
          <div className="hd">
            <h2>Timeline</h2>
            <span>{dur(-first.start / 60000)} from the first step to the first pizza</span>
          </div>
          <div className="band" role="img" aria-label="Timeline of all stages, coloured by temperature">
            {r.stages.filter(x => !x.overlap).map(x => (
              <span key={x.label} title={`${x.label}: ${dur(x.min)}`} style={{ flexGrow: Math.sqrt(x.min), background: `var(--${x.kind})` }} />
            ))}
          </div>
          <div className="key">
            <span><i className="sw" style={{ background: 'var(--room)' }} />Room temperature</span>
            <span><i className="sw" style={{ background: 'var(--cold)' }} />Fridge</span>
            <span><i className="sw" style={{ background: 'var(--oven)' }} />Oven</span>
            <span><i className="sw" style={{ background: 'var(--prep)' }} />Hands on</span>
          </div>
        </section>

        <section className="menu">
          <div className="hd">
            <h2>Recipe</h2>
            <span>{s.pizzas} × {s.ballG} g</span>
          </div>
          <div className="cols">
            <div>
              {rows.map(x => (
                <div className="line big" key={x.key}>
                  <b><i className="sw" style={{ background: `var(--p-${x.key})` }} />{x.name}</b>
                  <span className="dots" />
                  <small>{x.pc.toFixed(x.pc < 10 ? 2 : 1)}%</small>
                  <strong>{x.g.toFixed(x.d)} <em>g</em></strong>
                </div>
              ))}
            </div>
            <div className="aside">
              <div className="line"><span>Water temperature</span><span className="dots" /><b>{r.waterTemp.toFixed(0)} °C</b></div>
              <p className="hint">The same dough with another yeast</p>
              <div className="line"><span>Fresh</span><span className="dots" /><b>{r.yeastAll.fresh.toFixed(2)} g</b></div>
              <div className="line"><span>Instant dry</span><span className="dots" /><b>{r.yeastAll.instant.toFixed(2)} g</b></div>
              <div className="line"><span>Active dry</span><span className="dots" /><b>{r.yeastAll.active.toFixed(2)} g</b></div>
            </div>
          </div>
          {r.dilute && (
            <p className="hint">Under 1 g of yeast is hard to weigh: stir 1 g of yeast into 99 g of water, use {r.dilute.solution.toFixed(0)} g of that mix and take {r.dilute.waterIn.toFixed(0)} g off the water above.</p>
          )}
          {r.warnings.map(w => <p className="note" key={w}>{w}</p>)}
        </section>

        <section className="ticket">
          <div className="hd"><h2>Schedule</h2></div>
          {r.stages.map(x => (
            <div className="item" key={x.label}>
              <div className="line">
                <b><i className="sw" style={{ background: `var(--${x.kind})` }} />{x.label}</b>
                <span className="dots" />
                <span>{dur(x.min)}</span>
              </div>
              <p>{x.note}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
