# AirDash Comprehensive Audit Plan

## Context
AirDash is a real-time air-quality monitoring dashboard for Thailand, built on the same architecture as FloodDash. It evolved from flood monitoring to PM2.5/dust monitoring with a Rain-Washout signature feature. The codebase has been touched by multiple AI agents (Fable 5 → Kimi K3), creating potential hygiene issues.

**Tech Stack:**
- Frontend: Vanilla ES modules, vendored Leaflet, no build step, CSS custom properties
- Backend: Node.js ≥22.5, zero npm deps, SQLite WAL (`node:sqlite`), custom HTTP server
- AI: Cloud-routed LLM chat with graceful degradation
- Deployment: Cloudflare Pages (frontend) + Cloudflare Tunnel (backend)

**Two User Modes:**
- 🟢 Citizen mode (ง่าย / EASY): For non-technical readers — shows essentials only
- 🟦 Operator mode (เต็ม / FULL): For city admins — shows everything

## Audit Dimensions

### Stage 1 — Parallel Deep Audits (4 agents)
1. **Code Health Auditor** — JS quality, anti-patterns, potential bugs, consistency, dead code, naming hygiene, flood→air migration residue
2. **UX/UI & Accessibility Auditor** — Mode switching UX, mobile sheet behavior, citizen vs operator experience, ARIA compliance, Thai typography, visual hierarchy, alert urgency
3. **Navigation & State Flow Auditor** — City page ↔ main page mechanics, URL state, focus switching, back button, deep linking, history.replaceState, mobile navigation
4. **Performance & Security Auditor** — Loading time, caching strategy, SQLite query performance, bundle size, XSS/SQLi risks, headers, secrets exposure, input validation

### Stage 2 — Synthesis & Actionable Fixes
5. **Orchestrator** — Merge all findings, prioritize by severity (🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low), create fix plan

## Key Files to Examine
- `public/js/main.js` — boot sequence, mode switching, tab management
- `public/js/state.js` — pub/sub store
- `public/js/map.js` — Leaflet map, radar, layers
- `public/js/panels/focus.js` — city navigation, URL sync
- `public/js/panels/city-dashboard.js` — city detail panel
- `public/js/panels/citizen.js` — citizen mode panel
- `public/js/panels/header.js` — header, mode toggle
- `public/js/panels/detail.js` — province detail
- `server/api.js` — API routes, caching, input validation
- `server/index.js` — server bootstrap
- `server/http.js` — HTTP handling, security headers
- `server/config.js` — configuration
- `server/risk.js`, `server/washout.js`, `server/danger.js` — scoring engines
- `public/index.html` — markup, meta tags, boot screen
- `public/css/layout.css`, `public/css/components.css` — styles
- `public/sw.js` — service worker

## Deliverable
A comprehensive audit report with:
- Severity-ranked findings
- File:line references
- Before/after code snippets for fixes
- UX recommendations with rationale
- Performance optimization suggestions
- Security hardening checklist
