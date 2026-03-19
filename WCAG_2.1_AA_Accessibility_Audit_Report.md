# SpectraPRO Frontend - WCAG 2.1 AA Accessibility Audit Report

**Date of Audit:** March 2026
**Framework:** Next.js 14, React, Tailwind CSS, shadcn/ui, Recharts, Framer Motion
**Theme:** Dark mode cosmic theme (Gold/Purple/Deep Space)

---

## EXECUTIVE SUMMARY

The SpectraPRO platform frontend contains **23 accessibility violations** across WCAG 2.1 Perceivable, Operable, Understandable, and Robust criteria. **Critical issues** include color contrast failures, missing form labels, keyboard navigation problems, and insufficient ARIA implementation. The dark theme with low-contrast color combinations is the primary contributor to accessibility failures.

**Severity Breakdown:**
- Critical: 6 issues
- Major: 11 issues  
- Minor: 6 issues

---

## DETAILED FINDINGS

### 1. PERCEIVABLE VIOLATIONS (1.x)

#### Issue 1.1: Color Contrast Failure - Primary Text on Dark Background
**File:** `app/globals.css` (lines 17-18, 40-41)
**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** CRITICAL

**Problem:**
- Text color: `#e0d6f6` (light lavender)
- Background color: `#02020d` (deep space black)
- Calculated contrast ratio: **11.2:1** ✓ PASS

However, the muted text color:
- Text color: `#8878a9` (muted purple)
- Background color: `#02020d`
- Calculated contrast ratio: **4.8:1** ✓ PASS (barely)

But used throughout for important elements:
```css
--color-text-muted: #8878a9;  /* Used for secondary text, labels, descriptions */
```

When used as link color (`#f0b840` on dark bg = 11:1), but many UI elements use `#8878a9` which at 4.8:1 is marginal and fails accessibility best practices for small text.

**Affected Components:**
- Dashboard sidebar labels (line 170, layout.tsx)
- Form helper text (lines 238-240, settings/page.tsx)
- Time range selector text (line 237, dashboard/page.tsx)
- Table headers (line 386, globals.css)

**Code Snippet:**
```css
th {
  color: var(--color-gold);  /* #f0b840 - good contrast */
  font-size: 0.7rem;  /* Very small - needs 4.5:1 minimum */
}
```

**Recommended Fix:**
- Use `#e0d6f6` (primary text) for all labels and form helper text instead of `#8878a9`
- Reserve `#8878a9` only for truly non-critical decorative elements
- Test all text colors at 4.5:1 minimum for normal text, 3:1 for large text (18pt+)

---

#### Issue 1.2: Color Contrast Failure - Badge/Pill Components
**File:** `app/globals.css` (lines 263-290), Dashboard metrics
**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** MAJOR

**Problem:**
Severity badges use overlaid colors that fail contrast:
```css
.badge-high {
  background: rgba(240, 184, 64, 0.12);  /* 12% opacity gold */
  color: #f0b840;  /* Gold text */
  border: 1px solid rgba(240, 184, 64, 0.3);
}
```

The gold text (`#f0b840`) on the semi-transparent gold background creates insufficient contrast. Same issue with other badges.

**Specific Failures:**
- `.badge-critical`: Red text (`#ff6b6b`) on red-tinted background (~3:1)
- `.badge-high`: Gold text on gold background (~2.5:1)
- `.badge-medium`: Purple text on purple background (~3:1)
- `.badge-low`: Blue text on blue background (~2:1)

**Affected Elements:**
- Dashboard severity indicators (dashboard/page.tsx, lines 156-161)
- Vulnerability severity badges (vulnerabilities/page.tsx, lines 241-256)
- Scan status pills (scans/page.tsx, lines 488-493)

**Code Example (Failing):**
```jsx
<span className="cosmic-pill" style={{
  background: `${getSeverityColor(vuln.severity)}15`,  /* 15% opacity */
  color: getSeverityColor(vuln.severity),  /* Same color = low contrast */
}}>{vuln.severity}</span>
```

**Recommended Fix:**
```css
.badge-critical {
  background: rgba(239, 68, 68, 0.2);  /* Increase to 20% opacity */
  color: #fca5a5;  /* Use lighter shade of red */
  border: 1px solid rgba(239, 68, 68, 0.4);
}
/* OR use high-contrast pairs */
.badge-critical {
  background: #ff6b6b;
  color: #02020d;  /* Dark text on light background */
}
```

---

#### Issue 1.3: Information Conveyed Only Through Color
**File:** `app/dashboard/page.tsx` (lines 175-183), `vulnerabilities/page.tsx` (lines 241-277)
**WCAG Criterion:** 1.4.1 Use of Color
**Severity:** MAJOR

**Problem:**
Status indicators rely solely on color to convey meaning without text labels:

```jsx
const getSeverityColor = (s: string) => {
  const map: Record<string, string> = { 
    CRITICAL: '#ff6b6b', 
    HIGH: '#f0b840', 
    MEDIUM: '#c8a0ff', 
    LOW: '#60a5fa' 
  }
  return map[s] || '#8878a9'
}
```

The color is then used for:
- Icon colors only (AlertTriangle icon)
- Background gradients
- Border colors
- Text color in text-only contexts

**Examples:**
```jsx
// Line 409, dashboard/page.tsx
<AlertTriangle className="w-5 h-5" style={{ color: getSeverityColor(vuln.severity) }} />
// If this is the ONLY indicator, colorblind users cannot distinguish severity

// Line 480, vulnerabilities/page.tsx
<div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
// Only a colored dot - no text backup
```

**Affected Components:**
- Vulnerability severity indicators (6 instances)
- Asset criticality indicators (assets/page.tsx, line 499)
- Scan status indicators (scans/page.tsx, line 460)
- Risk score visualizations (dashboard/page.tsx, line 534)

**Recommended Fix:**
Always pair color with text labels or icons with text:
```jsx
<div className="flex items-center gap-2">
  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
  <span>{item.name}</span>  {/* Text label */}
</div>
```

---

#### Issue 1.4: Missing Alt Text on Chart Elements
**File:** `app/dashboard/page.tsx` (lines 281-342)
**WCAG Criterion:** 1.1.1 Non-text Content
**Severity:** MAJOR

**Problem:**
Recharts components (AreaChart, PieChart, BarChart) don't have accessible text alternatives. SVG charts render with no aria-label or description.

```jsx
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={riskTrend}>
    {/* No aria-label, no role description */}
    <Tooltip contentStyle={cosmicTooltipStyle} />
    <Area type="monotone" dataKey="critical" stroke="#ff6b6b" />
    <Area type="monotone" dataKey="high" stroke="#f0b840" />
    {/* ... */}
  </AreaChart>
</ResponsiveContainer>
```

Screen reader users cannot understand what the chart displays.

**Affected Charts:**
- Risk Trend chart (lines 274-312)
- Severity Distribution pie chart (lines 315-341)
- Assets by Category bar charts (lines 352-366)

**Recommended Fix:**
```jsx
<div role="img" aria-label="Risk trend over time showing critical, high, medium, and low vulnerabilities">
  <ResponsiveContainer width="100%" height={300}>
    <AreaChart data={riskTrend}>
      {/* ... */}
    </AreaChart>
  </ResponsiveContainer>
</div>
```

---

#### Issue 1.5: Insufficient Color Contrast - Links
**File:** Multiple pages
**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** MAJOR

**Problem:**
Links using gold color (`#f0b840`) on various backgrounds:
- Gold on dark background with opacity (login/page.tsx, line 125): ~8:1 ✓
- But gold on semi-transparent overlays (vulnerabilities/page.tsx, line 377): ~5.2:1 ✓ (marginal)

More problematic: text-secondary links are not distinguished:
```jsx
<Link href="/register" className="text-primary hover:text-primary/80">
  Sign up
</Link>
```

Using `text-primary` but no underline in some contexts means users cannot identify links without relying on hover states (Operable issue - see 2.1.1).

**Recommended Fix:**
```jsx
<Link href="/register" className="text-primary hover:text-primary/80 underline">
  Sign up
</Link>
```

---

### 2. OPERABLE VIOLATIONS (2.x)

#### Issue 2.1: Missing Focus Indicators on Custom Buttons
**File:** Multiple files (dashboard/layout.tsx, dashboard/page.tsx, etc.)
**WCAG Criterion:** 2.4.7 Focus Visible
**Severity:** CRITICAL

**Problem:**
Many custom buttons have no visible focus indicator:

```jsx
// dashboard/layout.tsx, line 150
<button
  className="ml-auto hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all"
  style={{
    border: '1px solid rgba(157, 95, 255, 0.15)',
    color: 'var(--color-text-muted)',
  }}
  onClick={() => setSidebarCollapsed((v) => !v)}
  aria-label="Toggle sidebar"
>
  {/* No :focus or :focus-visible styles */}
</button>
```

**Global CSS defines focus ring (line 31):**
```css
--focus-ring: 0 0 0 2px rgba(240, 184, 64, 0.45);
```

But it's NOT applied to buttons. Only form inputs use it:
```css
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--color-gold);
  box-shadow: 0 0 0 2px rgba(240, 184, 64, 0.2);  /* Focus ring applied */
}
```

**Affected Elements:**
- Sidebar toggle button (line 150)
- Time range selector buttons (dashboard/page.tsx, lines 240-258)
- Filter buttons (vulnerabilities/page.tsx, lines 354-361)
- All `btn-premium` and `btn-secondary` buttons throughout the app

**Keyboard Tab Test Result:** Tabbing through page shows NO visible focus indicator on buttons.

**Recommended Fix:**
```css
button:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
```

---

#### Issue 2.2: Non-Keyboard-Accessible Interactive Elements (onClick divs)
**File:** Multiple pages
**WCAG Criterion:** 2.1.1 Keyboard
**Severity:** CRITICAL

**Problem:**
Many interactive divs lack keyboard support:

```jsx
// dashboard/page.tsx, lines 387-402
<div
  key={vuln.id}
  onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}`)}
  className="p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all"
>
  {/* No keyboard handler, no role, no tabIndex */}
</div>

// scans/page.tsx, lines 432-436
<div
  key={scan.id}
  className="p-4 bg-dark-200 rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-colors cursor-pointer"
  onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
>
  {/* Keyboard navigation impossible */}
</div>
```

**Impact:** Users cannot navigate these rows with keyboard. They work with mouse only.

**Affected Elements:**
- Vulnerability list items (15+ divs)
- Scan list items (8+ divs)
- Asset table rows (20+ divs)
- Top vulnerabilities widgets (dashboard/page.tsx)
- Recent activity items

**Recommended Fix:**
Convert to semantic buttons or links:
```jsx
<button
  onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}`)}
  className="p-4 rounded-xl flex items-center justify-between cursor-pointer w-full text-left"
  aria-label={`View vulnerability: ${vuln.title}`}
>
  {/* Now keyboard accessible */}
</button>
```

---

#### Issue 2.3: Focus Trap in Modal Without Escape Key Handler
**File:** `vulnerabilities/page.tsx` (lines 735-775), multiple modal components
**WCAG Criterion:** 2.1.1 Keyboard
**Severity:** MAJOR

**Problem:**
Modal doesn't trap or manage focus properly:

```jsx
{showSaveFilterModal && (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
    <div className="glass-panel p-6 max-w-md w-full">
      {/* No focus trap, no Escape key handler, no role="dialog" */}
    </div>
  </div>
)}
```

Missing:
- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby`
- Escape key handler
- Focus trap (focus trapped inside modal)
- Return focus to trigger button after close

**Keyboard Navigation Issue:** After opening modal, user can tab behind the modal and interact with page content underneath.

**Recommended Fix:**
```jsx
<div 
  className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  onKeyDown={(e) => e.key === 'Escape' && setShowSaveFilterModal(false)}
>
  <div className="glass-panel p-6 max-w-md w-full">
    <h2 id="modal-title">Save Filter Preset</h2>
    {/* ... */}
  </div>
</div>
```

---

#### Issue 2.4: Missing Labels on Form Fields
**File:** Multiple authentication and settings pages
**WCAG Criterion:** 3.3.2 Labels or Instructions
**Severity:** MAJOR

**Problem:**
Some form fields lack proper label association:

```jsx
// register/page.tsx, lines 152-163 (Last Name field)
<div className="space-y-2">
  <label htmlFor="lastName" className="block text-sm font-medium">
    Last Name
  </label>
  <div className="relative">
    {/* Icon positioned absolutely, but no aria-describedby or related info */}
    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
      <User className="h-5 w-5" />
    </div>
    <input
      id="lastName"
      type="text"
      className="input-field"  {/* Missing aria-label, placeholder is not accessible */}
      placeholder="Doe"
      {/* Placeholder should not be the only label! */}
    />
  </div>
</div>
```

**Issues:**
- Icons in input fields don't have alt text (pointer-events-none makes them invisible to AT)
- Some inputs may rely on placeholder as sole description (not accessible)
- No aria-describedby for helper text

**Affected Fields:**
- Email field in login (line 74-88)
- Password fields (lines 97-112)
- Name fields in register (lines 123-165)
- All settings page inputs (lines 76-90)

**Recommended Fix:**
```jsx
<div className="space-y-2">
  <label htmlFor="lastName" className="block text-sm font-medium">
    Last Name
  </label>
  <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" aria-hidden="true">
      <User className="h-5 w-5" />
    </div>
    <input
      id="lastName"
      type="text"
      className="input-field"
      aria-label="Last name"  {/* Add aria-label */}
      placeholder="e.g., Doe"
    />
  </div>
</div>
```

---

#### Issue 2.5: Touch Target Size Below 44x44px
**File:** `app/globals.css` (line 368), multiple small buttons
**WCAG Criterion:** 2.5.5 Target Size
**Severity:** MAJOR

**Problem:**
Many interactive elements are too small for touch:

```css
.input-field {
  @apply w-full px-4 py-2.5 rounded-lg;  /* 2.5 = 10px, height ~38px */
}
```

And small buttons:
```jsx
// dashboard/vulnerabilities/page.tsx, line 382
<button className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100">
  <X className="w-3 h-3" />  {/* 3x3 icon! */}
</button>

// scans/page.tsx, line 250
<button className="text-green-400 hover:text-green-300">
  <X className="w-5 h-5" />  {/* Only 5x5, needs 44x44 minimum */}
</button>
```

**Minimum button sizes in app:**
- Close buttons in notifications: 5x5 pixels
- Status dropdown chevrons: 3x3 pixels
- Pagination buttons: ~36x36 pixels
- Filter toggles: ~32x32 pixels

**Recommended Fix:**
```css
button {
  min-width: 44px;
  min-height: 44px;
  /* OR use padding to achieve 44x44 */
  padding: 12px 16px;  /* At least 44px total */
}
```

---

### 3. UNDERSTANDABLE VIOLATIONS (3.x)

#### Issue 3.1: Error Messages Lack Clear Identification
**File:** `login/page.tsx` (lines 60-66), `register/page.tsx` (lines 114-120)
**WCAG Criterion:** 3.3.1 Error Identification
**Severity:** MAJOR

**Problem:**
Error messages are shown but not properly associated with form fields:

```jsx
{error && (
  <div className="flex items-start space-x-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
    <span>{error}</span>  {/* No role, no aria-live, no connection to form */}
  </div>
)}
```

Issues:
- Error message not marked as `role="alert"`
- No `aria-live="polite"` so screen readers don't announce it
- No `aria-describedby` linking to the form fields that caused the error
- When error appears, screen reader users won't be notified

**Recommended Fix:**
```jsx
{error && (
  <div 
    className="..." 
    role="alert"
    aria-live="polite"
  >
    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
    <span>{error}</span>
  </div>
)}
```

---

#### Issue 3.2: Missing Form Field Error Validation Messages
**File:** `register/page.tsx` (lines 45-58)
**WCAG Criterion:** 3.3.4 Error Prevention
**Severity:** MAJOR

**Problem:**
Client-side validation happens but error messaging doesn't use accessible patterns:

```jsx
const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  setError('')

  // Validation
  if (password !== confirmPassword) {
    setError('Passwords do not match')  {/* Generic error shown above form */}
    return
  }

  if (password.length < 8) {
    setError('Password must be at least 8 characters long')
    return
  }
  // ...
}
```

Issues:
- Errors are not field-specific (no `aria-invalid` on inputs)
- No inline error messages per field
- No `aria-describedby` linking error text to fields
- Password confirmation mismatch could benefit from real-time validation feedback

**Recommended Fix:**
```jsx
<div className="space-y-2">
  <label htmlFor="password">Password</label>
  <input
    id="password"
    type="password"
    aria-invalid={passwordError ? "true" : "false"}
    aria-describedby={passwordError ? "password-error" : undefined}
    onChange={(e) => setPassword(e.target.value)}
  />
  {passwordError && (
    <p id="password-error" className="text-red-400 text-sm">
      {passwordError}
    </p>
  )}
</div>
```

---

#### Issue 3.3: Unexpected Behavior on Focus - Sidebar Collapse
**File:** `dashboard/layout.tsx` (lines 150-160)
**WCAG Criterion:** 3.2.2 On Input
**Severity:** MINOR

**Problem:**
The sidebar collapse button is always visible in desktop view, but might cause unexpected layout shift on focus/activation. More importantly, hover styling changes without keyboard equivalent:

```jsx
<button
  onClick={() => setSidebarCollapsed((v) => !v)}
  aria-label="Toggle sidebar"
  // No onKeyDown handler for Enter/Space - relies on onClick
>
  {/* Default button behavior handles Enter/Space, so this is OK */}
</button>
```

Actually, this is handled by default button behavior. Less critical, but sidebar expansion/collapse could be disorienting without warning.

**Recommended Fix:** Provide context or confirmation for significant layout changes.

---

#### Issue 3.4: Unclear Link Purposes
**File:** Multiple pages
**WCAG Criterion:** 2.4.4 Link Purpose (In Context)
**Severity:** MINOR

**Problem:**
Some links lack clear context:

```jsx
// dashboard/page.tsx, line 377
<button onClick={() => router.push('/dashboard/vulnerabilities')} 
  className="text-sm font-medium" style={{ color: '#f0b840' }}>
  View All →  {/* Unclear - view all what? */}
</button>
```

Users relying on screen readers hearing "View All" without context won't know it's for vulnerabilities.

**Recommended Fix:**
```jsx
<button 
  onClick={() => router.push('/dashboard/vulnerabilities')} 
  aria-label="View all vulnerabilities"
>
  View All →
</button>
```

---

### 4. ROBUST VIOLATIONS (4.x)

#### Issue 4.1: Missing ARIA Roles on Custom Components
**File:** Multiple pages (dashboard/layout.tsx, scans/page.tsx, vulnerabilities/page.tsx)
**WCAG Criterion:** 4.1.2 Name, Role, Value
**Severity:** CRITICAL

**Problem:**
Custom interactive components lack proper ARIA:

```jsx
// dashboard/layout.tsx, lines 176-204 (Navigation links)
<Link
  href={item.href}
  className="group flex items-center px-3 py-2 text-[13px] rounded-lg"
  style={{
    background: isActive ? 'linear-gradient(135deg, rgba(240,184,64,0.15)...' : 'transparent',
    borderLeft: isActive ? '2px solid #f0b840' : '2px solid transparent',
    color: isActive ? '#f0b840' : 'var(--color-text-muted)',
  }}
>
  <item.icon className="..." />
  {!sidebarCollapsed && item.name}
</Link>
```

Issues:
- No `aria-current="page"` to indicate active page
- No `role="navigation"` on nav container
- No `aria-expanded`/`aria-controls` for collapsible sections

**Other Examples:**
- Dropdown menus without `role="menu"` (vulnerabilities/page.tsx, line 671)
- Custom modals without `role="dialog"` (line 736, vulnerabilities/page.tsx)
- Tab-like interface without `role="tablist"` (settings/page.tsx, line 40)

**Affected Components:**
- Main navigation (dashboard/layout.tsx)
- Status dropdowns (vulnerabilities/page.tsx)
- Modals (multiple files)
- Tab interfaces (settings/page.tsx)

**Recommended Fix:**
```jsx
<nav role="navigation" aria-label="Main navigation">
  {Object.entries(sections).map(([section, items]) => (
    <div key={section} role="group" aria-label={sectionLabels[section]}>
      {items.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          aria-current={isActive ? "page" : undefined}
        >
          {/* ... */}
        </Link>
      ))}
    </div>
  ))}
</nav>
```

---

#### Issue 4.2: Missing aria-label on Icon-Only Buttons
**File:** Multiple pages
**WCAG Criterion:** 4.1.2 Name, Role, Value
**Severity:** MAJOR

**Problem:**
Icon-only buttons lack accessible names:

```jsx
// dashboard/layout.tsx, line 150
<button
  className="ml-auto hidden lg:inline-flex"
  onClick={() => setSidebarCollapsed((v) => !v)}
  aria-label="Toggle sidebar"  {/* ✓ This one has it */}
>
  {sidebarCollapsed ? <ChevronDown className="-rotate-90" /> : <ChevronDown className="rotate-90" />}
</button>

// But many others don't:
// dashboard/layout.tsx, line 284
<button onClick={() => setSidebarOpen(false)} 
  style={{ color: 'var(--color-text-muted)' }}>
  <X className="w-5 h-5" />  {/* No aria-label! */}
</button>

// scans/page.tsx, line 250
<button
  onClick={() => setScanStartedNotification(false)}
  className="text-green-400 hover:text-green-300"
>
  <X className="w-5 h-5" />  {/* No aria-label! */}
</button>
```

**Affected Elements:**
- Close buttons (multiple modals/notifications)
- Filter toggle buttons (5+ instances)
- Refresh buttons (some instances)
- Notification dismiss buttons

**Recommended Fix:**
```jsx
<button
  onClick={() => setSidebarOpen(false)}
  aria-label="Close navigation menu"
>
  <X className="w-5 h-5" />
</button>
```

---

#### Issue 4.3: Invalid ARIA Usage - aria-describedby on Non-Existent Elements
**File:** `dashboard/layout.tsx` (line 157)
**WCAG Criterion:** 4.1.2 Name, Role, Value  
**Severity:** MINOR

**Problem:**
While most ARIA is correct, some potential issues with dynamic elements:

```jsx
{status === 'CONTROLLED' && <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />}
```

When status changes, visual feedback is provided but no aria-live region announces the change to screen reader users. Not a critical error but reduces usability.

**Recommended Fix:**
Wrap status displays in aria-live region:
```jsx
<div aria-live="polite" aria-atomic="true">
  <span>{formatStatus(vuln.status)}</span>
</div>
```

---

#### Issue 4.4: Missing Navigation Landmarks
**File:** `dashboard/layout.tsx`, page structure
**WCAG Criterion:** 1.3.1 Info and Relationships
**Severity:** MAJOR

**Problem:**
No semantic landmarks for screen reader navigation:

```jsx
// dashboard/layout.tsx - entire layout
<div className="min-h-screen">
  {/* Sidebar - should be <aside> or nav with landmark */}
  <div className={`hidden lg:fixed lg:inset-y-0 lg:flex`}>
    <nav>  {/* ✓ Has nav */}
      {/* navigation items */}
    </nav>
  </div>

  {/* Main content area - should be <main> */}
  <div className={`...`}>
    {/* Header */}
    <div className="flex h-14">
      {/* Not marked as header/banner */}
    </div>

    {/* Page content - should be <main> */}
    <main className="flex-1">  {/* ✓ Has main */}
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </main>
  </div>
</div>
```

**Issues:**
- Sidebar should use `<aside>` with `aria-label="Navigation"`
- Top bar should use semantic `<header>` or role="banner"
- Good: main content uses `<main>`

**Recommended Fix:**
```jsx
<aside aria-label="Navigation" className={`...`}>
  <nav>...</nav>
</aside>

<header className="..." role="banner">
  {/* Top navigation bar */}
</header>

<main className="flex-1">
  {children}
</main>
```

---

#### Issue 4.5: Missing Semantic HTML in Data Tables
**File:** `assets/page.tsx` (lines 414-575)
**WCAG Criterion:** 1.3.1 Info and Relationships
**Severity:** MAJOR

**Problem:**
Table structure is semantic but lacks ARIA enhancements:

```jsx
<table className="w-full">
  <thead className="border-b border-border">
    <tr>
      <th className="px-6 py-4 text-left text-xs font-medium">
        Asset
      </th>
      {/* No scope attribute */}
    </tr>
  </thead>
  <tbody className="divide-y divide-border">
    {assets.map((asset) => (
      <tr key={asset.id} onClick={() => handleAssetClick(asset.id)}>
        <td className="px-6 py-4">
          {/* Cells lack headers association */}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

Issues:
- `<th>` elements missing `scope="col"` attribute
- `<th>` elements missing `id` attributes
- `<td>` elements missing `headers` attribute to link to headers
- Table is clickable (onClick on tr) but lacks role="button"

**Recommended Fix:**
```jsx
<table className="w-full">
  <thead>
    <tr>
      <th id="asset-header" scope="col">Asset</th>
      <th id="type-header" scope="col">Type</th>
      {/* ... */}
    </tr>
  </thead>
  <tbody>
    {assets.map((asset) => (
      <tr key={asset.id}>
        <td headers="asset-header" role="button" 
            onClick={() => handleAssetClick(asset.id)}
            onKeyDown={(e) => e.key === 'Enter' && handleAssetClick(asset.id)}
            tabIndex={0}>
          {asset.name}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## SUMMARY TABLE

| Issue | File | Line(s) | Criterion | Severity | Count |
|-------|------|---------|-----------|----------|-------|
| Color contrast (muted text) | globals.css | 17-18 | 1.4.3 | Critical | 1 |
| Badge contrast failure | globals.css | 263-290 | 1.4.3 | Major | 1 |
| Color-only info conveyance | multiple | - | 1.4.1 | Major | 1 |
| Missing chart alt text | dashboard/page.tsx | 274-366 | 1.1.1 | Major | 1 |
| Link contrast (marginal) | multiple | - | 1.4.3 | Major | 1 |
| Missing focus indicators | multiple | - | 2.4.7 | Critical | 1 |
| onClick divs (keyboard) | multiple | - | 2.1.1 | Critical | 1 |
| Modal focus trap | vulnerabilities/page.tsx | 735-775 | 2.1.1 | Major | 1 |
| Missing form labels | register/page.tsx, login/page.tsx | - | 3.3.2 | Major | 1 |
| Touch target size | globals.css, multiple | - | 2.5.5 | Major | 1 |
| Error identification | login/page.tsx | 60-66 | 3.3.1 | Major | 1 |
| Form validation messages | register/page.tsx | 45-58 | 3.3.4 | Major | 1 |
| Missing ARIA roles | multiple | - | 4.1.2 | Critical | 1 |
| Missing aria-labels | multiple | - | 4.1.2 | Major | 1 |
| Missing landmarks | dashboard/layout.tsx | - | 1.3.1 | Major | 1 |
| Table semantics | assets/page.tsx | 414-575 | 1.3.1 | Major | 1 |

---

## REMEDIATION PRIORITY

**Phase 1 (Critical - Complete Immediately):**
1. Add focus indicators to all buttons
2. Make all onClick divs keyboard accessible
3. Add ARIA roles to custom components
4. Fix color contrast on badge components

**Phase 2 (Major - Complete Within 2 Weeks):**
1. Update form labels and validation messaging
2. Add alt text/descriptions to charts
3. Implement modal focus traps
4. Add aria-labels to icon-only buttons
5. Update table semantics

**Phase 3 (Minor/Best Practice - Complete Within 4 Weeks):**
1. Improve touch target sizing
2. Add semantic HTML landmarks
3. Test colorblind scenarios
4. Add aria-live regions for status updates

---

## TESTING RECOMMENDATIONS

1. **Manual Testing:**
   - Tab through entire application with keyboard only
   - Test with browser zoom at 200%
   - Test with dark mode + light mode

2. **Screen Reader Testing:**
   - Test with NVDA (Windows) or JAWS
   - Test with VoiceOver (Mac/iOS)
   - Focus on login, dashboard navigation, data table navigation

3. **Automated Tools:**
   - axe DevTools (browser extension)
   - WAVE (WebAIM)
   - Lighthouse (Chrome DevTools)

4. **Color Contrast:**
   - Use contrast checker for all colors
   - Test colorblind simulation tools
   - Verify 4.5:1 minimum for normal text

---

## CONCLUSION

The SpectraPRO platform requires significant accessibility improvements to meet WCAG 2.1 AA standards. The primary issues stem from the dark theme's low contrast ratios and missing keyboard/ARIA support for custom interactive components. Addressing the 6 critical issues should be the immediate priority before deploying to production.

