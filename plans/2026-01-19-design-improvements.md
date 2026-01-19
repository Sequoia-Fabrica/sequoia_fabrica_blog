# Sequoia Garden Design Improvement Plan

**Date:** 2026-01-19
**Goal:** Polish sequoia.garden to be worthy of becoming the main Sequoia Fabrica site, with the solar-powered blog as the hero feature.

## Context

Sequoia Fabrica currently operates two websites:
- **sequoiafabrica.org** - Main organizational site (modern, green/white, photo carousel)
- **sequoia.garden** - Solar-powered blog (retro-tech aesthetic, battery meter, server stats)

The original intent was for sequoia.garden to replace sequoiafabrica.org. This plan outlines design improvements to make that transition viable.

### Design Philosophy

The solar-powered aspect is genuinely unique—no other makerspace has this. Rather than competing with sequoiafabrica.org on conventional polish, we lean into the difference:

- **Lead with the solar story** - "This website runs on sunshine"
- **Showcase the technical project** - The power dashboard becomes a feature, not an afterthought
- **Maintain the retro-tech aesthetic** - Monospace fonts, warm colors, dithered images
- **Keep it bandwidth-conscious** - Aligned with the sustainability ethos

---

## Section 1: Homepage Redesign

### Current Problems
- Calendar dominates above-the-fold content but is hard to read
- Value proposition buried in paragraph text
- No visual hero showcasing what makes this site special
- CTAs (membership, events) not prominent

### Proposed Layout

```
┌─────────────────────────────────────────────────────┐
│  [Logo] SEQUOIA FABRICA           [Nav] [Battery]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌──────────┐   This website runs on sunshine.    │
│   │  ☀️ 98%  │                                     │
│   │  [gauge] │   A solar-powered blog from         │
│   │ Charging │   Sequoia Fabrica Makerspace—       │
│   └──────────┘   a community workshop in SF.       │
│                                                     │
│   [About the Space →]  [Read the Blog →]  [Power →]│
│                                                     │
├─────────────────────────────────────────────────────┤
│  Server: Online │ Weather: ☀️ Today │ 13d uptime   │
└─────────────────────────────────────────────────────┘
```

### Key Changes

1. **Large solar gauge as visual hero** - Not just a tiny battery icon in the corner
2. **Concise value prop** - "This website runs on sunshine" + one sentence about the makerspace
3. **Three clear CTAs** with button styling:
   - "About the Space" → links to sequoiafabrica.org or /about
   - "Read the Blog" → /posts
   - "Power" → /power (the technical showcase)
4. **Status bar** showing at-a-glance server health

### Below the Fold Content

1. **Recent blog posts** (this is a blog after all)
2. **"How This Site Works"** teaser linking to /power
3. **Upcoming events** (compact list, links to BookWhen—not full calendar)
4. **Newsletter signup + social links**

### Implementation Notes

- Remove or relocate the full calendar embed (move to dedicated /events page or link out)
- Create new hero section partial: `layouts/partials/hero-solar.html`
- Add CSS for gauge component and status bar

---

## Section 2: Power Page Redesign

### Current Problems
- Weather forecast is simple text list
- Server stats table is functional but visually flat
- Sparklines are tiny and hard to interpret
- Long explanatory paragraphs before any data
- Photo of solar setup buried at bottom

### Proposed Layout

**Hero Dashboard:**
```
┌─────────────────────────────────────────────────────┐
│  POWER DASHBOARD                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   ☀️ 98%    │  │  3.85W      │  │  ☀️ Sunny   │ │
│  │  ████████░  │  │  Power Draw │  │  Today      │ │
│  │  Charging   │  │  ▁▂▃▄▅▆▇█  │  │  ☁️ Tomorrow│ │
│  │             │  │  (24h)      │  │  ☁️ Wed     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  Server Online • Uptime: 13d 14h • SF, CA           │
└─────────────────────────────────────────────────────┘
```

**Three Visual Cards:**
1. **Battery Status** - Large gauge with SOC %, charging/discharging state
2. **Power Metrics** - Current draw with 24-hour sparkline (much larger than current)
3. **Weather Forecast** - 3-day forecast with icons

**Detailed Stats Section:**
```
┌─────────────────────────────────────────────────────┐
│  LIVE METRICS                                       │
├─────────────────────────────────────────────────────┤
│  Battery SOC      98%          ▁▂▃▅▆▇██████████    │
│  Voltage          13.1V        ▅▅▅▅▆▆▆▆▆▆▇▇▇▇▇    │
│  Current Draw     210mA        ▃▃▄▄▃▃▂▂▃▃▄▄▃▃▃    │
│  Power            2.08W        ▃▃▄▄▃▃▂▂▃▃▄▄▃▃▃    │
│  CPU Temp         50.0°C       ▅▅▅▆▆▆▆▆▆▅▅▅▅▅▅    │
│  CPU Load         2.42%        ▂▂▂▃▃▂▂▂▂▂▂▂▂▂▂    │
└─────────────────────────────────────────────────────┘
```

### Key Improvements

- Sparklines are **full-width** and easier to read
- Each metric on its own row with clear label
- Visual hierarchy: number first, then trend line

### Below the Dashboard

1. **Photo of the solar setup** - Move UP prominently
2. **Collapsible "How It Works" section** - Current explanatory text, hidden by default
3. **Technical specs table** - Battery capacity, panel wattage, server specs

### Implementation Notes

- Create dashboard card component: `static/js/components/dashboard-card.js`
- Enhance sparkline component with larger default size
- Add collapsible/accordion component for long text sections
- Restructure power page content in `/content/power/`

---

## Section 3: Blog & Post Pages

### Current Problems
- Blog listing shows cards with images but no excerpts
- No clear "this is a blog" identity
- Individual posts lack metadata (reading time, etc.)
- Related posts section is minimal

### Blog Listing Page (/posts/)

```
┌─────────────────────────────────────────────────────┐
│  THE SOLAR BLOG                                     │
│  Maker guides, project logs, and community updates  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [Dithered Image]                            │   │
│  │                                             │   │
│  │ What is Computer Embroidery?                │   │
│  │ A quick intro to computer embroidery...     │   │
│  │ Aug 20, 2025 • by jof • #textiles           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │ [Image]          │  │ [Image]          │        │
│  │ Have you seen    │  │ Cinder the cat   │        │
│  │ this cat?        │  │ Apr 28, 2025     │        │
│  │ Aug 17, 2025     │  │                  │        │
│  └──────────────────┘  └──────────────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Key Changes

1. **Page header** - "The Solar Blog" with subtitle
2. **Featured post** - Most recent article larger, with excerpt
3. **Grid layout** - Older posts in responsive grid
4. **Visible metadata** - Date, author, tags on each card

### Individual Post Pages

- Add **estimated reading time** in header
- Improve **related posts** section with thumbnails
- Keep current readable layout (it works well)

### Implementation Notes

- Update `layouts/posts.html` for featured + grid layout
- Add reading time calculation partial
- Enhance article-list partials with excerpt support

---

## Section 4: Content Pages (About, Membership, FAQ)

### Current Problems
- Wall of text with minimal visual breaks
- Identical styling to blog posts
- Membership tiers buried in bullet list
- Long numbered processes hard to scan

### Membership Page - Pricing Cards

```
┌─────────────────────────────────────────────────────┐
│  MEMBERSHIP TYPES                                   │
├─────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌───────────────┐ ┌───────────┐ │
│  │   SPONSOR     │ │   STANDARD    │ │ DISCOUNTED│ │
│  │               │ │               │ │           │ │
│  │    $200/mo    │ │    $150/mo    │ │  $100/mo  │ │
│  │               │ │               │ │           │ │
│  │ Help provide  │ │ Covers full   │ │ For those │ │
│  │ scholarships  │ │ operating     │ │ who need  │ │
│  │               │ │ costs         │ │ it        │ │
│  └───────────────┘ └───────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────┘
```

### Membership Process - Visual Steps

```
┌─────────────────────────────────────────────────────┐
│  HOW TO JOIN                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ① Visit Us ──→ ② Apply ──→ ③ Orientation          │
│       ↓                           ↓                 │
│  ④ Review ←─── ⑤ Pay Dues ←── ⑥ Welcome!           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Key Changes for All Content Pages

1. **Section dividers** between major headings
2. **Callout boxes** for important info (e.g., "Must be 18+")
3. **Constrained line width** (~65 characters max)
4. **Subtle background color** on key sections

### Implementation Notes

- Create pricing card shortcode: `layouts/shortcodes/pricing-card.html`
- Create callout box shortcode: `layouts/shortcodes/callout.html`
- Create step indicator shortcode: `layouts/shortcodes/steps.html`
- Add CSS for these new components

---

## Section 5: Footer Redesign

### Current Problems
- Four-column grid often shows empty/loading states
- Dense and hard to scan
- Duplicates content from Power page
- Too tall, especially on mobile

### Proposed Layout

```
┌─────────────────────────────────────────────────────┐
│  ☀️ 98% Charging │ 3.85W │ ☀️ Sunny │ Online 13d   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  SEQUOIA FABRICA MAKERSPACE                         │
│                                                     │
│  About • Power • Blog • Code of Conduct • Wiki↗     │
│                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ 📍 1736 18th St     │  │ 📧 info@sequoia...  │  │
│  │    SF, CA 94107     │  │ 📷 Instagram        │  │
│  │                     │  │ 🐘 Mastodon         │  │
│  └─────────────────────┘  └─────────────────────┘  │
│                                                     │
│  © Sequoia Fabrica • RSS • Newsletter              │
└─────────────────────────────────────────────────────┘
```

### Key Changes

1. **Status bar at top** with live metrics (single horizontal line)
2. **Simpler link structure** - One row of page links
3. **Two-column layout** for contact/social (not four cramped columns)
4. **Remove duplicate weather details** - Link to /power instead
5. **Smaller footprint** overall

### Implementation Notes

- Refactor `layouts/partials/footer.html`
- Create compact status bar component
- Simplify dashboard grid CSS

---

## Section 6: Global Improvements

### Typography

| Change | Current | Proposed |
|--------|---------|----------|
| Line width | Unconstrained | Max 65ch for body text |
| Header contrast | Subtle | Bolder weight, larger size difference |
| Font family | Keep monospace | Keep monospace (identity) |

### Spacing

- More generous vertical rhythm between sections (currently tight)
- Consistent padding in cards and boxes (create CSS variables)

### New Components to Create

| Component | Purpose | File |
|-----------|---------|------|
| Card | Blog posts, membership tiers | `static/css/components/card.css` |
| Gauge | Battery SOC display | `static/js/components/gauge.js` |
| Status bar | Header and footer status | `static/js/components/status-bar.js` |
| Sparkline (enhanced) | Larger, more readable | Update `power-monitor.js` |
| Step indicator | Membership process | `layouts/shortcodes/steps.html` |
| Callout box | Important notices | `layouts/shortcodes/callout.html` |
| Collapsible | Long text sections | `static/js/components/collapsible.js` |

### Mobile Improvements

- Collapsible sections on Power page
- Stacked cards instead of side-by-side grids
- Simplified footer that doesn't stretch forever
- Better calendar handling (list view on mobile, or link out entirely)

---

## Implementation Phases

### Phase 1: Foundation (CSS & Components)
- [ ] Add CSS variables for spacing, max-widths
- [ ] Constrain body text line width
- [ ] Improve header typography contrast
- [ ] Create card component CSS

### Phase 2: Homepage
- [ ] Create hero section with solar gauge
- [ ] Add status bar component
- [ ] Simplify below-fold content
- [ ] Move/remove full calendar

### Phase 3: Power Page
- [ ] Create dashboard card layout
- [ ] Enhance sparkline size/visibility
- [ ] Add collapsible sections for long text
- [ ] Move photo up in content order

### Phase 4: Blog Pages
- [ ] Add page header to blog listing
- [ ] Create featured post layout
- [ ] Add reading time to posts
- [ ] Improve related posts section

### Phase 5: Content Pages
- [ ] Create pricing card shortcode
- [ ] Create callout box shortcode
- [ ] Create step indicator shortcode
- [ ] Apply to Membership page

### Phase 6: Footer
- [ ] Create compact status bar
- [ ] Simplify footer layout
- [ ] Remove redundant dashboard sections

### Phase 7: Polish & Mobile
- [ ] Test all pages on mobile
- [ ] Fix calendar mobile issues
- [ ] Ensure collapsibles work on touch
- [ ] Final spacing/typography tweaks

---

## Success Criteria

1. **First-time visitor** immediately understands: "This is a solar-powered blog from a makerspace"
2. **Power page** is visually engaging and works as a technical showcase
3. **Blog content** is easy to discover and read
4. **Membership info** is scannable with clear pricing
5. **Mobile experience** is usable without horizontal scrolling or cramped elements
6. **Page load** remains fast (< 500KB total, ideally < 200KB)

---

## References

- Current site: https://sequoia.garden
- Main org site: https://sequoiafabrica.org
- Solar theme origin: https://solar.lowtechmagazine.com
- Screenshots captured in `.playwright-mcp/` directory
