# Camera-wall computer vision — audit, 2026-10-15

Scope: everything between a public CCTV frame arriving and a verdict being
touched. `server/vision/{hazeRead,hazeSignal,hazeVision,hazeEvidence,
visionLook,floodWall,frameGrab,coverage}.js`, `server/sources/metarVisibility.js`,
the two endpoints (`/api/haze-vision`, `/api/haze-evidence`), and the two
front-end readers (`public/js/layers/cctvWall.js`, `public/js/cctvEntry.js`).

The product rule under audit: **this pipeline may never output a µg/m³ number or
claim to identify pollution.** Pixels cannot separate smoke from fog, rain, or a
dirty lens. A defect that lets it overclaim outranks a crash.

Method: read every file, then **execute** the reachable ones. Claims below marked
DEMONSTRATED were produced by running code, not by reading it. Hypotheses that
failed are listed too, so they are not re-chased.

---

## Shipped

### 1. The camera button claimed it had found no smoke — and had stopped looking

`/api/haze-vision` published `tint: {smoke_like, fog_like}` counted from
`tint_hint`. Commit `18444ed` replaced the `tint_hint` write with a literal
`null` in the same commit that moved the verdict onto a per-camera daylight
baseline, so both counts became **structurally zero permanently** while still
being published as measurements.

`public/js/cctvEntry.js` derived `flagged = smoke + fog`, always `0`, and fell
through to `"N scored · none smoky"`. The button asserted it had inspected the
cameras and found no smoke. It had stopped inspecting.

Fixed: the button now reports `possible_haze` counted from the same rows as
`scored`; the dead `tint` block is replaced by `appearance_split: null`; and
`hazeVision.js` writes `r.tintHint` again so the stored series is not truncated
at the changeover. The verdict path is untouched.

Guard: `scripts/test-cv-honesty.mjs`, 15 checks, executes the real `readoutText`.
Mutations caught: restoring the wording, republishing `tint`, reading the absent
`features.tintHint`.

> Trap worth writing down: `readFrame` returns `tintHint` at the **top level**.
> There is no `features.tintHint`; reading it there yields `undefined` and writes
> a bare `null` — passing every check except the one that looks.

### 2. `/api/health` published a high-water mark as a row count

`db.readings` was `MAX(id)`, in a block of six exact `COUNT(*)` values.
Ids are never reused, so it read **18,720,908 against 4,777,758 actual rows**
and climbs forever while retention holds the table flat. This is the number a
reader uses to judge whether the hot tier needs attention — it nearly caused a
5-minute-outage shrink that would have reclaimed 1.6 MB.

Fixed: renamed `readings_max_id`. Guard: `scripts/test-health-row-count.mjs`,
10 checks, 3 mutations caught.

---

## Found, demonstrated, deliberately NOT shipped

Both are in the feature the verdict hinges on (`darkChannelNorm`), and both are
in `hazeRead.js`'s normalisation. Neither is shipped because either fix
invalidates every camera's 14-day baseline and forces a mass re-baseline — a bad
trade on a system about to meet real users, for a defect that does not currently
flip a verdict.

### 3. `skyRef` fallback cliff — `hazeRead.js:374-375`

```js
const skyRef = skyLuma > 20 ? skyLuma : 180
```

**DEMONSTRATED.** One luma unit of discontinuity:

| skyLuma | darkChannelNorm |
|---------|------------------|
| 21 | 4.504 |
| 20 | 0.5255 |

An **8.57×** jump. Measured `rise` against a clean baseline: **+4.0155**, so
`hazeSignal.js:66`'s `rise >= .05` clears by ~80×, and the score term at
`hazeRead.js:398` clamps at 1.

Trigger: the top 28% of the frame is a near-black treeline or building wall
over a sunlit road (meanLuma 78, so `assessHaze`'s `meanLuma < 40` gate keeps it).

**Honest limit:** no verdict flip was demonstrated. Every such frame returned
`changed-view`, because the view-signature guard catches a strip that dark. The
defect is real at feature level and latent at verdict level.

### 4. The second cue is partly an exposure meter — `hazeRead.js:331`

`darkChannelNorm` is normalized by the frame's **own sky brightness**. So:

| perturbation | rise | clears the 0.05 gate? |
|---|---|---|
| dim rows 0–49 by 10%, ground byte-identical | **+0.0542** | yes |
| a tree line across 10% of the strip | +0.0527 | yes |

`assessHaze` requires two cues — lost contrast AND increased normalized dark
channel. Contrast does not move under an exposure change, so the second cue
clears alone with **no haze present**.

Note the direction: a dark scene object does *not* raise it. A 120px black van in
the road **lowered** `darkChannelNorm` 0.4885 → 0.4089. Dark objects suppress
haze; the entire exposure is on the denominator.

---

## Found, flagged, left alone

### 5. `pm25FromHaze` emits a concentration its own guard rejects — `hazeRead.js:610`

**DEMONSTRATED.** 20 anti-correlated samples give slope −0.7429, r = **−1**,
`usable: false` — and `pm25FromHaze(100)` still returns **13.14 µg/m³**.

No live caller. But it is the only concentration-emitting function in the
pipeline, the product rule says nothing here may emit one, and it ignores the
`usable` flag written into its own return. Removing a calibration affordance is
a product decision, so this is flagged rather than deleted. It should not survive
long.

### 6. `varianceSplit` divides 0 by 0 — `hazeRead.js:509`

**DEMONSTRATED.** 9 samples across 2 cameras, all identical → `between` and
`within` both NaN, `ok: true`, verdict renders as "dominates (NaN%)". No live
caller. Low severity, but it reports success while saying NaN.

---

## Refuted — recorded so they are not re-chased

- **Baseline contamination.** `assessHaze` admits `possible-haze` frames into
  the reference pool, which looked like a drifting-baseline defect. Measured:
  **0 of 207** cameras have a majority-hazy pool; only 85 have any. The
  reference is the median of the *sharpest* third, which self-limits the
  contamination by construction.
- **`province_code` coverage.** 33% overall, which looked like most camera
  evidence being silently dropped by `hazeEvidence`'s `WHERE province_code IS
  NOT NULL`. Measured: **100% over the last 72h** on all four sources. The 33%
  was entirely pre-`version: 6`.
- **`haze_index` / `contrast_loss` disagreement.** **0 mismatches in 24h**.
  Historical NULLs are pre-version-6.
- **METAR `HZ` classified as fog.** If true, a haze report would set
  `fog_likely` and suppress the camera evidence it should corroborate. Measured:
  `HZ` → `aerosol`; only `FG`/`BR` → `obscure`. `classifyCause` is correct.
- **Humidity joining two namespaces.** `hazeEvidence` builds `rh` keyed by
  `station_key` and reads it with a province code. Measured: openmeteo
  `station_key` **is** the province code, 77 of 77, no station mismatches.
  Correct, though the coupling is implicit and worth a comment.
- **Oversize buffers silently reinterpreted** (`hazeRead.js:331`). Refuses
  `len < FRAME_BYTES`, accepts `len >`; a 640×360 buffer returns features
  byte-identical to its first half read as 320×180. Real but **unreachable** —
  `frameGrab.js:42,64` always emits exactly `FRAME_BYTES`.

## Verified correct

- **Geometry.** `frameGrab.js` produces `-vf scale=320:180 -pix_fmt rgb24`, no
  stride padding, so `FRAME_W/H/FRAME_BYTES` hold on the production path.
- **Every divide-by-n** in `sobelField`/`chromaStats`/`darkChannel` verified
  against exact pixel counts; no divisor can be zero.
- **No NaN/Infinity reachable** from a Buffer in any load-bearing feature.
  (From a non-Buffer input, `darkChannelNorm` returns 1.4167 = max, because
  `m < mn` never fires — unreachable in production.)
- **Degenerate frames** (solid black / white / 200 / 1) all withhold
  `hazeIndex`; the consumer catches them via `std < 3` and `meanLuma < 40`, and
  `blank` rows are excluded from the baseline filter so they cannot poison a
  reference.
- **Real haze behaves correctly**: β 0→1.4 moves `dark` 0.3709→0.5172 and
  `contrast` 0.0164→0.0107, reaching `possible-haze` end-to-end (loss 31,
  rise +0.0848).
- **Inert, recorded not fixed:** `|grad|` bound is √2 not 1 (max measured
  1.0607) — harmless because consumers use ratios and the floors were
  calibrated against this exact normalization; `sobelField` never writes
  `rowMean[179]`, so `base` divides 39 real rows by 40 (−2.5%), far under the
  0.005 floors.

---

## Characteristic, not a defect

**The camera wall's only lever on a verdict almost never moves.** Replaying the
real `provinceLevel()` over 30 days of recorded frames, 4,437 province-windows:

| level | windows |
|---|---|
| insufficient | 3,197 |
| clear | 1,186 |
| some | 51 |
| **widespread** | **3** (0.068%) |

`shouldFloorToWatch` requires `widespread`, which needs `share >= 0.5` **and**
`cams_hazy >= 2`, over a `MIN_VALID` of 2 judged cameras. 72% of windows have
fewer than 2 judged cameras and cannot reach even `some`.

**Do not fix this by lowering a threshold.** It would convert an honest silence
into false alarms, which is the worse failure for an air-quality product. The
real lever is coverage — more reachable cameras per province — not a looser
rule.