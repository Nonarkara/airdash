// Tiny zero-dep canvas chart for station time-series. Two flavours:
//   drawSeriesChart(canvas, points, opts) — full chart with axes, grid, now-indicator
//   drawMiniSpark(canvas, points, opts)    — height-32 single-line ribbon for ranking rows
//
// opts:
//   color          primary line color (default th-navy)
//   dangerColor    band color for critical values
//   watchColor     band color for elevated values
//   padding        inner padding in px (default 18)
//   showAxes       default true
//   showNow        default true — vertical line + dot at last point
//   thresholds     optional { warn, danger } y-axis values
//   label          metric label (e.g. "มม./ชม.")
//   unit           unit suffix shown in axis labels
//   hiDPI          handles devicePixelRatio automatically (default true)
//
// `points` shape: [{ obs_time: '2026-07-05T10:00', value: 12.4 }, …]
// missing values (null/undefined) break the line — we draw a NaN gap.
import { fmtNum } from './fmt.js?v=2.4.20'

const NAVY = '#0E4A5E'   // AirDash deep-teal ink (was FloodDash #241E4E)
const INK = NAVY
const INK_MID = '#4A6273'
const INK_LOW = '#7E8E9A'
const RULE = 'rgba(14,74,94,0.10)'
const AXIS = '#948C7F'

export function drawSeriesChart(canvas, points, opts = {}) {
  if (!canvas || !points?.length) return false
  const filtered = points.filter((p) => Number.isFinite(p.value))
  if (filtered.length < 1) return false
  const {
    color = NAVY,
    dangerColor = '#C8453A',
    watchColor = '#D8893A',
    padding = 18,
    showAxes = true,
    showNow = true,
    thresholds = null,
    label = '',
    unit = '',
    hiDPI = true,
  } = opts
  const w = canvas.clientWidth || 290
  const h = canvas.clientHeight || 90
  if (hiDPI) {
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
  }
  const ctx = canvas.getContext('2d')
  const dpr = hiDPI ? (window.devicePixelRatio || 1) : 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const vs = filtered.map((p) => p.value)
  let min = Math.min(...vs)
  let max = Math.max(...vs)
  if (thresholds?.danger != null) max = Math.max(max, thresholds.danger)
  if (thresholds?.warn != null) max = Math.max(max, thresholds.warn)
  // Pad min/max by 8% so the line doesn't touch the edges.
  const padV = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1
  min -= padV
  max += padV

  // ── Optional threshold bands (drawn behind the line) ──────────────────
  if (thresholds?.danger != null) {
    const y = yPx(thresholds.danger, min, max, h, padding)
    ctx.fillStyle = 'rgba(165,25,49,0.06)'
    ctx.fillRect(padding, padding, w - padding * 2, y - padding)
    ctx.strokeStyle = 'rgba(165,25,49,0.55)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke()
    ctx.setLineDash([])
  }
  if (thresholds?.warn != null) {
    const y = yPx(thresholds.warn, min, max, h, padding)
    ctx.fillStyle = 'rgba(232,106,16,0.06)'
    ctx.fillRect(padding, padding, w - padding * 2, y - padding)
    ctx.strokeStyle = 'rgba(232,106,16,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Axes & grid ───────────────────────────────────────────────────────
  if (showAxes) {
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    // Horizontal grid lines: 4 ticks
    for (let i = 0; i <= 4; i++) {
      const y = padding + ((h - padding * 2) * i) / 4
      ctx.beginPath()
      ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke()
    }
    // Y-axis labels: max, min
    ctx.fillStyle = INK_MID
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(fmtNum(max) + (unit ? ' ' + unit : ''), padding + 2, padding)
    ctx.textBaseline = 'bottom'
    ctx.fillText(fmtNum(min) + (unit ? ' ' + unit : ''), padding + 2, h - padding)

    // X-axis: start, mid, end times
    const t0 = filtered[0].obs_time
    const t1 = filtered.at(-1).obs_time
    ctx.textBaseline = 'top'
    ctx.fillStyle = INK_LOW
    ctx.textAlign = 'left'
    ctx.fillText(t0.slice(5, 16).replace('T', ' '), padding, h - padding + 3)
    ctx.textAlign = 'right'
    ctx.fillText(t1.slice(5, 16).replace('T', ' '), w - padding, h - padding + 3)
  }

  // ── The line ──────────────────────────────────────────────────────────
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  let drawing = false
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!Number.isFinite(p.value)) { drawing = false; continue }
    const x = padding + ((w - padding * 2) * i) / Math.max(1, points.length - 1)
    const y = yPx(p.value, min, max, h, padding)
    if (!drawing) { ctx.moveTo(x, y); drawing = true }
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // ── Now indicator ─────────────────────────────────────────────────────
  if (showNow) {
    const last = filtered.at(-1)
    const lastIdx = points.lastIndexOf(last)
    const x = padding + ((w - padding * 2) * lastIdx) / Math.max(1, points.length - 1)
    const y = yPx(last.value, min, max, h, padding)
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // Subtle vertical guide
    ctx.strokeStyle = 'rgba(36,30,78,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, padding); ctx.lineTo(x, h - padding); ctx.stroke()
  }

  return true
}

function yPx(v, min, max, h, padding) {
  const t = (v - min) / (max - min)
  return h - padding - t * (h - padding * 2)
}

// ── Sparkline: tiny single-line ribbon, no axes ────────────────────────
export function drawMiniSpark(canvas, points, opts = {}) {
  if (!canvas || !points?.length) return false
  const filtered = points.filter((p) => Number.isFinite(p.value))
  if (filtered.length < 1) return false
  const { color = NAVY, fillAlpha = 0.12, height = 22 } = opts
  const w = canvas.clientWidth || 120
  if (canvas.clientHeight !== height) canvas.style.height = height + 'px'
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, height)

  const vs = filtered.map((p) => p.value)
  let min = Math.min(...vs)
  let max = Math.max(...vs)
  const padV = (max - min) * 0.05 || Math.abs(max) * 0.03 || 1
  min -= padV; max += padV

  const stepX = (w - 2) / Math.max(1, filtered.length - 1)
  const yOf = (v) => height - 2 - ((v - min) / (max - min)) * (height - 4)

  // Area fill
  ctx.beginPath()
  ctx.moveTo(0, height)
  filtered.forEach((p, i) => ctx.lineTo(i * stepX, yOf(p.value)))
  ctx.lineTo(w, height)
  ctx.closePath()
  ctx.fillStyle = hexA(color, fillAlpha)
  ctx.fill()

  // Line
  ctx.beginPath()
  filtered.forEach((p, i) => {
    if (i === 0) ctx.moveTo(0, yOf(p.value))
    else ctx.lineTo(i * stepX, yOf(p.value))
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.stroke()

  // End dot
  const last = filtered.at(-1)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc((filtered.length - 1) * stepX, yOf(last.value), 2.2, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  return true
}

function hexA(hex, a) {
  // accept #rrggbb
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(36,30,78,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${a})`
}

// ── Bar chart — for analytics panel time-series (e.g. daily rain max) ──
// opts:
//   color       bar fill (default th-navy)
//   showGrid    horizontal grid (default true)
//   hiDPI       default true
//   valueLabel  if true, draw value on top of each bar
//   yMax        override y-axis max (else auto from data)
// `data` shape: [{ label, value }]
export function drawBarChart(canvas, data, opts = {}) {
  if (!canvas || !data?.length) return false
  const {
    color = NAVY,
    altColor = '#D8893A',
    showGrid = true,
    hiDPI = true,
    valueLabel = true,
    yMax = null,
  } = opts
  const w = canvas.clientWidth || 290
  const h = canvas.clientHeight || 90
  if (hiDPI) {
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
  }
  const ctx = canvas.getContext('2d')
  const dpr = hiDPI ? (window.devicePixelRatio || 1) : 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const padTop = 18, padBot = 22, padL = 26, padR = 10
  const chartW = w - padL - padR
  const chartH = h - padTop - padBot

  const vs = data.map((d) => d.value ?? 0)
  const yMaxCalc = yMax ?? Math.max(...vs, 1) * 1.1
  const yMin = 0
  const yOf = (v) => padTop + chartH - ((v - yMin) / (yMaxCalc - yMin)) * chartH

  // Grid (4 ticks)
  if (showGrid) {
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    ctx.fillStyle = INK_MID
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (chartH * i) / 4
      ctx.beginPath()
      ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke()
      const v = yMaxCalc - (yMaxCalc * i) / 4
      ctx.fillText(v >= 10 ? Math.round(v).toString() : v.toFixed(1),
        padL - 4, y)
    }
  }

  // Bars
  const slot = chartW / data.length
  const barW = Math.min(slot * 0.7, 22)
  ctx.fillStyle = color
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const v = d.value ?? 0
    const x = padL + slot * i + (slot - barW) / 2
    const y = yOf(v)
    const barH = padTop + chartH - y
    // Use altColor for the last bar (today) — visual "live" hint
    ctx.fillStyle = i === data.length - 1 ? altColor : color
    ctx.fillRect(x, y, barW, barH)

    // Value label on top
    if (valueLabel && v > 0) {
      ctx.fillStyle = INK_MID
      ctx.font = '8.5px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const labelText = v >= 100 ? Math.round(v).toString() : v.toFixed(0)
      ctx.fillText(labelText, x + barW / 2, y - 1)
    }
  }

  // X-axis labels
  ctx.fillStyle = INK_LOW
  ctx.font = '8.5px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'top'
  for (let i = 0; i < data.length; i++) {
    const x = padL + slot * i + slot / 2
    ctx.textAlign = 'center'
    ctx.fillText(data[i].label ?? '', x, padTop + chartH + 4)
  }

  return true
}

// ── Donut chart — regional distribution of risk / count / etc. ──
// `slices`: [{ label, value, color }] — color defaults to the band palette.
// opts: showCenter (default true) shows total in middle.
const SLICE_COLORS = ['#0E4A5E', '#C8453A', '#D8893A', '#3A8A6E', '#6B2D5C', '#2D7A8C', '#C8B560', '#7B96A0']
export function drawDonut(canvas, slices, opts = {}) {
  if (!canvas || !slices?.length) return false
  const { showCenter = true, hiDPI = true } = opts
  const w = canvas.clientWidth || 140
  const h = canvas.clientHeight || 140
  if (hiDPI) {
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
  }
  const ctx = canvas.getContext('2d')
  const dpr = hiDPI ? (window.devicePixelRatio || 1) : 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2
  const outer = Math.min(w, h) / 2 - 6
  const inner = outer * 0.62
  const total = slices.reduce((s, x) => s + (x.value > 0 ? x.value : 0), 0) || 1
  let start = -Math.PI / 2
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i]
    if (s.value <= 0) continue
    const ang = (s.value / total) * Math.PI * 2
    const fill = s.color || SLICE_COLORS[i % SLICE_COLORS.length]
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outer, start, start + ang)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    // white separator
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // cut out inner ring (donut)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, inner, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    start += ang
  }

  if (showCenter) {
    ctx.fillStyle = INK
    ctx.font = '700 16px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(total.toLocaleString('en-US'), cx, cy - 4)
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = INK_LOW
    ctx.fillText('total', cx, cy + 11)
  }
  return true
}