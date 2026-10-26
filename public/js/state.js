import { readPreference, writePreference } from './preferences.js?v=2.4.126'
// Tiny pub/sub store shared by panels and map layers.
const listeners = new Map() // topic → Set<fn>

export const store = {
  lang: readPreference('ad_lang') === 'en' ? 'en' : 'th',
  snapshot: null,      // last /api/snapshot payload
  sensorHealth: null,  // last /api/sensors/health payload
  connected: false,    // SSE liveness
  activeArea: null,    // current focus area (set by focus.js on selection);
                        // consumed by the top-bar danger chip + city dashboard.
  horizon: 0,          // the zone's horizon in hours (0 = now). The map's
                        // province zone paints the band's level at 0, and the
                        // model's expected CHANGE at any other horizon.
  outlook: null,       // last /api/outlook payload (the hourly model grid)
}

export function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set())
  listeners.get(topic).add(fn)
  return () => listeners.get(topic).delete(fn)
}

export function emit(topic, data) {
  for (const fn of listeners.get(topic) ?? []) {
    try { fn(data) } catch (err) { console.error(`listener for ${topic} failed`, err) }
  }
}

export function setLang(lang) {
  store.lang = lang === 'en' ? 'en' : 'th'
  writePreference('ad_lang', store.lang)
  emit('lang', store.lang)
}
