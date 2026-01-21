# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This is a Hugo static site for the Sequoia Fabrica Makerspace blog. Use these commands for development:

```bash
# Start development server with live reload
make serve
# Alternative: hugo server

# Build the static site
make build
# Alternative: hugo build
```

The Makefile uses Hugo with extended features via `go run -tags extended github.com/gohugoio/hugo@latest`.

## Architecture

### Site Structure
- **Hugo-based static site** for Sequoia Fabrica Makerspace
- **Content management**: Markdown files in `/content/` directory with frontmatter
- **Templating**: Hugo templates in `/layouts/` with custom partials
- **Solar theme variant**: Based on Low-tech Magazine's Solar v.2 theme, adapted for makerspace use

### Key Components
- **Power monitoring system**: Real-time solar power data integration
  - `static/js/powerinfo.js`: Node.js module for power data collection from AXP20x PMIC and INA228 shunt
  - `static/js/script.js`: Frontend power dashboard and battery meter
  - API endpoint: `/api/stats.json` for power statistics
- **Weather integration**: Weather forecast display with custom icons
- **Mobile-responsive design** with toggle menu functionality
- **Image dithering system**: Automatic image processing for bandwidth optimization

### Content Architecture
- **Posts**: Blog entries in `/content/posts/[slug]/`
- **Pages**: Static pages like About, Membership, FAQ in `/content/[page]/`
- **Authors taxonomy**: Custom taxonomy for author pages
- **Comments**: Markdown-based comment system

### Build Process
- **Hugo site generation**: Standard Hugo build process
- **Post-processing utilities** in `/utils/`:
  - `dither_images.py`: Creates dithered versions of images for low-bandwidth viewing
  - `calculate_size.py`: Calculates and injects page sizes into HTML
  - `build_site.sh`: Complete build script with utility integration

### Configuration
- **Hugo config**: `hugo.toml` with custom parameters for makerspace info
- **Menu system**: Configured in hugo.toml with external links (events, donations)
- **Python dependencies**: `utils/requirements.txt` for image processing tools

### Power System Integration
The site features live power monitoring from a solar setup:
- Reads from AXP20x PMIC sysfs and INA228 shunt sensor
- Displays battery SOC, power consumption, charging status
- CPU temperature and load monitoring
- Weather forecast integration for solar predictions

### Deployment
- Uses GitHub Actions for automated deployment
- Builds static site and deploys to hosting platform
- Image optimization and size calculation in build pipeline

---

## Intent Layer

> READ-FIRST: Start here when working in this codebase.

### Entry Points

| Task | Start Here |
|------|------------|
| Add blog post | `content/posts/` - copy existing post directory |
| Modify power dashboard | `static/js/script.js` → `static/js/powerinfo.js` |
| Change site appearance | `layouts/` partials, NOT theme files directly |
| Update deployment | `ansible/` playbooks |
| Debug data collection | `collectors/systemd/` scripts |

### Contracts & Invariants

- **Power API format is frozen** - `/api/stats.json` structure must not change; external consumers depend on exact fields
- **PRs required for main** - Never commit directly to main branch
- **Frontmatter schema** - Posts require: `title`, `date`, `authors`, `summary` fields
- **Image paths** - Use relative paths within post directories; dithering assumes this structure

### Patterns

1. **Adding a new post**:
   - Create directory: `content/posts/[slug]/`
   - Add `index.md` with required frontmatter
   - Images go in same directory, will be auto-dithered

2. **Modifying power display**:
   - Backend data: `collectors/` → systemd timers → JSON files
   - API layer: `static/js/powerinfo.js`
   - Frontend: `static/js/script.js`

3. **Local development**:
   - `make serve` for Hugo dev server
   - Power data mocked unless on actual hardware

### Anti-patterns

- Never edit files in `public/` - always regenerate via `make build`
- Don't modify theme files in `themes/` directly - use `layouts/` overrides
- Don't hardcode power sensor paths - use config in `collectors/`

### Pitfalls

- **Build process has hidden deps**: Hugo + Python (Pillow for dithering) + Go. Missing any breaks silently
- **Power monitoring quirks**: Data collection assumes specific hardware (AXP20x, INA228). Will fail silently on other setups
- **Ansible assumes existing infra**: Playbooks expect systemd, specific user accounts, pre-configured SSH
- `utils/esp-exporter/` looks like it belongs to this project but is **standalone Rust** - no Hugo dependency

### Architecture Decisions

- Why dithered images: Bandwidth optimization for solar-powered hosting (Low-tech Magazine pattern)
- Why Hugo over other SSGs: Go-based, single binary, theme ecosystem
- Why separate collectors: Decoupled data pipeline allows hardware-independent site builds

### Subsystem Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  Hugo Site (content/, layouts/, static/)                     │
│  - Content authoring, templating, frontend                  │
└─────────────────────────────────────────────────────────────┘
         ↑ reads JSON from
┌─────────────────────────────────────────────────────────────┐
│  Data Pipeline (collectors/)                                │
│  - systemd timers → sensor reads → JSON files              │
└─────────────────────────────────────────────────────────────┘
         ↑ deployed via
┌─────────────────────────────────────────────────────────────┐
│  Infrastructure (ansible/)                                  │
│  - Server setup, systemd units, SSH config                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  esp-exporter (utils/esp-exporter/) - STANDALONE           │
│  - Rust tool, no site dependency, separate build           │
└─────────────────────────────────────────────────────────────┘
```

### Related Context

- Solar theme origin: Low-tech Magazine's solar.lowtechmagazine.com
- Power monitoring hardware: AXP20x PMIC + INA228 current shunt
- Deployment target: Self-hosted on solar-powered server