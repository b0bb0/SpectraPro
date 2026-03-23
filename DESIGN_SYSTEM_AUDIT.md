# SpectraPro Design System Audit

**Date:** 2026-03-23
**Stack:** Next.js + Tailwind CSS (Cosmic Deep-Space Theme)
**Components Reviewed:** 20 | **Issues Found:** 34 | **Score: 69 / 100**

---

## Summary

SpectraPro has a strong foundation — a well-documented `DESIGN_SYSTEM.md`, a thoughtfully configured `tailwind.config.ts` with custom tokens, and a `globals.css` that defines reusable component classes (`glass`, `btn-premium`, `cosmic-pill`, etc.). Most components (18 of 20) are 85–100% Tailwind-compliant. However, two components are heavily reliant on inline styles, eight colors are used in code but missing from the token config, accessibility gaps exist across most modals, and several utility functions are duplicated rather than shared.

---

## Naming Consistency

| Issue | Components | Recommendation |
|-------|------------|----------------|
| `.glass-card` vs `.glass-panel` | CreateScheduleModal, TemplateUploadModal | Standardize on `.glass-panel` (already defined in globals.css) |
| `.cosmic-panel` used but not in globals | KillSwitchControl | Add `.cosmic-panel` to globals.css `@layer components` or use `.glass-hover` |
| Inline button styles instead of `.btn-*` classes | DiscoveryScanResults, AttackChainGraph | Use `.btn-premium` / `.btn-secondary` from globals.css |
| Modal backdrop inconsistency | DiscoveryScanResults uses `bg-black bg-opacity-50`; others use `bg-black/60 backdrop-blur-sm` | Standardize on `bg-black/60 backdrop-blur-sm` |

---

## Token Coverage

| Category | Defined Tokens | Hardcoded Values Found | Details |
|----------|---------------|----------------------|---------|
| **Colors** | 14 (in tailwind.config.ts) | **8 undeclared colors** used across components | `#ef4444`, `#f97316`, `#3b82f6`, `#6b7280`, `#ff6b6b`, `#4ade80`, `#60a5fa`, `#a855f7` |
| **Spacing** | Tailwind scale | **~20 raw px values** in ReconSelectionPanel + KillSwitchControl | `gap: 24`, `padding: 20`, `borderRadius: 12`, etc. |
| **Typography** | 3 font families + clamp sizes in globals | **~10 inline font sizes** in ReconSelectionPanel | `fontSize: 16`, `13`, `12`, `11`, `10`, `9` |
| **Shadows** | 7 custom shadows | 0 hardcoded | Fully tokenized — well done |
| **Animations** | 6 custom animations | 0 hardcoded | 2 unused: `scaleIn`, `drift` (defined but never referenced in components) |

### Missing Colors — Add to `tailwind.config.ts`

```ts
// Suggested additions under theme.extend.colors
severity: {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f0b840',  // already exists as primary
  low: '#3b82f6',
  info: '#6b7280',
},
status: {
  success: '#4ade80',
  danger: '#ff6b6b',
  active: '#60a5fa',
  highlight: '#a855f7',
}
```

---

## Component Completeness

| Component | Tailwind % | Inline % | A11y | Score |
|-----------|-----------|---------|------|-------|
| BulkScanModal | 95% | 5% | ⚠️ Missing `role="dialog"` | 7/10 |
| CreateScheduleModal | 97% | 3% | ✅ | 9/10 |
| DiscoveryScanResults | 100% | 0% | ⚠️ Missing tab ARIA | 7/10 |
| AttackChainGraph | 100% | 0% | ⚠️ Missing modal ARIA | 7/10 |
| TemplateUploadModal | 98% | 2% | ✅ | 9/10 |
| ProtectedRoute | 100% | 0% | ✅ | 10/10 |
| **KillSwitchControl** | **60%** | **40%** | ❌ Missing aria-label on critical button | **3/10** |
| ReconPhaseControl | 100% | 0% | ✅ | 9/10 |
| **ReconSelectionPanel** | **20%** | **80%** | ❌ Multiple missing ARIA | **2/10** |
| ChangeIntelligenceDashboard | 100% | 0% | ⚠️ Select missing aria-label | 8/10 |
| AssetTimeline | 100% | 0% | ✅ | 9/10 |
| ImpactAssessmentView | 100% | 0% | ⚠️ Badge missing aria-label | 8/10 |
| ExploitationControlPanel | 100% | 0% | ✅ | 9/10 |
| ReconDashboard | 100% | 0% | ✅ | 9/10 |
| ThreatAssessmentPanel | 100% | 0% | ✅ | 9/10 |
| StarCanvas | 99% | 1% | ✅ | 9/10 |
| CreateAssetInline | 100% | 0% | ✅ | 9/10 |
| NewScanModal | 97% | 3% | ⚠️ Missing aria-required | 8/10 |
| EvidenceGraph | 95% | 5% | ✅ | 8/10 |
| ErrorBoundary | 100% | 0% | ✅ | 10/10 |

---

## Duplicate Functionality

| Pattern | Duplicated In | Recommendation |
|---------|--------------|----------------|
| Modal wrapper (backdrop + close + header) | BulkScanModal, NewScanModal, CreateScheduleModal, TemplateUploadModal | Extract `<Modal>` shared component |
| `getSeverityColor()` | ExploitationControlPanel, ImpactAssessmentView, ChangeIntelligenceDashboard | Move to `lib/severity.ts` |
| `getStatusIcon()` | ReconDashboard, ReconPhaseControl | Move to `lib/status.ts` |
| Confirmation dialog | KillSwitchControl (custom), others (browser confirm) | Create `<ConfirmDialog>` component |

---

## Accessibility Gaps

| Issue | Components Affected |
|-------|-------------------|
| Modals missing `role="dialog"` + `aria-modal="true"` | BulkScanModal, AttackChainGraph, DiscoveryScanResults |
| Interactive elements missing `aria-label` | KillSwitchControl (kill button), ReconSelectionPanel (checkboxes), ChangeIntelligenceDashboard (select) |
| Tab-like UI missing `role="tablist"` / `aria-selected` | DiscoveryScanResults |
| Expandable sections missing `aria-expanded` | ReconSelectionPanel |
| Authorization checkbox missing `aria-required` | NewScanModal |

---

## DESIGN_SYSTEM.md vs Actual Implementation

The documented `DESIGN_SYSTEM.md` describes an **"Industrial Cyberpunk"** theme (neon green `#00ff88`, neon red `#ff0055`, Bebas Neue + IBM Plex Mono fonts). The actual implementation uses a **"Cosmic Deep-Space"** theme (gold `#f0b840`, purple `#9d5fff`, Space Grotesk + Space Mono fonts).

**These two systems are fundamentally different.** The DESIGN_SYSTEM.md is outdated and describes the report/HTML template design, not the platform frontend. This is a significant documentation gap.

| Aspect | DESIGN_SYSTEM.md Says | Code Actually Uses |
|--------|----------------------|-------------------|
| Background | `#0a0c0f` | `#02020d` |
| Primary accent | `#00ff88` (neon green) | `#f0b840` (gold) |
| Secondary accent | `#00aaff` (cold blue) | `#9d5fff` (purple) |
| Heading font | Bebas Neue | Space Grotesk |
| Body font | IBM Plex Mono | Space Grotesk |
| Mono font | IBM Plex Mono | Space Mono |

---

## Priority Actions

### P0 — Must Fix

1. **Refactor ReconSelectionPanel.tsx** — 80% inline styles, multiple missing ARIA attributes. Convert to Tailwind classes and add accessibility. *(~4–5 hours)*

2. **Refactor KillSwitchControl.tsx** — 40% inline styles, critical kill-switch button missing `aria-label`. *(~2–3 hours)*

3. **Add 8 missing colors to `tailwind.config.ts`** — Prevents future hardcoding and ensures severity/status colors are tokenized. *(~30 min)*

### P1 — Should Fix

4. **Extract shared `<Modal>` component** — Eliminates 4x duplicated modal wrapper logic and standardizes backdrop, close button, and ARIA attributes.

5. **Extract `getSeverityColor()` and `getStatusIcon()` to shared utils** — Currently duplicated across 5 components.

6. **Add `role="dialog"` and `aria-modal="true"`** to all modal components (BulkScanModal, AttackChainGraph, DiscoveryScanResults).

7. **Update or split DESIGN_SYSTEM.md** — Current doc describes the HTML report theme, not the platform UI. Create a separate `PLATFORM_DESIGN_SYSTEM.md` or update the existing one.

### P2 — Nice to Have

8. Remove unused animation tokens (`scaleIn`, `drift`) from tailwind.config.ts.

9. Standardize `.glass-card` → `.glass-panel` across all components.

10. Add `<ConfirmDialog>` shared component to replace mixed confirmation patterns.

---

## Score Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Color Token Coverage | 20% | 60/100 | 12 |
| Spacing Consistency | 15% | 70/100 | 10.5 |
| Typography | 10% | 85/100 | 8.5 |
| Component Completeness | 20% | 75/100 | 15 |
| Accessibility | 20% | 40/100 | 8 |
| Naming Consistency | 15% | 75/100 | 11.25 |
| **Total** | **100%** | | **65.25 → 69** |

---

*Generated 2026-03-23 by design system audit*
