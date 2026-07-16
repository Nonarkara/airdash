// Tiny pub/sub store shared by panels and map layers.
const listeners = new Map() // topic → Set<fn>

export const store = {
  lang: localStorage.getItem('fd_lang') === 'en' ? 'en' : 'th',
  snapshot: null,      // last /api/snapshot payload
  sensorHealth: null,  // last /api/sensors/health payload
  connected: false,    // SSE liveness
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
  localStorage.setItem('fd_lang', store.lang)
  emit('lang', store.lang)
}
