// Behavioural regression guard for the compact header. Populated geometry
// is measured separately in header-width-gate and the release browser review.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

class Node {
  hidden = false
  attrs = {}
  handlers = {}
  focused = false
  classList = { toggle() {} }
  addEventListener(name, handler) { this.handlers[name] = handler }
  setAttribute(name, value) { this.attrs[name] = value }
  append(node) { this.child = node }
  querySelector() { return this.focusTarget }
  contains(node) { return node === this || node?.inHeader }
  focus() { this.focused = true }
}
const ids = Object.fromEntries(['place-search-container', 'header-menu', 'header-search-toggle', 'header-menu-toggle'].map(id => [id, new Node()]))
ids['header-menu'].hidden = true
const header = new Node()
const input = new Node()
const menuItem = new Node()
ids['place-search-container'].focusTarget = input
ids['header-menu'].focusTarget = menuItem
const document = {
  handlers: {},
  getElementById(id) { return ids[id] ?? null },
  querySelector() { return header },
  addEventListener(name, handler) { this.handlers[name] = handler },
}
const source = readFileSync(new URL('../public/js/panels/header.js', import.meta.url), 'utf8')
const init = source.slice(source.indexOf('export function initHeader()'), source.indexOf('// The province row whose Danger'))
vm.runInNewContext(init.replace('export ', '') + '\ninitHeader()', { document, on() {}, renderStatus() {} })
const search = ids['place-search-container'], menu = ids['header-menu']
const find = ids['header-search-toggle'], tools = ids['header-menu-toggle']
assert.equal(search.hidden, true, 'search starts closed')
assert.equal(menu.hidden, true, 'menu starts closed (HTML hidden attribute)')

find.handlers.click()
assert.equal(search.hidden, false)
assert.equal(menu.hidden, true)
assert.equal(input.focused, true, 'Find focuses the search input')
assert.equal(find.attrs['aria-expanded'], 'true')
tools.handlers.click()
assert.equal(search.hidden, true, 'Menu closes Search')
assert.equal(menu.hidden, false)
assert.equal(menuItem.focused, true)
assert.equal(find.attrs['aria-expanded'], 'false')
header.handlers.keydown({ key: 'Escape' })
assert.equal(menu.hidden, true)
assert.equal(tools.focused, true, 'Escape restores the owning trigger')
find.handlers.click()
document.handlers.click({ target: { inHeader: true } })
assert.equal(search.hidden, false, 'inside click preserves input')
document.handlers.click({ target: {} })
assert.equal(search.hidden, true, 'outside click dismisses search')
assert.equal(find.attrs['aria-expanded'], 'false')
find.handlers.click()
header.handlers.keydown({ key: 'Escape' })
assert.equal(find.focused, true)
const html = readFileSync(new URL('../public/ops.html', import.meta.url), 'utf8')
for (const id of ['cctv-wall-btn', 'ask-btn', 'window-btn', 'langtoggle', 'modetoggle', 'split-btn', 'home-btn', 'flooddash-btn', 'about-btn', 'place-search']) {
  assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} remains uniquely reachable`)
}
console.log('PASS header drawer focus, exclusivity, Escape, outside dismissal and preserved tool identities')
