# Launch readiness — 2026-10-06, Asia/Bangkok

Production: 2.4.70; audit baseline e847760. Full npm test exit 0: 1,017 custom checks + 14 TAP tests = 1,031, no failure lines. Asset deploy guard passed; working tree initially clean.

Live checks:
- Public health/search/exports HTTP 200 with AirDash identity; 21/21 source pipelines current, no recorded source failures.
- Root serves Story, /ops serves dashboard, /install serves install guide. Main module, search module, layout CSS and service worker bytes match the checkout under the production version key.
- Real browser dashboard rendered Danger 41, zero captured console errors. Mobile search returned Bangkok entries in a 420px dropdown; no document overflow at 320, 390, 768, 1120, 1920 widths. This is an overflow check, not exhaustive physical-device or screen-reader certification. Screenshot /tmp/airdash-launch-mobile.png.
- Launchd server/tunnel running. Hourly watchdog heartbeat 43 minutes old; daily external-volume backup completed today 03:19:54 Bangkok. Archive available, receipt 8.6 hours old and not stale.
- Bangkok edge mirror contains a 255-second-old snapshot. Other mirrors are materially older (risk approximately four days old); they are last-known-good fallback, not live redundancy. Series/stations mirrors absent in this colo.

Decision: current public frontend and API pass the checked launch gates. No application deployment or restart was necessary for this audit. Do not describe the system as fully resilient: one live backend, no verified offsite backup or independent failover host, and some older/absent edge mirrors. External-drive backups share the machine's failure domain. Camera haze/composite scores remain heuristics; no live citizen alert was sent as a test. This audit does not certify all cameras or every interaction on physical iPhone/Android devices.
