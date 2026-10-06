// Draws the recipe sheet as a vector PDF. jsPDF is loaded on demand, so it stays out of the main bundle.
export interface PdfData {
  title: string
  params: [string, string][]
  hours: string
  band: { kind: string; min: number }[]
  key: [string, string][]
  recipeSub: string
  recipe: { key: string; name: string; mid: string; v: string; u: string }[]
  hint?: string
  schedule: { kind: string; name: string; mid: string; v: string; u: string }[]
}

const PAGE_W = 210
const PAGE_H = 297
const M = 18

export async function buildPdf(d: PdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: d.title })
  doc.setLineCap('round')
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  const ink = css('--ink'), mute = css('--mute'), dot = css('--dot'), rule = css('--line')
  const L = M, R = PAGE_W - M, W = R - L
  let y = M + 6

  const font = (size: number, color = ink, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('times', style); doc.setFontSize(size); doc.setTextColor(color)
  }
  const dotted = (x1: number, x2: number, yy: number) => {
    if (x2 <= x1) return
    doc.setDrawColor(dot); doc.setLineWidth(0.25); doc.setLineDashPattern([0.05, 0.9], 0)
    doc.line(x1, yy, x2, yy)
    doc.setLineDashPattern([], 0)
  }
  const need = (h: number) => { if (y + h > PAGE_H - M) { doc.addPage(); y = M + 6 } }
  const heading = (title: string, sub: string) => {
    need(20)
    doc.setDrawColor(rule); doc.setLineWidth(0.25); doc.line(L, y, R, y)
    y += 9
    font(15, ink, 'bold'); doc.text(title, L, y)
    font(10, mute); doc.text(sub, L + doc.setFontSize(15).getTextWidth(title) + 3, y)
    y += 6
  }
  const row = (color: string, name: string, mid: string, v: string, u: string, size = 8.5) => {
    need(size + 2)
    const base = y + 5
    doc.setFillColor(color); doc.circle(L + 1.6, base - 1.3, 1.3, 'F')
    font(12.5); doc.text(name, L + 6, base)
    const nameEnd = L + 6 + doc.getTextWidth(name) + 3
    const numX = R - 24
    let midStart = numX - 3
    if (mid) {
      font(9, mute)
      doc.text(mid, numX - 3, base, { align: 'right' })
      midStart = numX - 3 - doc.getTextWidth(mid) - 3
    }
    dotted(nameEnd, midStart, base - 0.8)
    font(17); doc.text(v, numX, base)
    font(9, mute); doc.text(u, numX + doc.setFontSize(17).getTextWidth(v) + 1, base)
    y += size
  }

  font(26, ink, 'bold'); doc.text(d.title, L, y)
  y += 9

  const colW = (W - 10) / 2
  d.params.forEach(([k, v], i) => {
    const x = L + (i % 2) * (colW + 10)
    const base = y + 5
    font(10, mute); doc.text(k, x, base)
    font(10); doc.text(v, x + colW, base, { align: 'right' })
    dotted(x + doc.setFontSize(10).getTextWidth(k) + 3, x + colW - doc.getTextWidth(v) - 3, base - 0.8)
    if (i % 2 === 1 || i === d.params.length - 1) y += 6.4
  })
  y += 5

  heading('Timeline', d.hours)
  const gap = 0.8
  const weights = d.band.map(b => Math.sqrt(b.min))
  const total = weights.reduce((a, b) => a + b, 0)
  const avail = W - gap * (d.band.length - 1)
  let x = L
  d.band.forEach((b, i) => {
    const w = (avail * weights[i]) / total
    doc.setFillColor(css(`--${b.kind}`)); doc.roundedRect(x, y, w, 8, 0.6, 0.6, 'F')
    x += w + gap
  })
  y += 14
  x = L
  font(9, mute)
  d.key.forEach(([kind, label]) => {
    doc.setFillColor(css(`--${kind}`)); doc.circle(x + 1.2, y - 1, 1.2, 'F')
    doc.text(label, x + 4, y)
    x += 4 + doc.getTextWidth(label) + 7
  })
  y += 8

  heading('Recipe', d.recipeSub)
  d.recipe.forEach(r => row(css(`--p-${r.key}`), r.name, r.mid, r.v, r.u))
  if (d.hint) {
    font(10, mute)
    const lines = doc.splitTextToSize(d.hint, W) as string[]
    need(lines.length * 5 + 4)
    y += 3
    doc.text(lines, L, y + 3)
    y += lines.length * 5
  }
  y += 6

  heading('Schedule', '')
  d.schedule.forEach(s => row(css(`--${s.kind}`), s.name, s.mid, s.v, s.u))

  return doc.output('blob')
}
