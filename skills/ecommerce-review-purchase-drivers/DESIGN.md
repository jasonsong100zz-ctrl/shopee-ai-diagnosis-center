---
name: VOC Decision Lab
description: A quiet evidence-first workbench for tracing multilingual review signals into ecommerce decisions.
colors:
  primary-interactive: "#4267d5"
  primary-interactive-strong: "#2f50b2"
  primary-interactive-soft: "#e8edfc"
  primary-interactive-dark: "#87a4ff"
  primary-interactive-strong-dark: "#a8bbff"
  primary-interactive-soft-dark: "#273457"
  positive: "#23866f"
  positive-soft: "#e2f3ee"
  positive-dark: "#70cbb3"
  positive-soft-dark: "#1c3a35"
  negative: "#c35464"
  negative-soft: "#f8e7ea"
  negative-dark: "#ef96a2"
  negative-soft-dark: "#452831"
  warning: "#906019"
  warning-soft: "#f7edd8"
  warning-dark: "#e8bc70"
  warning-soft-dark: "#41351f"
  canvas: "#edf1f6"
  canvas-dark: "#10141b"
  surface: "#fbfcfe"
  surface-dark: "#171c25"
  raised: "#fff"
  raised-dark: "#1c222d"
  subtle: "#f3f6fa"
  subtle-dark: "#202733"
  ink: "#172033"
  ink-dark: "#edf2fb"
  muted: "#59657a"
  muted-dark: "#b3bfd2"
  soft: "#748096"
  soft-dark: "#8f9caf"
  line: "#dce3ed"
  line-dark: "#2b3442"
  line-strong: "#cbd5e2"
  line-strong-dark: "#3a4657"
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "clamp(30px, 4vw, 52px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.018em"
  title:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "11px"
    fontWeight: 620
    lineHeight: 1.55
    letterSpacing: "normal"
  chip-label:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.55
    letterSpacing: "normal"
  navigation:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "13px"
    fontWeight: 580
    lineHeight: 1.55
    letterSpacing: "normal"
  control:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "14px"
    fontWeight: 620
    lineHeight: 1.55
    letterSpacing: "normal"
  control-selected:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "14px"
    fontWeight: 680
    lineHeight: 1.55
    letterSpacing: "normal"
  metric:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  micro:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Noto Sans Thai", "Noto Sans", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  control-sm: "7px"
  matrix: "8px"
  control: "9px"
  navigation: "10px"
  segmented: "11px"
  container: "12px"
  section: "14px"
  pill: "999px"
  circle: "50%"
spacing:
  compact: "4px"
  xs: "7px"
  sm: "9px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  2xl: "28px"
  page-max: "44px"
components:
  button-neutral:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    height: "42px"
  input-search:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
    height: "42px"
  filter-chip:
    backgroundColor: "{colors.primary-interactive-soft}"
    textColor: "{colors.primary-interactive-strong}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.pill}"
    padding: "5px 8px 5px 10px"
    height: "32px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.navigation}"
    rounded: "{rounded.navigation}"
    padding: "9px 11px"
    height: "44px"
  theme-choice-active:
    backgroundColor: "{colors.primary-interactive-soft}"
    textColor: "{colors.primary-interactive-strong}"
    typography: "{typography.control-selected}"
    rounded: "{rounded.control-sm}"
    padding: "7px 9px"
    height: "36px"
  section-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.section}"
    padding: "22px 24px 26px"
  evidence-card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.container}"
    padding: "18px"
  factor-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "48px"
  matrix-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.matrix}"
    height: "40px"
    width: "64px"
  opportunity-disclosure:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.container}"
    padding: "13px 18px"
    height: "66px"
---

# Design System: VOC Decision Lab

## Overview

**Creative North Star: "The Evidence Workbench / 证据工作台"**

The system should feel like a calm operational desk where every summary can be traced back to its source. A cool gray-blue canvas holds paper-white work surfaces; compact typography, thin borders, and restrained low-saturation blue establish hierarchy before decoration. The approved visual lineage is modern Linear + Stripe + Notion operational SaaS, carried forward under seed exemption `incumbent-amazon-voc-user-approved-20260813`.

Its signature is a continuous evidence interaction: a decision-factor matrix narrows the dataset, individually removable filter chips make the active scope visible, and original-language evidence completes the trace. Light and dark modes preserve the same information hierarchy. Product imagery appears only when it is review evidence, never as decorative filler.

**Key Characteristics:**

- Cool gray-blue canvas with paper-white work surfaces.
- Flat-first hierarchy built from type, alignment, density, and thin structural borders.
- One restrained blue interaction voice plus semantic evidence states.
- Compact, multilingual, evidence-first reading with full light/dark parity.
- A traceable matrix → removable filters → original-language evidence chain.

## Colors

The palette is quiet and operational: cool neutrals carry the workload, blue marks interaction, and green, rose, and amber are reserved for evidence or quality state.

### Primary

- **Operational Blue:** The default interactive accent for factor bars, selected controls, links, and bullets.
- **Deep Control Blue:** Stronger emphasis for selected labels and the brand mark.
- **Selection Mist:** Low-contrast blue fill for selected chips, controls, and placeholders.
- **Night Interactive Blue:** The lighter dark-theme accent pair preserves contrast without increasing saturation.

### Secondary

- **Verified Teal:** Positive evidence and passing data-quality states; its soft companion supplies the background.
- **Evidence Rose:** Negative evidence and failure states; its soft companion supplies the background.
- **Audit Amber:** Warnings and claim-gate notices; its soft companion supplies the background.

### Neutral

- **Cool Gray-Blue Canvas:** The page backdrop separates the application shell from work surfaces.
- **Paper-White Surface / Raised Paper:** Sections and evidence items sit on near-white layers in light mode.
- **Night Canvas / Night Surface / Night Raised:** Dark-mode counterparts preserve the same three-step surface hierarchy.
- **Ink / Muted / Soft:** Three explicit text levels separate conclusions, supporting copy, and metadata.
- **Structural Line / Strong Line:** Thin dividers and control outlines define grouping without decorative card chrome.

### Named Rules

**The One Blue Voice Rule.** Blue is reserved for interaction, selection, and the evidence path; it does not decorate unrelated surfaces.

**The Semantic State Rule.** Teal, rose, and amber communicate positive, negative, and warning meaning only; never use them as general accents.

## Typography

**Display Font:** Native UI fallback stack beginning with Inter when locally available
**Body Font:** The same native UI fallback stack

**Character:** Compact and plainspoken, with large conclusions, restrained section headlines, and small but readable operational metadata. Weight and spacing create hierarchy inside one family stack.

The report is deliberately offline and self-contained. It performs no online font fetch and does not bundle a large CJK or Thai font; instead, the native UI fallback stack covers Chinese, English, Indonesian, and Thai as a reliability and privacy constraint, not as a branded typeface claim.

### Hierarchy

- **Display:** Bold, tightly tracked, balanced hero conclusion with an 18ch maximum line measure.
- **Headline:** Compact section titles with slight negative tracking.
- **Title:** Opportunity and status titles that stay close to body scale.
- **Body:** Default report reading text; hero support copy is capped at a 64ch line measure and evidence copy opens to a 1.72 line-height.
- **Label:** Filters, chips, metadata, table headings, and counts; weight rises only for state and action.

### Named Rules

**The Offline Legibility Rule.** Preserve the complete native multilingual fallback stack and never add a network font dependency to the generated report.

## Layout

Desktop uses a fixed 228px evidence rail and a fluid main work area with horizontal padding capped at 44px. Major content blocks follow a consistent 18px vertical cadence. The hero is a two-column work surface, decision analysis favors a 1.4:0.6 split, and the evidence list keeps a dedicated 180px image rail when images exist.

At 1100px the fixed rail becomes a sticky horizontal navigation bar, filter density drops, and metrics reflow to three columns. At 760px the composition becomes single-column: the hero stacks, metrics become two columns with the final metric spanning the row, secondary filters collapse behind “更多,” evidence metadata moves below product identity, and image evidence becomes a three-column touch grid. Mobile controls use at least 44px targets.

**The Structural Responsive Rule.** Narrow layouts change hierarchy and grouping; they do not merely scale the desktop composition down.

## Elevation & Depth

The system is flat by default. Canvas, surface, raised fill, and 1px borders carry most depth. A low ambient shadow is reserved for the hero and sticky filter workbench; dark mode deepens the same shadow role rather than introducing new layers. The brand mark and active word-mode control use smaller local shadows.

### Shadow Vocabulary

- **Ambient Panel:** `0 12px 32px rgba(37,48,72,.08)` in light mode and `0 16px 38px rgba(0,0,0,.24)` in dark mode; only for high-level work surfaces.
- **Sticky Workbench:** `0 8px 24px rgba(37,48,72,.06)`; separates the pinned filter layer while scrolling.
- **Control Lift:** `0 4px 12px rgba(30,43,70,.07)`; marks the selected keyword mode.

**The Flat-by-Default Rule.** Use tonal layering and structural lines first; elevation is reserved for sticky, selected, or top-level surfaces.

## Shapes

The form language uses gently curved rectangles for controls and evidence containers, a 14px outer section radius, and 7–12px internal radii. Pills are restricted to compact tags, statuses, and removable filters. Circles appear only for the quality status dot. Borders stay one pixel and structural; imagery is clipped to the same control/container family instead of introducing a separate decorative shape language.

**The Radius Hierarchy Rule.** Larger surfaces receive the larger radius; nested controls step down, while only chips and status dots become fully rounded.

## Components

### Buttons

- **Shape:** Compact rounded control with a 9px radius and 42px minimum height; mobile controls rise to 44px.
- **Neutral:** Raised-paper background, muted text, and a structural border; hover darkens the text and border without adding elevation.
- **Text Action:** Transparent background and deep blue text for evidence drill-down.
- **Focus:** A 3px translucent blue outline offset by 2px is shared by all keyboard-focusable controls.

### Chips

- **Style:** Compact 999px pills with 11px semibold labels; neutral chips use a line border, while active filters use selection-blue fill with no border.
- **State:** Positive, negative, target, and warning meanings use only their semantic palette. Every active filter is its own button with a visible × removal affordance and an explicit cancellation label.

### Cards / Containers

- **Corner Style:** 14px for sections and hero surfaces; 12px for evidence, opportunity, breakdown, and word containers.
- **Background:** Paper-white raised items sit inside near-white section surfaces on the cool canvas.
- **Shadow Strategy:** Most containers use no shadow; rely on the elevation rules above.
- **Border:** One-pixel structural lines separate sections, rows, and evidence units.
- **Internal Padding:** Dense controls use 9–13px; evidence items use 18px; section bodies use 22px 24px 26px.

### Inputs / Fields

- **Style:** Raised-paper fill, 1px structural stroke, 9px radius, and 42px minimum height.
- **Focus:** Shared translucent blue focus outline; placeholders use the soft text tier.
- **Responsive:** Secondary fields collapse behind the explicit “更多” control while the search field stays visible.

### Navigation

The 228px desktop rail uses 44px text links, muted default labels, and a subtle neutral hover fill. Below 1100px it becomes a sticky, horizontally scrollable bar; lockup and footer recede so navigation remains the only persistent element.

### Decision-to-Evidence Chain

The decision factor row exposes coverage through a low-profile blue bar. A matrix cell sets product and factor together, the sticky workbench shows each active constraint as an individually removable chip, and the evidence card then leads with the authoritative original-language quote before any Chinese translation sidecar. This chain is the system's one signature interaction and should remain visually continuous.

## Do's and Don'ts

### Do:

- **Do** preserve matrix → removable filters → original-language evidence as one continuous drill-down.
- **Do** use paper-white work surfaces, thin structural borders, and compact type to establish the primary hierarchy.
- **Do** maintain semantic labels, visible focus, reduced-motion behavior, 44px mobile targets, and full light/dark parity.
- **Do** keep review imagery attached to its exact evidence and failure/loading state.

### Don't:

- **Don't** use sample coverage as a market incidence claim or style draft recommendations as verified product facts.
- **Don't** turn the report into a field of elevated cards, decorative gradients, or saturated accent blocks.
- **Don't** hide the active analytical scope; every filter must remain visible and individually removable.
- **Don't** replace original-language evidence with translation, or add external font/image dependencies for decoration.
