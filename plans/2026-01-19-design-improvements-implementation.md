# Sequoia Garden Design Improvements - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform sequoia.garden from a calendar-dominated page into a solar-powered blog showcase worthy of replacing sequoiafabrica.org.

**Architecture:** Hugo static site with SCSS styling, vanilla JS components for power monitoring. Changes are primarily CSS/HTML template modifications with some JS component enhancements. No backend changes.

**Tech Stack:** Hugo (Go templates), SCSS, Vanilla JavaScript, existing power-monitor.js components

---

## Phase 1: CSS Foundation

### Task 1.1: Add CSS Variables for Spacing and Max-Widths

**Files:**
- Modify: `assets/css/style.scss` (or `resources/css/style.scss` depending on Hugo setup)

**Step 1: Locate the CSS source file**

Run: `find . -name "style.scss" -o -name "style.css" | grep -v public | grep -v built-site`

Note the path for subsequent steps.

**Step 2: Add new CSS variables to :root**

Add after existing variables (around line 35):

```scss
:root {
  /* ... existing variables ... */

  /* New spacing variables */
  --max-text-width: 65ch;
  --section-gap: 3rem;
  --card-padding: 1.5rem;
  --card-gap: 1rem;

  /* Status bar */
  --status-bar-height: 2.5rem;
  --status-bar-bg: var(--color-bg2);
}
```

**Step 3: Build and verify**

Run: `make build` or `hugo build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(css): add spacing and layout CSS variables"
```

---

### Task 1.2: Constrain Body Text Line Width

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Add max-width constraint to article content**

Find the `.article` or `.entry-content` selector and add:

```scss
.entry-content,
.article-body {
  max-width: var(--max-text-width);
}

/* Ensure images can still be full width */
.entry-content img,
.entry-content figure {
  max-width: 100%;
}
```

**Step 2: Build and verify**

Run: `make serve`
Expected: Visit http://localhost:1313/about/ - text should be narrower, more readable

**Step 3: Visual check**

Open browser, navigate to /about and /membership pages. Text lines should be ~65 characters wide.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(css): constrain body text to 65ch for readability"
```

---

### Task 1.3: Improve Header Typography Contrast

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Update heading styles**

Find existing h1-h6 styles and update:

```scss
h1 {
  font-size: 2.2rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

h2 {
  font-size: 1.6rem;
  font-weight: bold;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  border-bottom: 2px solid var(--color-icons-lines);
  padding-bottom: 0.25rem;
}

h3 {
  font-size: 1.3rem;
  font-weight: bold;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
```

**Step 2: Build and verify**

Run: `make serve`
Expected: Headers visually stand out more from body text

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(css): improve header typography contrast"
```

---

### Task 1.4: Create Card Component CSS

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Add card component styles**

```scss
/* Card Component */
.card {
  background: var(--color-bg);
  border: 2px solid var(--color-icons-lines);
  padding: var(--card-padding);
  margin-bottom: var(--card-gap);
}

.card-header {
  font-weight: bold;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  font-size: var(--font-small);
  color: var(--color-sub);
}

.card-value {
  font-size: var(--font-xlarge);
  margin-bottom: 0.25rem;
}

.card-label {
  font-size: var(--font-small);
  color: var(--color-sub);
}

/* Card grid for dashboard */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--card-gap);
  margin: var(--pad-large) 0;
}

@media (max-width: 550px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
```

**Step 2: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(css): add card component styles"
```

---

## Phase 2: Homepage Redesign

### Task 2.1: Create Hero Section Partial

**Files:**
- Create: `layouts/partials/hero-solar.html`

**Step 1: Create the hero partial**

```html
<section class="hero-solar">
  <div class="hero-content">
    <div class="hero-gauge" id="hero-gauge">
      <div class="gauge-icon" id="hero-charge-icon">
        <!-- Populated by JS -->
      </div>
      <div class="gauge-value" id="hero-battery-level">--</div>
      <div class="gauge-label" id="hero-battery-status">Loading...</div>
    </div>
    <div class="hero-text">
      <h1 class="hero-headline">This website runs on sunshine.</h1>
      <p class="hero-subhead">
        A solar-powered blog from
        <a href="https://sequoiafabrica.org">Sequoia Fabrica Makerspace</a>—a
        community workshop in San Francisco.
      </p>
      <div class="hero-ctas">
        <a href="/about" class="btn btn-primary">About the Space</a>
        <a href="/posts" class="btn btn-secondary">Read the Blog</a>
        <a href="/power" class="btn btn-secondary">Power Dashboard</a>
      </div>
    </div>
  </div>
</section>
```

**Step 2: Build and verify file exists**

Run: `ls -la layouts/partials/hero-solar.html`
Expected: File exists

**Step 3: Commit**

```bash
git add layouts/partials/hero-solar.html
git commit -m "feat(templates): create hero-solar partial"
```

---

### Task 2.2: Add Hero Section CSS

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Add hero section styles**

```scss
/* Hero Section */
.hero-solar {
  padding: var(--pad-xlarge) 0;
  margin-bottom: var(--pad-large);
  border-bottom: 2px solid var(--color-icons-lines);
}

.hero-content {
  display: flex;
  align-items: center;
  gap: var(--pad-xlarge);
  max-width: var(--max-content-width);
}

.hero-gauge {
  flex-shrink: 0;
  width: 150px;
  height: 150px;
  border: 3px solid var(--color-icons-lines);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg2);
}

.gauge-icon {
  font-size: 1.5rem;
}

.gauge-value {
  font-size: 2rem;
  font-weight: bold;
}

.gauge-label {
  font-size: var(--font-small);
  color: var(--color-sub);
}

.hero-headline {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  border-bottom: none;
}

.hero-subhead {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  max-width: 50ch;
}

.hero-ctas {
  display: flex;
  gap: var(--pad);
  flex-wrap: wrap;
}

/* Button styles */
.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border: 2px solid var(--color-primary);
  text-decoration: none;
  font-family: inherit;
}

.btn-primary {
  background: var(--color-primary);
  color: var(--color-bg);
}

.btn-secondary {
  background: transparent;
  color: var(--color-primary);
}

.btn:hover {
  opacity: 0.8;
}

@media (max-width: 700px) {
  .hero-content {
    flex-direction: column;
    text-align: center;
  }

  .hero-ctas {
    justify-content: center;
  }
}
```

**Step 2: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(css): add hero section styles"
```

---

### Task 2.3: Create Status Bar Partial

**Files:**
- Create: `layouts/partials/status-bar.html`

**Step 1: Create status bar partial**

```html
<div class="status-bar" id="status-bar">
  <span class="status-item" id="status-battery">
    <span class="status-icon">🔋</span>
    <span class="status-value" id="status-battery-value">--</span>
  </span>
  <span class="status-separator">•</span>
  <span class="status-item" id="status-power">
    <span class="status-value" id="status-power-value">--</span>
  </span>
  <span class="status-separator">•</span>
  <span class="status-item" id="status-weather">
    <span class="status-icon" id="status-weather-icon">☀️</span>
    <span class="status-value" id="status-weather-value">--</span>
  </span>
  <span class="status-separator">•</span>
  <span class="status-item" id="status-uptime">
    <span class="status-label">Uptime:</span>
    <span class="status-value" id="status-uptime-value">--</span>
  </span>
</div>
```

**Step 2: Verify file exists**

Run: `ls -la layouts/partials/status-bar.html`
Expected: File exists

**Step 3: Commit**

```bash
git add layouts/partials/status-bar.html
git commit -m "feat(templates): create status-bar partial"
```

---

### Task 2.4: Add Status Bar CSS

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Add status bar styles**

```scss
/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--pad);
  padding: var(--pad-small) var(--pad);
  background: var(--status-bar-bg);
  font-size: var(--font-small);
  flex-wrap: wrap;
}

.status-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.status-separator {
  color: var(--color-icons-lines);
}

.status-label {
  color: var(--color-sub);
}

.status-value {
  font-weight: bold;
}
```

**Step 2: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(css): add status bar styles"
```

---

### Task 2.5: Update Homepage Template

**Files:**
- Modify: `layouts/home.html`

**Step 1: Backup existing template**

Run: `cp layouts/home.html layouts/home.html.backup`

**Step 2: Update home.html to use new hero**

Replace the content block with:

```html
{{ define "main" }}

{{/* Include hero section */}}
{{ partial "hero-solar" . }}

{{/* Status bar */}}
{{ partial "status-bar" . }}

<main class="article">
  <section class="homepage-section">
    <h2>Recent Posts</h2>
    <div class="post-grid">
      {{ range first 3 (where .Site.RegularPages "Type" "posts") }}
      <article class="post-card">
        {{ with .Resources.GetMatch "*.{jpg,png,gif}" }}
        <img src="{{ .RelPermalink }}" alt="{{ $.Title }}" class="post-thumbnail">
        {{ end }}
        <h3><a href="{{ .Permalink }}">{{ .Title }}</a></h3>
        <time>{{ .Date.Format "January 2, 2006" }}</time>
      </article>
      {{ end }}
    </div>
    <p><a href="/posts">View all posts →</a></p>
  </section>

  <section class="homepage-section">
    <h2>Upcoming Events</h2>
    <p>
      Check out our <a href="https://bookwhen.com/sequoiafabrica">classes and events</a>
      at Sequoia Fabrica Makerspace.
    </p>
  </section>

  <section class="homepage-section">
    <h2>Stay Connected</h2>
    <p>
      <a href="https://dashboard.mailerlite.com/forms/1197290/139047052633965606/share">Join our newsletter</a> |
      <a href="https://www.instagram.com/sequoia.fabrica">Instagram</a> |
      <a href="https://sfba.social/@sequoiafabrica">Mastodon</a>
    </p>
  </section>
</main>

<script>
// Initialize hero gauge with power data
document.addEventListener('DOMContentLoaded', function() {
  if (typeof PowerMonitor !== 'undefined') {
    PowerMonitor.initHeroGauge();
  }
});
</script>

{{ end }}
```

**Step 3: Build and verify**

Run: `make serve`
Expected: Homepage shows new hero section with gauge

**Step 4: Visual verification**

Open http://localhost:1313 and verify:
- Hero section appears with gauge placeholder
- "This website runs on sunshine" headline visible
- Three CTA buttons displayed
- Status bar visible below hero

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(homepage): implement solar hero section and status bar"
```

---

## Phase 3: Power Page Dashboard

### Task 3.1: Create Dashboard Card Partial

**Files:**
- Create: `layouts/partials/dashboard-card.html`

**Step 1: Create dashboard card partial**

```html
{{/*
  Dashboard Card Partial
  Usage: {{ partial "dashboard-card" (dict "id" "battery" "title" "Battery" "icon" "🔋") }}
*/}}
<div class="card dashboard-card" id="card-{{ .id }}">
  <div class="card-header">
    {{ with .icon }}<span class="card-icon">{{ . }}</span>{{ end }}
    {{ .title }}
  </div>
  <div class="card-value" id="{{ .id }}-value">--</div>
  <div class="card-label" id="{{ .id }}-label">Loading...</div>
  {{ if .sparkline }}
  <div class="card-sparkline" id="{{ .id }}-sparkline">
    <svg class="sparkline sparkline-loading" width="100%" height="40" preserveAspectRatio="none">
      <circle cx="20%" cy="20" r="3" fill="var(--color-primary)"/>
      <circle cx="40%" cy="20" r="3" fill="var(--color-primary)"/>
      <circle cx="60%" cy="20" r="3" fill="var(--color-primary)"/>
      <circle cx="80%" cy="20" r="3" fill="var(--color-primary)"/>
    </svg>
  </div>
  {{ end }}
</div>
```

**Step 2: Verify file**

Run: `cat layouts/partials/dashboard-card.html`
Expected: Content matches above

**Step 3: Commit**

```bash
git add layouts/partials/dashboard-card.html
git commit -m "feat(templates): create dashboard-card partial"
```

---

### Task 3.2: Add Dashboard CSS

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: Add dashboard-specific styles**

```scss
/* Dashboard Cards */
.dashboard-card {
  text-align: center;
}

.dashboard-card .card-value {
  font-size: 2.5rem;
  line-height: 1;
}

.dashboard-card .card-sparkline {
  margin-top: var(--pad);
  height: 50px;
}

.dashboard-card .sparkline {
  width: 100%;
  height: 100%;
}

.dashboard-card .sparkline path {
  stroke: var(--color-primary);
  stroke-width: 2;
  fill: none;
}

/* Larger sparklines for power page */
.power-dashboard .sparkline {
  height: 50px;
}

/* Metrics table with sparklines */
.metrics-table {
  width: 100%;
  border-collapse: collapse;
}

.metrics-table td {
  padding: var(--pad-small) 0;
  border-bottom: 1px solid var(--color-bg2);
}

.metrics-table .metric-label {
  width: 40%;
}

.metrics-table .metric-value {
  width: 20%;
  font-weight: bold;
  text-align: right;
  padding-right: var(--pad);
}

.metrics-table .metric-sparkline {
  width: 40%;
}

.metrics-table .sparkline {
  width: 100%;
  height: 30px;
}
```

**Step 2: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(css): add dashboard card and metrics table styles"
```

---

### Task 3.3: Update Power Page Content

**Files:**
- Modify: `content/power/_index.md` (or `content/power.md`)

**Step 1: Locate power page content**

Run: `find content -name "*power*" -type f`

**Step 2: Restructure power page frontmatter and content**

Update the file to have this structure (keeping existing content but reorganized):

```markdown
---
title: "Power Dashboard"
description: "Live solar power statistics for sequoia.garden"
layout: "power"
---

{{< dashboard-hero >}}

## Live Metrics

{{< metrics-table >}}

## How This Site Works

{{< collapsible title="About Our Solar Setup" >}}
This website runs on a solar powered server located in San Francisco...
[Move existing explanatory text here]
{{< /collapsible >}}

{{< collapsible title="Battery Meter Explained" >}}
The background of the top of every page is a battery meter...
[Move existing battery meter explanation here]
{{< /collapsible >}}

## The Setup

![Solar setup photo](/images/solar-setup.jpg)

The accessibility of this website depends on the weather in San Francisco, CA.
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(content): restructure power page for dashboard layout"
```

---

### Task 3.4: Create Power Page Layout

**Files:**
- Create: `layouts/_default/power.html` or `layouts/power/single.html`

**Step 1: Create power page layout**

```html
{{ define "main" }}
<main class="power-dashboard">
  <h1>{{ .Title }}</h1>

  <section class="dashboard-hero">
    <div class="card-grid">
      {{ partial "dashboard-card" (dict "id" "battery" "title" "Battery Status" "icon" "🔋" "sparkline" false) }}
      {{ partial "dashboard-card" (dict "id" "power" "title" "Power Draw" "icon" "⚡" "sparkline" true) }}
      {{ partial "dashboard-card" (dict "id" "weather" "title" "Weather" "icon" "☀️" "sparkline" false) }}
    </div>

    {{ partial "status-bar" . }}
  </section>

  <section class="dashboard-metrics">
    <h2>Detailed Metrics</h2>
    <table class="metrics-table" id="metrics-table">
      <tr>
        <td class="metric-label">Battery SOC</td>
        <td class="metric-value" id="metric-soc">--</td>
        <td class="metric-sparkline" id="sparkline-soc"></td>
      </tr>
      <tr>
        <td class="metric-label">Voltage</td>
        <td class="metric-value" id="metric-voltage">--</td>
        <td class="metric-sparkline" id="sparkline-voltage"></td>
      </tr>
      <tr>
        <td class="metric-label">Current</td>
        <td class="metric-value" id="metric-current">--</td>
        <td class="metric-sparkline" id="sparkline-current"></td>
      </tr>
      <tr>
        <td class="metric-label">Power</td>
        <td class="metric-value" id="metric-power">--</td>
        <td class="metric-sparkline" id="sparkline-power"></td>
      </tr>
      <tr>
        <td class="metric-label">CPU Temp</td>
        <td class="metric-value" id="metric-temp">--</td>
        <td class="metric-sparkline" id="sparkline-temp"></td>
      </tr>
      <tr>
        <td class="metric-label">CPU Load</td>
        <td class="metric-value" id="metric-load">--</td>
        <td class="metric-sparkline" id="sparkline-load"></td>
      </tr>
    </table>
  </section>

  <section class="article-content">
    {{ .Content }}
  </section>
</main>

<script>
document.addEventListener('DOMContentLoaded', function() {
  if (typeof PowerMonitor !== 'undefined') {
    PowerMonitor.initDashboard();
  }
});
</script>
{{ end }}
```

**Step 2: Build and verify**

Run: `make serve`
Expected: /power page shows card grid layout

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(templates): create power dashboard layout"
```

---

## Phase 4: Shortcodes for Content Pages

### Task 4.1: Create Callout Shortcode

**Files:**
- Create: `layouts/shortcodes/callout.html`

**Step 1: Create callout shortcode**

```html
{{/*
  Callout box shortcode
  Usage: {{< callout type="info" >}}Content here{{< /callout >}}
  Types: info, warning, note
*/}}
{{ $type := .Get "type" | default "info" }}
<div class="callout callout-{{ $type }}">
  {{ .Inner | markdownify }}
</div>
```

**Step 2: Add callout CSS**

In `assets/css/style.scss`:

```scss
/* Callout boxes */
.callout {
  padding: var(--pad-large);
  margin: var(--pad-large) 0;
  border-left: 4px solid var(--color-icons-lines);
  background: var(--color-bg2);
}

.callout-warning {
  border-left-color: var(--color-high);
}

.callout-note {
  border-left-color: var(--color-obs);
}

.callout p:last-child {
  margin-bottom: 0;
}
```

**Step 3: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(shortcodes): add callout box shortcode"
```

---

### Task 4.2: Create Pricing Card Shortcode

**Files:**
- Create: `layouts/shortcodes/pricing-cards.html`

**Step 1: Create pricing cards shortcode**

```html
{{/*
  Pricing cards shortcode
  Usage: {{< pricing-cards >}}
*/}}
<div class="pricing-cards">
  <div class="card pricing-card">
    <div class="pricing-tier">Sponsor</div>
    <div class="pricing-price">$200<span>/mo</span></div>
    <div class="pricing-desc">Help provide scholarships for those who cannot afford classes or full membership dues.</div>
  </div>
  <div class="card pricing-card pricing-card-featured">
    <div class="pricing-tier">Standard</div>
    <div class="pricing-price">$150<span>/mo</span></div>
    <div class="pricing-desc">Covers the full costs of running a community workshop in San Francisco.</div>
  </div>
  <div class="card pricing-card">
    <div class="pricing-tier">Discounted</div>
    <div class="pricing-price">$100<span>/mo</span></div>
    <div class="pricing-desc">For anyone who cannot otherwise afford full dues. Choose this option if you need it!</div>
  </div>
</div>
```

**Step 2: Add pricing card CSS**

In `assets/css/style.scss`:

```scss
/* Pricing Cards */
.pricing-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--card-gap);
  margin: var(--pad-large) 0;
}

.pricing-card {
  text-align: center;
  padding: var(--pad-xlarge) var(--pad-large);
}

.pricing-card-featured {
  border-width: 3px;
  transform: scale(1.02);
}

.pricing-tier {
  font-size: var(--font-small);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-sub);
  margin-bottom: var(--pad);
}

.pricing-price {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: var(--pad);
}

.pricing-price span {
  font-size: var(--font-body);
  font-weight: normal;
}

.pricing-desc {
  font-size: var(--font-small);
  color: var(--color-sub);
}
```

**Step 3: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(shortcodes): add pricing cards shortcode"
```

---

### Task 4.3: Create Collapsible Shortcode

**Files:**
- Create: `layouts/shortcodes/collapsible.html`

**Step 1: Create collapsible shortcode**

```html
{{/*
  Collapsible section shortcode
  Usage: {{< collapsible title="Section Title" >}}Content{{< /collapsible >}}
*/}}
{{ $title := .Get "title" | default "Click to expand" }}
<details class="collapsible">
  <summary class="collapsible-title">{{ $title }}</summary>
  <div class="collapsible-content">
    {{ .Inner | markdownify }}
  </div>
</details>
```

**Step 2: Add collapsible CSS**

In `assets/css/style.scss`:

```scss
/* Collapsible sections */
.collapsible {
  margin: var(--pad-large) 0;
  border: 1px solid var(--color-bg2);
}

.collapsible-title {
  padding: var(--pad);
  cursor: pointer;
  font-weight: bold;
  background: var(--color-bg2);
  list-style: none;
}

.collapsible-title::-webkit-details-marker {
  display: none;
}

.collapsible-title::before {
  content: "▶ ";
  display: inline-block;
  transition: transform 0.2s;
}

.collapsible[open] .collapsible-title::before {
  transform: rotate(90deg);
}

.collapsible-content {
  padding: var(--pad-large);
}
```

**Step 3: Build and verify**

Run: `make build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(shortcodes): add collapsible section shortcode"
```

---

## Phase 5: Footer Redesign

### Task 5.1: Update Footer Template

**Files:**
- Modify: `layouts/partials/footer.html`

**Step 1: Backup existing footer**

Run: `cp layouts/partials/footer.html layouts/partials/footer.html.backup`

**Step 2: Update footer with new layout**

```html
<footer class="site-footer">
  {{/* Status bar at top of footer */}}
  {{ partial "status-bar" . }}

  <div class="footer-content">
    <div class="footer-brand">
      <h2><a href="{{ .Site.BaseURL }}">{{ .Site.Title }}</a></h2>
    </div>

    <nav class="footer-nav">
      <a href="/about">About</a>
      <span class="nav-sep">•</span>
      <a href="/power">Power</a>
      <span class="nav-sep">•</span>
      <a href="/posts">Blog</a>
      <span class="nav-sep">•</span>
      <a href="/code-of-conduct">Code of Conduct</a>
      <span class="nav-sep">•</span>
      <a href="{{ .Site.Params.Wiki }}" target="_blank">Wiki↗</a>
    </nav>

    <div class="footer-columns">
      <div class="footer-column">
        <h3>Location</h3>
        <p>1736 18th St<br>San Francisco, CA 94107</p>
      </div>
      <div class="footer-column">
        <h3>Contact</h3>
        <p>{{ .Site.Params.Email }}</p>
        <div class="social-links">
          <a href="/feeds" title="RSS Feed">RSS</a>
          <a href="{{ .Site.Params.instagram }}" target="_blank" title="Instagram">Instagram</a>
          <a href="{{ .Site.Params.Newsletter }}" target="_blank" title="Newsletter">Newsletter</a>
        </div>
      </div>
    </div>

    <div class="footer-bottom">
      <span>&copy; Sequoia Fabrica</span>
      <span class="footer-sep">•</span>
      <a href="/feeds">RSS</a>
      <span class="footer-sep">•</span>
      <span id="page-size"></span>
    </div>
  </div>
</footer>
```

**Step 3: Add footer CSS**

In `assets/css/style.scss`:

```scss
/* Footer Redesign */
.site-footer {
  border-top: 2px solid var(--color-icons-lines);
  margin-top: var(--pad-section);
}

.footer-content {
  padding: var(--pad-large) 0;
  max-width: var(--max-content-width);
  margin: 0 auto;
}

.footer-brand h2 {
  text-align: center;
  margin-bottom: var(--pad-large);
  border-bottom: none;
}

.footer-nav {
  text-align: center;
  margin-bottom: var(--pad-large);
}

.footer-nav a {
  border-bottom: none;
}

.nav-sep {
  margin: 0 var(--pad-small);
  color: var(--color-icons-lines);
}

.footer-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--pad-xlarge);
  margin-bottom: var(--pad-large);
}

.footer-column h3 {
  font-size: var(--font-body);
  margin-bottom: var(--pad-small);
  border-bottom: none;
}

.social-links a {
  margin-right: var(--pad);
}

.footer-bottom {
  text-align: center;
  font-size: var(--font-small);
  color: var(--color-sub);
  padding-top: var(--pad);
  border-top: 1px solid var(--color-bg2);
}

.footer-sep {
  margin: 0 var(--pad-small);
}

@media (max-width: 550px) {
  .footer-columns {
    grid-template-columns: 1fr;
  }
}
```

**Step 4: Build and verify**

Run: `make serve`
Expected: Footer is more compact with status bar at top

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(footer): redesign with compact status bar layout"
```

---

## Phase 6: Blog Page Improvements

### Task 6.1: Update Blog Listing Template

**Files:**
- Modify: `layouts/posts.html` or `layouts/_default/list.html`

**Step 1: Update blog listing with featured post**

```html
{{ define "main" }}
<main>
  <header class="page-header">
    <h1>The Solar Blog</h1>
    <p class="page-subtitle">Maker guides, project logs, and community updates from Sequoia Fabrica.</p>
  </header>

  {{ $pages := where .Site.RegularPages "Type" "posts" }}

  {{/* Featured post - first/most recent */}}
  {{ with index $pages 0 }}
  <article class="post-featured">
    {{ with .Resources.GetMatch "*.{jpg,png,gif}" }}
    <img src="{{ .RelPermalink }}" alt="{{ $.Title }}" class="post-featured-image">
    {{ end }}
    <div class="post-featured-content">
      <h2><a href="{{ .Permalink }}">{{ .Title }}</a></h2>
      {{ with .Summary }}<p class="post-excerpt">{{ . }}</p>{{ end }}
      <div class="post-meta">
        <time>{{ .Date.Format "January 2, 2006" }}</time>
        {{ with .Params.author }}• by {{ . }}{{ end }}
      </div>
    </div>
  </article>
  {{ end }}

  {{/* Remaining posts in grid */}}
  {{ if gt (len $pages) 1 }}
  <div class="post-grid">
    {{ range after 1 $pages }}
    <article class="post-card">
      {{ with .Resources.GetMatch "*.{jpg,png,gif}" }}
      <img src="{{ .RelPermalink }}" alt="{{ $.Title }}" class="post-card-image">
      {{ end }}
      <h3><a href="{{ .Permalink }}">{{ .Title }}</a></h3>
      <time>{{ .Date.Format "January 2, 2006" }}</time>
    </article>
    {{ end }}
  </div>
  {{ end }}
</main>
{{ end }}
```

**Step 2: Add blog listing CSS**

In `assets/css/style.scss`:

```scss
/* Blog listing */
.page-header {
  margin-bottom: var(--pad-xlarge);
}

.page-subtitle {
  color: var(--color-sub);
  font-size: var(--font-medium);
}

.post-featured {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-xlarge);
  margin-bottom: var(--pad-xlarge);
  padding-bottom: var(--pad-xlarge);
  border-bottom: 2px solid var(--color-bg2);
}

.post-featured-image {
  width: 100%;
  height: auto;
}

.post-featured h2 {
  margin-top: 0;
}

.post-excerpt {
  color: var(--color-sub);
}

.post-meta {
  font-size: var(--font-small);
  color: var(--color-sub);
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--pad-large);
}

.post-card {
  border: 1px solid var(--color-bg2);
  padding: var(--pad);
}

.post-card-image {
  width: 100%;
  height: 150px;
  object-fit: cover;
  margin-bottom: var(--pad);
}

.post-card h3 {
  font-size: var(--font-body);
  margin: 0 0 var(--pad-small) 0;
}

.post-card time {
  font-size: var(--font-small);
  color: var(--color-sub);
}

@media (max-width: 700px) {
  .post-featured {
    grid-template-columns: 1fr;
  }
}
```

**Step 3: Build and verify**

Run: `make serve`
Expected: /posts shows featured post layout

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(blog): add featured post and grid layout"
```

---

### Task 6.2: Add Reading Time to Posts

**Files:**
- Create: `layouts/partials/reading-time.html`
- Modify: `layouts/_default/single.html`

**Step 1: Create reading time partial**

```html
{{/* Calculate reading time: ~200 words per minute */}}
{{ $wordCount := .WordCount }}
{{ $readingTime := div $wordCount 200 }}
{{ if lt $readingTime 1 }}
  {{ $readingTime = 1 }}
{{ end }}
<span class="reading-time">{{ $readingTime }} min read</span>
```

**Step 2: Add to single post template**

Find the post header section and add:

```html
<div class="post-meta">
  <time>{{ .Date.Format "January 2, 2006" }}</time>
  {{ with .Params.author }}• by <a href="/authors/{{ . | urlize }}">{{ . }}</a>{{ end }}
  • {{ partial "reading-time" . }}
</div>
```

**Step 3: Build and verify**

Run: `make serve`
Expected: Post pages show "X min read" in header

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(posts): add reading time estimate"
```

---

## Phase 7: Final Polish

### Task 7.1: Test Mobile Responsiveness

**Step 1: Run dev server**

Run: `make serve`

**Step 2: Test in browser**

Open Chrome DevTools, test at these breakpoints:
- 375px (iPhone SE)
- 414px (iPhone Plus)
- 768px (iPad)
- 1024px (Desktop)

**Step 3: Document any issues**

Create a checklist of issues found and fix them.

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix(responsive): address mobile layout issues"
```

---

### Task 7.2: Performance Check

**Step 1: Build production site**

Run: `make build`

**Step 2: Check page sizes**

Run: `du -sh public/` and check individual pages

**Step 3: Verify targets**

- Homepage < 200KB
- Power page < 300KB
- Blog posts < 500KB (including images)

**Step 4: Commit any optimizations**

```bash
git add -A
git commit -m "perf: optimize page sizes"
```

---

### Task 7.3: Final Commit and PR

**Step 1: Review all changes**

Run: `git diff main --stat`

**Step 2: Create PR**

```bash
git push -u origin feature/design-improvements
gh pr create --title "Design improvements: Solar dashboard hero, compact footer, blog layout" --body "## Summary
- Homepage redesign with solar gauge hero
- Power page dashboard with card layout
- Compact footer with status bar
- Blog listing with featured post
- New shortcodes: callout, pricing-cards, collapsible
- Typography and spacing improvements

## Test plan
- [ ] Verify homepage hero displays correctly
- [ ] Check power dashboard shows live data
- [ ] Test all shortcodes render properly
- [ ] Verify mobile responsiveness
- [ ] Confirm page sizes meet targets"
```

---

## Success Criteria Checklist

- [ ] Homepage shows "This website runs on sunshine" hero with gauge
- [ ] Status bar displays live power/weather data
- [ ] Power page has visual dashboard with cards
- [ ] Blog listing has featured post layout
- [ ] Membership page uses pricing cards
- [ ] Footer is compact with status bar
- [ ] All pages work on mobile (375px+)
- [ ] Page sizes under target limits

---

## References

- Design document: `docs/plans/2026-01-19-design-improvements.md`
- Current site: https://sequoia.garden
- Hugo docs: https://gohugo.io/documentation/
