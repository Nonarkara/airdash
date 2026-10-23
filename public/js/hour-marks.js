// The +1/+3/+6 hour marks on the regional wind map.
//
// A six-hour air-movement path is drawn on a map that can be a 3000 km
// regional view or a 5 km street view. The marks have to survive both, and
// two rules keep them honest:
//
//   1. NEVER DROP A MARK. Marks that are closer together on screen than the
//      separation are CLUSTERED into one chip that names every hour it
//      covers ("+1h·+3h·+6h"). The old code skipped the overlapping marks
//      and kept the last one, which left a lone "+6h" on the map and told
//      the reader — silently — that the +1h and +3h steps did not exist.
//
//   2. THE FOCUS MUST SEPARATE THEM. "Zoom to +hour path" used to cap the
//      zoom at 8, where an 18 km path is about 30 px across: the three
//      marks could never separate, so the button could not deliver what it
//      promised. The zoom is now computed from the geometry — the level at
//      which the closest pair of marks clears the separation — and the map's
//      own maximum, whichever is closer.
//
// The geometry lives here, away from Leaflet, so it can be tested without a
// browser and so the map and the tests cannot drift apart.
export const HOUR_STEPS = [1, 3, 6]
export const MARK_SEPARATION_PX = 42

// A chip is 30 px wide for one hour and grows with the hours it names.
// The width estimate has one job: the chip's background box has to be wide
// enough for its own text, or the text spills onto the map.
const CHAR_PX = 7
const CHIP_MIN_PX = 30
const CHIP_PAD_PX = 12

export function chipLabel(hours) {
  return hours.map(h => `+${h}h`).join('·')
}

export function chipWidth(hours) {
  if (hours.length === 1) return CHIP_MIN_PX
  return Math.max(CHIP_MIN_PX, Math.ceil(chipLabel(hours).length * CHAR_PX) + CHIP_PAD_PX)
}

export function hoursInLabel(label) {
  return [...String(label).matchAll(/(\d+)h/g)].map(m => Number(m[1]))
}

// The closest pair of marks, in screen pixels. This is the number that
// decides whether the marks can be read separately.
export function minSeparationPx(points) {
  let min = Infinity
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  return min
}

const centroid = members => ({
  x: members.reduce((s, m) => s + m.x, 0) / members.length,
  y: members.reduce((s, m) => s + m.y, 0) / members.length,
})

// Group marks that cannot be read apart. Every input mark comes back in
// exactly one group — nothing is ever dropped.
//
// The grouping is by proximity: a mark joins a group when it is within the
// separation of any member already in it, so a chain of marks that each
// nearly touches the next ends up as one chip.
export function clusterMarks(items, sep = MARK_SEPARATION_PX) {
  const groups = []
  for (const item of [...items].sort((a, b) => a.hours - b.hours)) {
    const g = groups.find(g => g.members.some(m => Math.hypot(m.x - item.x, m.y - item.y) < sep))
    if (g) g.members.push(item)
    else groups.push({ members: [item] })
  }
  return groups.map(g => {
    const members = [...g.members].sort((a, b) => a.hours - b.hours)
    const hours = members.map(m => m.hours)
    const single = hours.length === 1
    const c = centroid(members)
    return {
      hours,
      times: members.map(m => m.time),
      x: single ? members[0].x : c.x,
      y: single ? members[0].y : c.y,
      label: chipLabel(hours),
      width: chipWidth(hours),
    }
  })
}

// The zoom at which the closest pair of marks reaches the separation.
// Screen pixels double with every zoom level, so the distance to cover is
// a power of two away.
export function zoomForSeparation(currentZoom, minSepPx, sep = MARK_SEPARATION_PX) {
  if (!Number.isFinite(currentZoom) || !Number.isFinite(minSepPx) || minSepPx <= 0) return Infinity
  return currentZoom + Math.log2(sep / minSepPx)
}

// The zoom the focus action should move to: far enough in that the marks
// separate, close enough that the path still fills the view, never past the
// map's own maximum.
export function focusZoom({ fitZoom, sepZoom, maxZoom, minZoom = 0 }) {
  const lo = Number.isFinite(minZoom) ? minZoom : 0
  const hi = Number.isFinite(maxZoom) ? maxZoom : lo
  const fit = Number.isFinite(fitZoom) ? Math.floor(fitZoom) : lo
  const sep = Number.isFinite(sepZoom) ? Math.ceil(sepZoom - 1e-9) : fit
  return Math.max(lo, Math.min(hi, Math.max(fit, sep)))
}
