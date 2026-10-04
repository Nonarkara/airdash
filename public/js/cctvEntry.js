// HAZE EYES — the one place the computer-vision camera wall becomes reachable.
//
// WHY THIS FILE EXISTS
// public/js/layers/cctvWall.js was 152 lines of built, styled, working UI —
// cards, an IntersectionObserver that staggers stream startup because these
// are small municipal servers that starve each other when twelve fire at
// once, an Escape handler, a "most of the wet season nothing is hazy"
// fallback — and NOTHING IMPORTED IT. Not main.js, not map.js, not the
// header. The wall, `/api/cctv/haze-eyes`, and the entire frame-grab and
// pixel-read pipeline behind it were all reachable only by typing a URL.
// A feature can be correct, tested and deployed and still be absent from
// the product; the only thing that makes it real is an entry point.
//
// That entry point is a button in the top bar, and the button carries a
// live readout so the reader can see the vision running — and see what it
// does NOT cover — before clicking.
//
// HONESTY CONTRACT FOR THE READOUT
// The number is "frames we read / cameras we can read them from", never
// the catalogue total. 1,349 cameras sounds like coverage; 588 is the
// truth. And when the pixel read finds frames tinted like smoke, that count
// is shown — because a computer-vision feature whose output is always
// "nothing found" is indistinguishable from one that is not running.
// If the fetch fails the readout stays EMPTY: a missing measurement is
// missing, not zero.
import { openHazeEyes } from './layers/cctvWall.js?v=2.4.70'
import { tr } from './i18n.js?v=2.4.70'
import { on } from './state.js?v=2.4.70'

const READOUT_MS = 5 * 60_000

// "200 scored · 66 smoky" — what the vision actually did, in the fewest
// words that stay true. Not a confidence score, not a coverage boast.
function readoutText(d) {
  const scored = Number.isFinite(d.scored) ? d.scored : null
  if (scored === null) return ''
  const smoke = Number(d.tint?.smoke_like) || 0
  const fog = Number(d.tint?.fog_like) || 0
  const flagged = smoke + fog
  if (flagged > 0) {
    return `${scored} ${tr('ภาพ', 'scored')} · ${flagged} ${tr('คล้ายควัน', 'smoky')}`
  }
  return `${scored} ${tr('ภาพ', 'scored')} · ${tr('ไม่พบควัน', 'none smoky')}`
}

// Reachable-over-total is the coverage figure the operator actually needs:
// of everything AirDash knows about, how much can we see? Shown as the
// button's title, not its face — the face stays short.
function coverageTitle(d) {
  const cov = d.coverage
  if (!cov) return ''
  const pct = Number.isFinite(cov.pct_reachable) ? cov.pct_reachable.toFixed(0) : null
  if (pct === null) return ''
  return tr(
    `อ่านภาพได้จากกล้อง ${cov.reachable} จาก ${cov.total} ตัว (${pct}%)`,
    `Readable video from ${cov.reachable} of ${cov.total} cameras (${pct}%)`,
  )
}

async function paintReadout(el) {
  try {
    const res = await fetch('/api/haze-vision')
    if (!res.ok) return
    const d = await res.json()
    el.textContent = readoutText(d)
    const title = coverageTitle(d)
    const btn = el.closest('button')
    if (btn && title) {
      btn.title = `${tr('คอมพิวเตอร์ไวชันอ่านภาพกล้องสด', 'Computer vision reading live camera frames')} · ${title}`
    }
  } catch {
    // An optional readout must never cost the user the button. Empty is the
    // honest state here: we do not know, so we do not print a number.
  }
}

export function initCctvWall() {
  const btn = document.getElementById('cctv-wall-btn')
  if (!btn) return
  const readout = document.getElementById('cv-readout')

  // A card's "show on map" hands the id back through the same custom event
  // map.js already listens for, so neither the wall nor the map layer needs a
  // direct import of the other (which would be a cycle).
  const onLocate = (id, source) => {
    window.dispatchEvent(new CustomEvent('airdash:locate-camera', { detail: { id, source } }))
  }
  const open = () => {
    btn.setAttribute('aria-expanded', 'true')
    openHazeEyes({ onLocate }).finally(() => btn.setAttribute('aria-expanded', 'false'))
  }
  btn.addEventListener('click', open)

  // Second entry point: the button inside a camera's own map popup. Clicking
  // the PIN is the route to the camera; the wall button in that popup is the
  // route out to every other one, so the map is never a dead end.
  window.addEventListener('airdash:open-haze-eyes', open)

  if (readout) {
    paintReadout(readout)
    const timer = setInterval(() => paintReadout(readout), READOUT_MS)
    // The readout is bilingual; repaint it when the language flips.
    on('lang', () => paintReadout(readout))
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) paintReadout(readout)
    })
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true })
  }

  // Deep link: /ops.html?haze-eyes opens the wall directly, same escape
  // hatch the Window panel uses, so a shared link can point at the thing
  // this button shows.
  if (new URLSearchParams(location.search).has('haze-eyes')) btn.click()
}
