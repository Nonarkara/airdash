// Storage can be blocked or full. Preferences must still work for this visit.
const session = new Map()
export function readPreference(key) {
  if (session.has(key)) return session.get(key)
  try { return localStorage.getItem(key) } catch { return null }
}
export function writePreference(key, value) {
  session.set(key, String(value))
  try { localStorage.setItem(key, value) } catch { /* current visit keeps the choice */ }
}
export function removePreference(key) {
  session.set(key, null)
  try { localStorage.removeItem(key) } catch { /* current visit keeps the choice */ }
}
