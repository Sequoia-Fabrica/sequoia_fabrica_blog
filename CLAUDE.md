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