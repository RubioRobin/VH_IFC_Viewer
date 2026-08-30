# Design QA — IFC viewer toolbar refinement

- Source visual truth: `C:\Users\BimPi\AppData\Local\Temp\codex-clipboard-fb4dbd8a-e6be-46a3-8dad-b63415b6025c.png`
- Rendered implementation: `Z:\01_Projecten\20260413_VH-Engineering_IFC-Viewer_v2.0\03_Development\toolbar-implementation-full.png`
- Focused toolbar crop: `Z:\01_Projecten\20260413_VH-Engineering_IFC-Viewer_v2.0\03_Development\toolbar-implementation.png`
- Combined comparison: `Z:\01_Projecten\20260413_VH-Engineering_IFC-Viewer_v2.0\03_Development\toolbar-comparison.png`
- Viewport: 646 × 320 CSS px; device pixel ratio 1
- Pixel dimensions: source 808 × 155 px at an inferred 1.25 density; normalized source and focused implementation crop 646 × 124 px; implementation full view 646 × 320 px
- State: neutral toolbar, no active tool, no visible status message

## Findings

No actionable P0, P1, or P2 differences remain for the requested refinement.

- Fonts and typography: existing Outfit typography, weight, size, and antialiasing are retained. “Transparant” now fits on one line and uses the same centered text row as the other five actions.
- Spacing and layout rhythm: the fixed double-height label row was replaced by an automatic row. Button height is 61.2 px, toolbar height is 75.7 px, and the measured space from text bottom to button bottom is 12.08 px for every button. Toolbar client and scroll widths both measure 568 px, so there is no overflow at the reference width.
- Colors and visual tokens: the existing dark, gold, and cream tokens are unchanged, including borders and interaction states.
- Image and icon fidelity: the existing application icon library is retained. Each icon center differs from its label center by less than 0.001 px, confirming exact horizontal alignment.
- Copy and content: the visible label is now exactly “Transparant”. The underlying 60% transparency behavior and accessible hidden status messages remain unchanged.

## Evidence

- Full-view evidence: `toolbar-implementation-full.png` shows the compact toolbar centered at the bottom of the viewer without overlapping other controls.
- Focused comparison: `toolbar-comparison.png` places the normalized source above the implementation. It clearly shows the one-line label, reduced lower whitespace, shorter toolbar, and centered icon/text pairs.
- Focused evidence was required because alignment and lower padding are subtle control-level details.

## Comparison history

1. Source finding — P1: the action was labeled “60% transparant” instead of the requested “Transparant”. Fix: changed the visible label, title, and accessible button name to “Transparant”. Post-fix evidence: browser role lookup resolves exactly one “Transparant” button.
2. Source finding — P2: a fixed 2.2 em label row created excessive space beneath the text. Fix: changed the label row to `auto`, reduced the button minimum height to 3.6 rem, tightened the gap, and reduced bottom padding. Post-fix evidence: final text-to-button-bottom spacing is consistently 12.08 px.
3. Source finding — P2: icons and labels did not read as one shared centered column. Fix: both elements now use the same centered grid axis and the label spans the full button width. Post-fix evidence: all six icon and text center points match within 0.001 px.

## Interaction and console checks

- Transparency toggled on (`aria-pressed=true`) and off (`aria-pressed=false`).
- The visible button copy remained “Transparant” in both states.
- Standard-view control was exercised to return the toolbar to a neutral focus state.
- Browser console: no errors. Existing Three.js `THREE.Clock` deprecation warnings remain and are unrelated to this change.
- Production build: passed with Vite 8.0.10.

## Follow-up polish

No P3 follow-up is required for the requested scope.

final result: passed
