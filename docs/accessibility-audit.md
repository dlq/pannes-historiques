# Automated Accessibility Audit

Date: 2026-11-01. Scanner: axe-core 4.14.0, isolated Playwright Chromium, against the local
production-shaped fixture app on port 4192. This includes the local `bounded-audits` fixes;
it is not a claim that those fixes are deployed or a WCAG conformance certification.

## Coverage And Findings

Scanned 44 states: French/English × desktop 1440×1000/mobile 390×844 × current, planned,
Archive, Context, disclosure detail, regional detail, provenance dialog, address overview,
About, 404 and offline fallback. The map/search/domain/detail transitions use the real browser
modules with deterministic service data.

Enabled axe tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice`.

| Observed problem | Local fix |
| --- | --- |
| Language links displayed EN/FR but their accessible name was only Language/Langue. | Accessible names now include the visible destination-language code, with desktop/mobile FR/EN browser regression coverage on root and About. |
| Small planned/Archive month labels had approximately 3.0:1 / 3.99:1 contrast. | Use the existing deep semantic text colors on the existing pale tiles. |
| Blue action text on gray controls had approximately 4.08:1 contrast. | Darken the shared accent from `#2775c9` to `#2168b4`. |
| Inline contact links relied on color alone. | Underline provenance links persistently. |
| Manual follow-up: the skip link invoked a fragment-history reload, returning focus to the document body. | Handle the skip action directly in the sheet controller, expand a mobile peek sheet and focus the sheet; the next Tab reaches address search without changing URL/history. Add a descriptive localized skip label and keyboard regression. |

Before the fixes, axe reported 42 rule occurrences across the 44 states (not 42 independent
bugs). Both the post-fix rerun and the final reusable-script run reported **zero violations
in all 44 states**. No rules or failing nodes were disabled/excluded to obtain that result.

The scanner still returned incomplete/manual-review items for contrast in 19 states and the
skip-link rule in 12 states in the final run. These are not passes or confirmed violations. Canvas/map content,
dynamic/obscured text, manual focus use and assistive-technology speech need separate review.
The root skip link was separately verified on desktop/mobile: focus reaches the sheet, the mobile panel expands and the next Tab reaches address search. The existing dialog keyboard checks and map/search E2E suite supplement this scan. Real device
permissions, VoiceOver/NVDA speech, other browser engines, zoom/high-contrast modes, all live
payloads and the 500 page are not certified by this audit.

## Repeat Without Changing Project Dependencies

Install the pinned scanner into a temporary directory (do not commit it or its package files):

```bash
npm install --prefix /private/tmp/pannes-a11y-tools --ignore-scripts --no-audit --no-fund axe-core@4.14.0
```

Start the dedicated fixture server in one terminal:

```bash
APP_PORT=4192 uv run python tests/e2e_server.py
```

Run in another terminal:

```bash
APP_PORT=4192 AXE_CORE_PATH=/private/tmp/pannes-a11y-tools/node_modules/axe-core/axe.min.js node scripts/maintenance/accessibility-audit.mjs
```

The script defaults to ignored `tmp/accessibility-audit/`; `PANNES_A11Y_OUTPUT_DIR` changes that
path. `PANNES_A11Y_BASE_URL` can select another loopback fixture root. It deliberately rejects
remote targets and verifies application identity before scanning. A nonzero violation count
sets a failing exit status. JSON includes rule IDs, affected nodes and manual-review items;
screenshots include failures and representative successful English pages at both viewports.
No project dependency or lockfile change is required. Install Chromium with the existing
`npx playwright install chromium` workflow if needed.

Browser plugin not available; existing Playwright instrumentation supplied the automated scan.
Temporary before/after reports and screenshots are under `/private/tmp/pannes-bounded-audits/`.
Preserve reviewed conclusions here; raw audit output stays outside Git. See the
[axe-core project](https://github.com/dequelabs/axe-core) for scanner scope and limitations.
