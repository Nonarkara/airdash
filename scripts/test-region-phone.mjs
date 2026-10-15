// Phone composition for /region. A live check on an iPhone 14 and a 360px
// Android found three separate failures:
//   1. The map was locked to 54dvh, under a 170px title stack, so it was
//      about half the screen while the instrument aside peeked in.
//   2. That aside laid out at its full content height (~805px) instead of
//      collapsing, and Leaflet zoom (30px) plus 20px checkboxes were under
//      the 44px touch minimum.
//   3. The brand badge said 3.0 while the shipped assets were ?v=2.4.93.
// This file checks the source contract. Viewport geometry is measured
// separately against the rendered page.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync('public/region.html', 'utf8')
const css = readFileSync('public/css/region.css', 'utf8')
const js = readFileSync('public/js/region.js', 'utf8')

const token = html.match(/\/css\/region\.css\?v=(\d+\.\d+\.\d+)/)?.[1]
assert.ok(token, 'region.css carries an asset token')
assert.match(html, new RegExp(`<small class="ver">${token.replace(/\./g, '\\.')}</small>`),
  'the AIR·DASH badge must be the same version as the asset token')
assert.doesNotMatch(html, /<small[^>]*>3\.0<\/small>/, 'the badge must not keep the product-generation label 3.0')

assert.match(html, /<details id="instrument-sheet">/, 'the instrument rail is a disclosure')
assert.doesNotMatch(html, /<details id="instrument-sheet" open>/, 'the sheet starts collapsed so phones do not render the full rail')
assert.match(html, /class="rail-body"/)
assert.match(js, /instrumentSheet\.open=!phoneRail\.matches/, 'desktop opens the rail; phones leave it collapsed')

assert.doesNotMatch(css, /54dvh/, 'the map must not be locked to 54% of the viewport')
const phone = css.slice(css.lastIndexOf('@media (max-width: 650px)'))
assert.ok(phone.length > 200, 'a phone block exists at the end of region.css so it wins the cascade')
assert.match(phone, /#regional-map\s*\{[^}]*flex:\s*1 1 auto/)
assert.match(phone, /height:\s*auto !important/)
assert.match(phone, /min-height:\s*0 !important/)
assert.match(phone, /#instrument-sheet:not\(\[open\]\) > \.rail-body \{\s*display:\s*none/)
assert.match(phone, /width:\s*44px !important/)
assert.match(phone, /height:\s*44px !important/)
assert.match(phone, /\.instrument-panel input\[type="checkbox"\][\s\S]*min-height:\s*44px/)
assert.match(phone, /#instrument-sheet > summary[\s\S]*min-height:\s*44px/)

console.log(`PASS regional phone contract: badge ${token}, collapsed sheet, map fills the screen, 44px targets`)
