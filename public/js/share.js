// Native share with honest fallbacks — the ONE way anything in FloodDash
// shares a URL.
//
// Order of preference:
//   1. navigator.share — the OS share sheet (Android/iOS/macOS). This is
//      what a phone user expects the button to do: pick LINE, Messenger,
//      SMS, mail, AirDrop… from the system UI instead of whatever short
//      list we hardcoded. Requires HTTPS + a user gesture; both hold here.
//      A dismissed sheet rejects with AbortError — that is a user choice,
//      NOT a failure, and must not flash an error.
//   2. navigator.clipboard.writeText — desktop browsers without share.
//   3. hidden-textarea execCommand('copy') — older iOS Safari, which gates
//      async clipboard writes behind stricter gestures.
//
// Every path reports back through `feedback(state)` so the button can show
// "✓ copied" / nothing / "✕" — a silent share button feels broken even
// when it worked.
//
// Kept dependency-free (no i18n import) so both the citizen panel and the
// place card can use it without widening their module graphs.

/** True when the OS share sheet is available for this payload. */
export function canNativeShare(payload = {}) {
  if (typeof navigator === 'undefined' || !navigator.share) return false
  // canShare is optional; when present, respect it (it catches e.g.
  // bad URLs) — when absent, share() existing is the best signal we get.
  if (navigator.canShare) { try { return navigator.canShare(payload) } catch { return false } }
  return true
}

function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

/** Copy `text`, best effort across clipboard generations. Returns success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return legacyCopy(text)
  }
}

/**
 * Share {url, title, text} via the OS sheet, falling back to copy.
 * Returns 'shared' | 'copied' | 'cancelled' | 'failed' — callers use it
 * to drive button feedback, and MUST treat 'cancelled' as a non-event.
 */
export async function sharePlace({ url, title = '', text = '' }) {
  const payload = { url, title, text: text || title }
  if (canNativeShare(payload)) {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (err) {
      // AbortError = the user closed the sheet. Anything else (rare
      // platform quirks) falls through to copy so the tap still produces
      // a usable result.
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

/**
 * Standard button feedback: swap the label briefly, then restore.
 * 'cancelled' deliberately does nothing — the user closed the sheet on
 * purpose and flashing ✓/✕ at them would misreport what happened.
 */
export function shareFeedback(btn, state, labels = {}) {
  if (!btn || state === 'cancelled' || state === 'shared') return
  const original = btn.textContent
  btn.textContent = state === 'copied' ? (labels.copied ?? '✓ คัดลอกแล้ว') : (labels.failed ?? '✕')
  btn.disabled = true
  setTimeout(() => { btn.textContent = original; btn.disabled = false }, 1600)
}
