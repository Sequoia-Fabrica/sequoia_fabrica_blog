# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Intent Layer

> **TL;DR**: Solar-powered Hugo blog for Sequoia Fabrica Makerspace with live power monitoring from ESP32. See Entry Points for common tasks.

### Entry Points

| Task | Start Here |
|------|------------|
| Add/edit blog post | `content/posts/[slug]/index.md` |
| Modify site layout | `layouts/` partials and templates |
| Update power monitoring | `collectors/power-collector.js` |
| Change site config | `hugo.toml` |
| Modify deployment | `.github/workflows/deploy-site.yml` |
| Update server config | `ansible/sol.yml` |
| Debug ESP32 data | `utils/esp-exporter/esp_logger.py` |

### Boundaries

#### Always
- Create PRs instead of pushing directly to main
- Run `make serve` to test Hugo changes locally before committing
- Test collector changes with `node collectors/<name>.js` locally first
- Keep monitoring data in `/var/log/monitoring/` (persistent storage)

#### Ask First
- Database schema changes to metrics JSONL format
- Changes to API response shapes in `/api/*.json`
- Modifying systemd service configurations
- Adding new external dependencies to collectors

#### Never
- Commit secrets, API keys, or `.env` files
- Push directly to main branch
- Use `rsync -a` for deployment (breaks permissions—use `--no-group --no-owner`)
- Modify ESP32 serial baud rate without updating both firmware and logger

### Pitfalls

- **Race condition on first run**: `power-collector.js` reads from `esp_log.jsonl` which may not exist on first run. The collector now handles this gracefully, but test with missing files.
- **Power metrics data loss**: Sparklines require 5-minute resolution data for 24 hours. If `data-orchestrator.js` runs before `power-collector.js` populates data, sparklines will be empty.
- **Rsync permissions**: Using `rsync -a` preserves source permissions which fail on the server. Always use `--no-group --no-owner` flags.
- **Ansible check mode**: Service file updates with `notify` handlers fail in check mode. Use `--check` carefully with systemd tasks.
- **Hugo deprecations**: Use `pagination.pagerSize` not `paginate`. Use `css.Sass` not `resources.ToCSS`.
- **Service paths**: ESP logger expects scripts at `/opt/sequoia_fabrica_blog/`, not relative paths.
- **Current normalization**: Power monitor displays use normalized current values—raw INA228 readings need conversion.

### Pre-flight Checks

#### Deploying Collectors
Before deploying collector changes:
- [ ] `node collectors/<name>.js` runs without errors locally
- [ ] JSON output format matches existing `/api/*.json` schema
- [ ] No hardcoded paths that differ between local and server

If any unchecked → fix first before pushing.

#### Modifying Ansible
Before changing `ansible/**`:
- [ ] Run `ansible-playbook --check ansible/sol.yml` passes
- [ ] No secrets in playbook (use GitHub secrets)
- [ ] Service file changes have proper handlers

If any unchecked → fix first before pushing.

### Contracts

- All collectors write JSONL to `/var/log/monitoring/`
- All API endpoints served from `/var/www/html/api/`
- ESP32 communicates at 115200 baud via `/dev/ttyUSB0`
- Timers: power-collector (5min), weather/calendar (1hr), orchestrator (2min)
- Deploy user `sol` runs rsync; service user `monitoring` runs collectors

---

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
- **Power monitoring system**: Real-time solar power data from ESP32 battery monitor
  - `collectors/power-collector.js`: Reads ESP32 data, generates power metrics
  - `collectors/data-orchestrator.js`: Aggregates all collectors into API JSON files
  - `static/js/components/power-monitor.js`: Frontend power dashboard with sparklines
  - API endpoint: `/api/stats.json` for power statistics
- **Weather integration**: Weather forecast display with custom icons
  - `collectors/weather-collector.js`: Fetches weather data
- **Calendar integration**: Upcoming events from external calendar
  - `collectors/calendar-collector.js`: Fetches calendar events
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

## Power System Integration

The site features live power monitoring from a solar setup running on the "sol" server (Raspberry Pi with DietPi).

### Data Flow
```
ESP32 (INA228 shunt sensor)
    ↓ serial port (/dev/ttyUSB0 @ 115200 baud)
esp_logger.py (continuous service)
    ↓ writes JSON lines
/var/log/esp_logger/esp_log.jsonl
    ↓ read by
power-collector.js (every 5 min via timer)
    ↓ writes
/var/log/monitoring/power_metrics.jsonl
    ↓ read by
data-orchestrator.js (every 2 min via timer)
    ↓ generates
/var/www/html/api/stats.json, weather.json, calendar.json
    ↓ served by
NGINX → Cloudflare Tunnel → https://sequoia.garden
```

### Metrics Collected
- Battery voltage, current, power (from INA228 shunt)
- State of charge (SOC) with coulomb counting
- Charge phase detection (CV/float)
- CPU temperature and load
- 24-hour sparklines with 5-minute resolution

### Systemd Services
- `esp-logger.service`: Continuous Python service reading ESP32 serial data
- `power-collector.timer`: Runs power-collector.js every 5 minutes
- `weather-collector.timer`: Runs weather-collector.js hourly
- `calendar-collector.timer`: Runs calendar-collector.js hourly
- `data-orchestrator.timer`: Runs data-orchestrator.js every 2 minutes

## Git Workflow

**Always create pull requests instead of pushing directly to main.** Create a feature branch, commit changes, push the branch, and open a PR for review.

```bash
git checkout -b feature/description
# make changes
git add . && git commit -m "Description"
git push -u origin feature/description
gh pr create --title "Title" --body "Description"
```

## Deployment

### Two Deployment Workflows

1. **Site Deployment** (`.github/workflows/deploy-site.yml`)
   - Triggered on push to main (except ansible/** changes)
   - Builds Hugo site with image dithering
   - Rsync deploys to `/var/www/html/` on sol server
   - Rsync deploys collectors to `/opt/sequoia_fabrica_blog/collectors/`
   - Restarts collector services

2. **Infrastructure Deployment** (`.github/workflows/deploy-infrastructure.yml`)
   - Triggered on changes to `ansible/**` or `collectors/systemd/**`
   - Runs Ansible playbook (`ansible/sol.yml`) to configure server
   - Manages: NGINX, systemd services, user permissions, Tailscale, Cloudflare tunnel

### Server Details
- **Host**: sol (Raspberry Pi running DietPi)
- **Access**: Via Tailscale (sol.cloudforest-perch.ts.net or 100.91.222.51)
- **Public URL**: https://sequoia.garden (via Cloudflare tunnel)
- **Deploy user**: sol (in monitoring group for collector permissions)
- **Service user**: monitoring (runs collector services)

### Key Directories on Server
- `/var/www/html/`: Static site root (served by NGINX)
- `/var/www/html/api/`: Generated JSON API files
- `/opt/sequoia_fabrica_blog/`: Collector scripts and ESP logger
- `/var/log/monitoring/`: Collector log files (power_metrics.jsonl, etc.)
- `/var/log/esp_logger/`: ESP32 serial data log
