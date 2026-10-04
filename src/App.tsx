import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource/young-serif'
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { FLOURS } from './core/flours'
import { LIMITS, STYLES, compute, estimateW, fit, sanitize, suggestHydration, type Inputs, type LimitKey, type Mixing, type Style, type Surface, type YeastType } from './core/dough'

// w is 0 when the pack's W has not been entered; the app then estimates it from protein.
type S = Omit<Inputs, 'w' | 'wEst'> & { flourId: string; protein: number; w: number }

const dur = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`)

const init: S = {
  pizzas: 4, ballG: 250, hydration: suggestHydration(260, 'tray', 275),
  protein: 12.5, w: 260, flourId: 'caputo-pizzeria', yeast: 'fresh',
  roomC: 21, fridgeC: 4, flourC: 21, ddtC: 24, mixing: 'hand',
  style: 'overnight',
  ovenC: 275, surface: 'tray',
}

const KEY = 'pizza-calc:v5'

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
    if (raw) {
      const m: S = { ...init, ...JSON.parse(raw) }
      // w stays 0 when it was never entered; sanitize would otherwise raise it to the minimum.
      return { ...sanitize({ ...m, w: m.w > 0 ? m.w : LIMITS.w.min }), w: m.w > 0 ? fit('w', m.w) : 0 }
    }
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
const Grp = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="f"><span>{label}</span>{children}</div>
)
const Tip = ({ children }: { children: ReactNode }) => (
  <details className="tip">
    <summary aria-label="More information">?</summary>
    <div className="pop">{children}</div>
  </details>
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

  const effW = s.w > 0 ? s.w : estimateW(s.protein)
  const r = useMemo(() => compute({ ...s, w: effW, wEst: !(s.w > 0) }), [s, effW])
  const flour = FLOURS.find(f => f.id === s.flourId)
  const sug = suggestHydration(effW, s.surface, s.ovenC)
  const planned = Math.round(r.plan.total * 10) / 10
  const first = r.stages[0]

  const bad = (k: LimitKey, v: number) => !(v >= LIMITS[k].min && v <= LIMITS[k].max)
  const num = (k: LimitKey) => (
    <input
      type="number" inputMode="decimal" min={LIMITS[k].min} max={LIMITS[k].max} step={LIMITS[k].step}
      value={s[k]} aria-invalid={bad(k, s[k])}
      onChange={e => set(k, parseFloat(e.target.value) || 0)}
      onBlur={() => set(k, fit(k, s[k]))}
    />
  )
  const yName = { fresh: 'fresh', instant: 'instant dry', active: 'active dry' }[s.yeast]
  type Row = { key: string; name: string; g: number; pc: number; d: number }
  const rows: Row[] = [
    { key: 'flour', name: 'Flour', g: r.flour, pc: 100, d: 0 },
    { key: 'water', name: 'Water', g: r.water, pc: r.used.hydration, d: 0 },
    { key: 'salt', name: 'Salt', g: r.salt, pc: r.pct.salt, d: 1 },
    ...(r.pct.oil > 0 ? [{ key: 'oil', name: 'Olive oil', g: r.oilG, pc: r.pct.oil, d: 1 }] : []),
    ...(r.pct.sugar > 0 ? [{ key: 'sugar', name: 'Sugar', g: r.sugarG, pc: r.pct.sugar, d: 1 }] : []),
    { key: 'yeast', name: `Yeast (${yName})`, g: r.yeastG, pc: r.pct.yeast, d: 2 },
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
            <Grp label="Schedule">
              <Seg<Style>
                value={s.style}
                options={(Object.keys(STYLES) as Style[]).map(k => [k, STYLES[k]] as [Style, string])}
                onPick={v => set('style', v)}
              />
            </Grp>
          </div>

          <div className="g">
            <Grp label={<>Flour<Tip>{flour ? `${flour.where}. ` : ''}W is the flour's baking strength. It sets the hydration and the fermentation advice. If the pack has no W, enter the protein instead: W is then estimated from it, typically within ±40.</Tip></>}>
              <select
                aria-label="Flour"
                value={s.flourId}
                onChange={e => {
                  const f = FLOURS.find(x => x.id === e.target.value)
                  setS(p => ({ ...p, flourId: e.target.value, protein: f ? f.protein : p.protein, w: f ? f.w ?? 0 : p.w }))
                }}
              >
                {FLOURS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="custom">Other flour</option>
              </select>
            </Grp>
            <div className="row">
              <F label="W">
                <input
                  type="number" min={LIMITS.w.min} max={LIMITS.w.max} step={LIMITS.w.step}
                  value={s.w || ''} placeholder={`~${Math.round(estimateW(s.protein))}`} aria-invalid={s.w !== 0 && bad('w', s.w)}
                  onChange={e => setS(p => ({ ...p, flourId: 'custom', w: parseFloat(e.target.value) || 0 }))}
                  onBlur={() => s.w !== 0 && set('w', fit('w', s.w))}
                />
              </F>
              <F label="Or protein (%)">
                <input
                  type="number" min={LIMITS.protein.min} max={LIMITS.protein.max} step={LIMITS.protein.step}
                  value={s.protein} aria-invalid={bad('protein', s.protein)}
                  onChange={e => setS(p => ({ ...p, flourId: 'custom', protein: parseFloat(e.target.value) || 0, w: 0 }))}
                  onBlur={() => set('protein', fit('protein', s.protein))}
                />
              </F>
            </div>
            {s.w <= 0 && <p className="hint">W ~{Math.round(effW)} estimated from protein (±40).</p>}
            <p className="hint">Recommended: {r.range.min}–{Math.round(r.range.max)} h, planned: {planned} h</p>
            <F label="Hydration (%)">{num('hydration')}</F>
            {sug !== s.hydration && (
              <p className="hint">Suggested: {sug}%. <button type="button" className="link" onClick={() => set('hydration', sug)}>Use it</button></p>
            )}
            <Grp label="Yeast">
              <Seg<YeastType> value={s.yeast} onPick={v => set('yeast', v)} options={[['fresh', 'Fresh'], ['instant', 'Instant'], ['active', 'Active dry']]} />
            </Grp>
          </div>

          <div className="g">
            <div className="row">
              <F label="Room (°C)">{num('roomC')}</F>
              <F label="Fridge (°C)">{num('fridgeC')}</F>
            </div>
          </div>

          <div className="g">
            <F label="Oven (°C)">{num('ovenC')}</F>
            <p className="hint">Adds sugar and olive oil for browning below 400 °C.</p>
            <Grp label="Baking surface">
              <Seg<Surface> value={s.surface} onPick={v => set('surface', v)} options={[['tray', 'Tray or rack'], ['stone', 'Stone'], ['steel', 'Steel']]} />
            </Grp>
          </div>

          <div className="stack">
            <More title="Water temperature" sub={`${r.waterTemp.toFixed(0)} °C`}>
              <div className="row">
                <F label="Flour (°C)">{num('flourC')}</F>
                <F label="Target dough (°C)">{num('ddtC')}</F>
              </div>
              <Grp label="Mixing">
                <Seg<Mixing> value={s.mixing} onPick={v => set('mixing', v)} options={[['hand', 'By hand'], ['stand', 'Stand mixer'], ['spiral', 'Spiral']]} />
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
        {r.alerts.map(a => <p className="alert" key={a}>{a}</p>)}

        <section className="card">
          <div className="hd">
            <h2>Recipe</h2>
            <span>{r.used.pizzas} × {r.used.ballG} g</span>
          </div>
          {rows.map(x => (
            <div className="line big" key={x.key}>
              <b><i className="sw" style={{ background: `var(--p-${x.key})` }} />{x.name}</b>
              <span className="dots" />
              <small>{x.pc.toFixed(x.pc < 10 ? 2 : 1)}%</small>
              <strong>{x.g.toFixed(x.d)} <em>g</em></strong>
            </div>
          ))}
          {r.dilute && (
            <p className="hint">Under 1 g of yeast is hard to weigh: stir 1 g of yeast into 99 g of water, use {r.dilute.solution.toFixed(0)} g of that mix and take {r.dilute.waterIn.toFixed(0)} g off the water above.</p>
          )}
        </section>

        <section>
          <div className="hd">
            <h2>Schedule</h2>
            <span>{dur(-first.start / 60000)} to first pizza</span>
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
