import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource/young-serif'
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { FLOURS } from './core/flours'
import { LIMITS, STYLES, compute, enrichment, estimateW, fit, sanitize, suggestHydration, type Inputs, type LimitKey, type Style, type Surface, type YeastType } from './core/dough'

// w is 0 when the pack's W has not been entered; the app then estimates it from protein.
// diamCm is 0 when the user has not entered a diameter; ballG is then used directly.
type ThickOption = 'light' | 'classic' | 'thick'
const THICK_LABELS: [ThickOption, string][] = [['light', 'Thin'], ['classic', 'Classic'], ['thick', 'Thick']]
// Thickness factor: grams of dough per cm² of pizza area (based on Lehmann/community conventions).
const THICK_TF: Record<ThickOption, number> = { light: 0.35, classic: 0.47, thick: 0.65 }
const ballGFromDiam = (diam: number, thick: ThickOption) =>
  Math.round(THICK_TF[thick] * Math.PI * (diam / 2) ** 2)
const diamFromBallG = (g: number, thick: ThickOption) =>
  Math.round(2 * Math.sqrt(g / (THICK_TF[thick] * Math.PI)))

type S = Omit<Inputs, 'w' | 'wEst' | 'oilPct' | 'sugarPct' | 'flourC' | 'ddtC' | 'mixing'> & { flourId: string; protein: number; w: number; browning: boolean; oilPct: number | null; sugarPct: number | null; diamCm: number; thick: ThickOption }

type NumKey = Exclude<LimitKey, 'oilPct' | 'sugarPct'>

const durParts = (m: number): [string, string] => (m >= 90 ? [(m / 60).toFixed(1), 'h'] : [String(Math.round(m)), 'min'])
const dur = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`)
const fmtClock = (absMs: number, originMs: number): string => {
  const d = new Date(absMs)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const dayOrig = new Date(originMs); dayOrig.setHours(0, 0, 0, 0)
  const dayAbs = new Date(absMs); dayAbs.setHours(0, 0, 0, 0)
  const days = Math.round((dayAbs.getTime() - dayOrig.getTime()) / 86_400_000)
  return days > 0 ? `+${days}\u2002${hm}` : hm
}

const init: S = {
  pizzas: 4, ballG: 250, hydration: suggestHydration(260, 'tray', 275),
  protein: 12.5, w: 260, flourId: 'caputo-pizzeria', yeast: 'fresh',
  roomC: 21, fridgeC: 4,
  style: 'overnight',
  ovenC: 275, surface: 'tray',
  browning: false, oilPct: null, sugarPct: null,
  diamCm: 0, thick: 'classic',
}

// v7: added diamCm (pizza diameter) and thick (thickness factor) as alternative to ball weight.
const KEY = 'pizza-calc:v7'

const SIDE_KEY = 'pizza-calc:side:v2'
const SIDE_MIN = 300
const sideMax = () => Math.max(SIDE_MIN, Math.round(window.innerWidth * 0.7))
// Roughly 23.6% of the window (e.g. 448px side : 1449px main on a ~1897px wide window).
const defaultSide = () => Math.min(640, Math.max(340, Math.round(window.innerWidth * 0.236)))

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
      const { oilPct, sugarPct, diamCm, thick, ...rest } = m
      // w stays 0 when it was never entered, and null means "use the default amount"; sanitize would
      // turn both into numbers, so they are put back afterwards.
      // diamCm stays 0 when not entered; thick is an enum validated separately.
      const validThick = (v: unknown): ThickOption => (v === 'light' || v === 'classic' || v === 'thick') ? v : 'classic'
      return {
        ...sanitize({ ...rest, w: m.w > 0 ? m.w : LIMITS.w.min }),
        w: m.w > 0 ? fit('w', m.w) : 0,
        browning: m.browning === true,
        oilPct: typeof oilPct === 'number' ? fit('oilPct', oilPct) : null,
        sugarPct: typeof sugarPct === 'number' ? fit('sugarPct', sugarPct) : null,
        diamCm: typeof diamCm === 'number' && diamCm > 0 ? Math.round(Math.max(20, Math.min(50, diamCm))) : 0,
        thick: validThick(thick),
      }
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
const More = ({ title, sub, className, children }: { title: string; sub?: ReactNode; className?: string; children: ReactNode }) => (
  <details className={className ? `more ${className}` : "more"}>
    <summary>{title}<span className="sub">{sub}</span></summary>
    <div className="body">{children}</div>
  </details>
)

export default function App() {
  const [s, setS] = useState<S>(load)

  useEffect(() => {
    const click = (e: MouseEvent) => {
      document.querySelectorAll('details.tip[open]').forEach(el => {
        if (!el.contains(e.target as Node)) {
          el.removeAttribute('open')
        }
      })
    }
    document.addEventListener('click', click)
    return () => document.removeEventListener('click', click)
  }, [])
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
  // When the user entered a diameter, derive ball weight from it; otherwise use ballG directly.
  const effBallG = s.diamCm > 0 ? ballGFromDiam(s.diamCm, s.thick) : s.ballG
  const def = enrichment(s.ovenC)
  const r = useMemo(() => {
    const add = s.browning ? { oilPct: s.oilPct ?? def.oilPct, sugarPct: s.sugarPct ?? def.sugarPct } : { oilPct: 0, sugarPct: 0 }
    return compute({ ...s, ballG: effBallG, flourC: 20, ddtC: 24, mixing: 'hand', ...add, w: effW, wEst: !(s.w > 0) })
  }, [s, effW, effBallG, def.oilPct, def.sugarPct])
  const flour = FLOURS.find(f => f.id === s.flourId)
  const sug = suggestHydration(effW, s.surface, s.ovenC)
  const planned = Math.round(r.plan.total * 10) / 10
  const first = r.stages[0]
  const nowMs = Date.now()
  const stageAnchor = r.stages[0].start

  const bad = (k: NumKey, v: number) => !(v >= LIMITS[k].min && v <= LIMITS[k].max)
  const num = (k: NumKey) => (
    <input
      type="number" inputMode="decimal" min={LIMITS[k].min} max={LIMITS[k].max} step={LIMITS[k].step}
      value={Number.isNaN(s[k]) ? '' : s[k]} aria-invalid={bad(k, s[k])}
      onChange={e => set(k, e.target.value === '' ? NaN : parseFloat(e.target.value))}
      onBlur={() => set(k, fit(k, Number.isNaN(s[k]) ? LIMITS[k].min : s[k]))}
    />
  )
  const ext = (k: 'sugarPct' | 'oilPct') => {
    const v = s[k] ?? def[k]
    return (
      <input
        type="number" inputMode="decimal" min={LIMITS[k].min} max={LIMITS[k].max} step={LIMITS[k].step}
        value={Number.isNaN(v) ? '' : v} aria-invalid={!(v >= LIMITS[k].min && v <= LIMITS[k].max)}
        onChange={e => set(k, e.target.value === '' ? NaN : parseFloat(e.target.value))}
        onBlur={() => set(k, fit(k, Number.isNaN(v) ? LIMITS[k].min : v))}
      />
    )
  }
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
              <F label="Ball weight (g)">
                <input
                  type="number" inputMode="decimal" min={LIMITS.ballG.min} max={LIMITS.ballG.max} step={LIMITS.ballG.step}
                  value={s.diamCm > 0 ? '' : (Number.isNaN(s.ballG) ? '' : s.ballG)}
                  placeholder={s.diamCm > 0 ? String(effBallG) : undefined}
                  aria-invalid={s.diamCm <= 0 && bad('ballG', s.ballG)}
                  onChange={e => setS(p => ({ ...p, diamCm: 0, ballG: e.target.value === '' ? NaN : parseFloat(e.target.value) }))}
                  onBlur={() => { if (s.diamCm <= 0) set('ballG', fit('ballG', Number.isNaN(s.ballG) ? LIMITS.ballG.min : s.ballG)) }}
                />
              </F>
            </div>
            <div className="row">
              <F label="Or diameter (cm)">
                <input
                  type="number" inputMode="decimal" min={20} max={50} step={1}
                  value={s.diamCm > 0 ? s.diamCm : ''}
                  placeholder={s.diamCm <= 0 ? String(diamFromBallG(s.ballG, s.thick)) : undefined}
                  aria-invalid={s.diamCm > 0 && (s.diamCm < 20 || s.diamCm > 50)}
                  onChange={e => setS(p => ({ ...p, diamCm: e.target.value === '' ? 0 : Math.round(parseFloat(e.target.value)) }))}
                  onBlur={() => {
                    if (s.diamCm > 0) set('diamCm', Math.round(Math.max(20, Math.min(50, s.diamCm))))
                    else set('diamCm', 0)
                  }}
                />
              </F>
              <Grp label="Thickness">
                <div className="slider-row">
                  <input
                    type="range" min={0} max={2} step={1}
                    value={s.thick === 'light' ? 0 : s.thick === 'classic' ? 1 : 2}
                    onChange={e => {
                      const v = Number(e.target.value)
                      set('thick', v === 0 ? 'light' : v === 1 ? 'classic' : 'thick')
                    }}
                  />
                  <span className="slider-label">{s.thick === 'light' ? 'Thin' : s.thick === 'classic' ? 'Classic' : 'Thick'}</span>
                </div>
              </Grp>
            </div>
            {s.diamCm > 0 && <p className="hint">{effBallG} g per ball from ⌀{s.diamCm} cm ({s.thick}).</p>}
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
            <Grp label={<>Flour{flour && <Tip>{flour.where}</Tip>}</>}>
              <select
                aria-label="Flour"
                value={s.flourId}
                onChange={e => {
                  const f = FLOURS.find(x => x.id === e.target.value)
                  setS(p => {
                    const newW = f ? (f.w ?? 0) : p.w
                    const newProtein = f ? f.protein : p.protein
                    const newEffW = newW > 0 ? newW : estimateW(newProtein)
                    return {
                      ...p,
                      flourId: e.target.value,
                      protein: newProtein,
                      w: newW,
                      hydration: suggestHydration(newEffW, p.surface, p.ovenC),
                    }
                  })
                }}
              >
                {FLOURS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="custom">Other flour</option>
              </select>
            </Grp>
            <div className="row">
              <Grp label={<>W<Tip>Baking strength. Sets the suggested hydration and fermentation range. If the pack has no W, use protein % instead — W is estimated from it (±40).</Tip></>}>
                <input
                  type="number" min={LIMITS.w.min} max={LIMITS.w.max} step={LIMITS.w.step}
                  value={s.w || ''} placeholder={`~${Math.round(estimateW(s.protein))}`} aria-invalid={s.w !== 0 && bad('w', s.w)}
                  onChange={e => setS(p => ({ ...p, flourId: 'custom', w: e.target.value === '' ? NaN : parseFloat(e.target.value) }))}
                  onBlur={() => s.w !== 0 && set('w', fit('w', Number.isNaN(s.w) ? LIMITS.w.min : s.w))}
                />
              </Grp>
              <F label="Or protein (%)">
                <input
                  type="number" min={LIMITS.protein.min} max={LIMITS.protein.max} step={LIMITS.protein.step}
                  value={Number.isNaN(s.protein) ? '' : s.protein} aria-invalid={bad('protein', s.protein)}
                  onChange={e => setS(p => ({ ...p, flourId: 'custom', protein: e.target.value === '' ? NaN : parseFloat(e.target.value), w: 0 }))}
                  onBlur={() => set('protein', fit('protein', Number.isNaN(s.protein) ? LIMITS.protein.min : s.protein))}
                />
              </F>
            </div>
            {s.w <= 0 && <p className="hint">W ~{Math.round(effW)} estimated from protein (±40).</p>}
            <p className="hint">Fermentation: {planned} h. Recommended: {r.range.min}–{Math.round(r.range.max)} h.</p>
            <Grp label={<>Hydration (%)<Tip>Suggested from the flour's W: stronger flour takes more water. Minus 3 points for a tray or rack, minus 2 for an oven below 250 °C.</Tip></>}>
              {num('hydration')}
            </Grp>
            {sug !== s.hydration && (
              <p className="sug">Suggested: {sug}% <button type="button" onClick={() => set('hydration', sug)}>Use it</button></p>
            )}
            <Grp label="Yeast">
              <Seg<YeastType> value={s.yeast} onPick={v => set('yeast', v)} options={[['fresh', 'Fresh'], ['instant', 'Instant'], ['active', 'Active dry']]} />
            </Grp>
            <More title="Extra browning" sub={
              <button
                type="button" role="switch" aria-checked={s.browning} aria-label="Enable extra browning" className="switch"
                onClick={e => { e.preventDefault(); set('browning', !s.browning) }}
              />
            }>
              <div className="row">
                <F label="Sugar (%)">{ext('sugarPct')}</F>
                <F label="Olive oil (%)">{ext('oilPct')}</F>
              </div>
              {(s.sugarPct !== null || s.oilPct !== null) && (
                <button type="button" className="link" onClick={() => setS(p => ({ ...p, sugarPct: null, oilPct: null }))}>Use defaults</button>
              )}
            </More>
          </div>

          <div className="g">
            <div className="row">
              <F label="Room (°C)">{num('roomC')}</F>
              <F label="Fridge (°C)">{num('fridgeC')}</F>
            </div>
          </div>

          <div className="g">
            <div className="row">
              <F label="Oven (°C)">{num('ovenC')}</F>
              <Grp label="Surface">
                <Seg<Surface> value={s.surface} onPick={v => set('surface', v)} options={[['tray', 'Tray'], ['stone', 'Stone'], ['steel', 'Steel']]} />
              </Grp>
            </div>
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
          if (e.key === 'ArrowLeft') { e.preventDefault(); pick(Math.max(SIDE_MIN, side - 20)) }
          if (e.key === 'ArrowRight') { e.preventDefault(); pick(Math.min(sideMax(), side + 20)) }
        }}
      />

      <main className="main">
        <section>
          <div className="hd">
            <h2>Timeline</h2>
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
          {r.alerts.length > 0 && (
            <div className="g" style={{ marginTop: '20px' }}>
              {r.alerts.map(a => <p className="alert" key={a}>{a}</p>)}
            </div>
          )}
        </section>

        <section>
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
          <div className="hd"><h2>Schedule</h2></div>
          {r.stages.map(x => {
            const [v, u] = durParts(x.min)
            const clockMs = nowMs + (x.start - stageAnchor)
            return (
              <div className="line big" key={x.label}>
                <time className="stime">{fmtClock(clockMs, nowMs)}</time>
                <b><i className="sw" style={{ background: `var(--${x.kind})` }} />{x.label}</b>
                <span className="dots" />
                <small>{x.note}</small>
                <strong>{v} <em>{u}</em></strong>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}
