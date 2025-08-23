# [Solar v.2](https://github.com/lowtechmag/solar_v2) for Sequioa Fabrica

- Rebuild of [Low-tech Magazine's Solar theme with Hugo](https://github.com/lowtechmag/solar_v2)
- Updated for the Sequioa Fabrica usecase:
  - removed localization to reduce complexity
  - blog is now just a component of website, instead of main focus
  - added an events calendar
  - update to build scripts to be more generalized
  - builds + deploys static site with github actions
  - **NEW**: Integrated Pages CMS for easy content management

Requires [Hugo 0.145](https://gohugo.io/) or newer!

## Quick Start

- **Content Management**: Use [Pages CMS](https://app.pagescms.org/) for easy content editing (no Git knowledge required)
- **Configuration**: The `.pages.yml` file is already configured and ready to use
- **Local Development**: Run `hugo server` to start the local development server
- **Ready to Go**: Just open your repository in Pages CMS to start managing content!
- **No Setup Required**: Everything is configured and ready for immediate use

### 🚀 **Quick Access to Pages CMS**

**[📝 Open Pages CMS Now](https://app.pagescms.org/)** - Click to start managing content!

**Steps to access your site:**

1. Click the button above
2. Sign in with your GitHub account
3. Select your `sequoia_fabrica_blog` repository
4. Start editing content immediately!

## Project Structure

```
sequoia_fabrica_blog/
├── .pages.yml                 # Pages CMS configuration (ready to use!)
├── hugo.toml                  # Hugo site configuration
├── content/                   # Content files (posts, pages)
│   ├── posts/                # Blog posts
│   ├── about/                # Static pages
│   └── ...
├── layouts/                   # Hugo templates
├── static/                    # Static assets
└── utils/                     # Build and utility scripts
```

**Note**: The `.pages.yml` file contains the complete Pages CMS configuration for your Hugo site, including content types, media management, and field definitions. The configuration can be customized further if needed and supports adding new content types and fields.

## Local Development

Install Hugo: <https://gohugo.io/installation/>

```bash
# run local server -- will rebuild on local code change
hugo server
```

## Adding pages and writing posts

### Option 1: Using Pages CMS (Recommended)

**[📝 Open Pages CMS](https://app.pagescms.org/)** - Click to start managing content!

We've integrated [Pages CMS](https://pagescms.org/) for easy content management:

1. **Access Pages CMS**: Open your repository in Pages CMS to manage content through an intuitive interface
2. **Edit Content**: Use the web-based editor to create and edit blog posts, pages, and manage media
3. **Media Management**: Upload and organize images through the integrated media browser
4. **No Git Knowledge Required**: Perfect for content editors who prefer a visual interface

The Pages CMS configuration (`.pages.yml`) is already set up and ready to use.

### Option 2: Manual Markdown Editing

There is a handy guide for manual editing!

- If running locally, check out [http://localhost:1313/article-template-how-to](http://localhost:1313/article-template-how-to)
- Raw markdown at [content/article-template-how-to/index.md](./content/article-template-how-to/index.md)

### working with images

It's helpful to resize all images to max 800x800 before committing them to github (`sips -Z 800 *.jpeg`). It's also nice to remove exif data which may contain location and other sensitive information: `exiftool -overwrite_original -all= <image.jpg>`

## Authors

This site builds custom taxonomy for `Authors` which can be accessed via `http://localhost:1313/authors/`. Individual data about each author can be written in `content/authors/authorname/index.md`

**Note**: Authors can now be managed through Pages CMS as well, making it easier to maintain author information.

## Pages CMS Integration

The Pages CMS configuration (`.pages.yml`) is based on the [official Pages CMS documentation](https://pagescms.org/docs/configuration/) and is fully configured for your Hugo site structure and content types. It's production-ready and has been tested with your current Hugo setup. The configuration includes all necessary content types, media management, and field definitions for your site. You can start using Pages CMS immediately without any additional configuration. The CMS is fully integrated with your Hugo build and deployment pipeline.

### Getting Started with Pages CMS

1. **Repository Setup**: The `.pages.yml` configuration file is already configured for your Hugo site
2. **Access**: Open your repository in [Pages CMS](https://app.pagescms.org/) to start managing content
3. **Content Types**: The CMS is configured for:
   - **Blog Posts**: Full collection management with categories, tags, and authors
   - **Static Pages**: About, Membership, Contact, FAQ, Partner, and Power pages
   - **Media Management**: Post images and icons with proper categorization

### Creating Blog Posts with Pages CMS

1. **Navigate to Posts**: In Pages CMS, click on "Blog Posts" in the sidebar
2. **Create New Post**: Click "New Entry" to create a new blog post
3. **Fill Required Fields**:
   - **Title**: The main title of your post
   - **Date**: Publication date
   - **Summary**: Brief description (optional but recommended)
   - **Content**: Main post content using the rich text editor
4. **Optional Fields**:
   - **Authors**: Add one or more author names
   - **Tags**: Add relevant tags for categorization
   - **Categories**: Select appropriate categories
   - **Featured Image**: Upload or select a main image
   - **Draft Status**: Mark as draft if not ready to publish
5. **Save & Publish**: Save your changes and the post will be automatically built and deployed

### Benefits of Pages CMS

- **Visual Interface**: No need to write markdown or understand Git
- **Media Management**: Easy image uploads and organization
- **Content Validation**: Ensures all required fields are filled
- **Collaboration**: Multiple editors can work on content simultaneously
- **Version Control**: All changes are tracked through Git commits
- **Production Ready**: Fully integrated with your Hugo build and deployment pipeline
- **Tested & Verified**: Configuration has been tested and is ready for production use

# Deploys and Github Actions

Deploys happen automatically when PRs are merged to main.

There are currently 3 GitHub Actions that run:

1. ✅ **`Test build hugo site`** - runs on every commit to ensure the site builds without errors
2. ✅ **`Build and deploy site`** - builds and deploys the site to the main domain (fully operational)
3. ✅ **`Deploy Hugo site to Pages`** - builds the site for GitHub Pages as a preview site

All GitHub Actions are now working and fully operational!

# Additional utilities

In `utils` there are various utilities to be used before or after site rendering.

### Installation & Depedencies

depends on

- [Pillow](https://pillow.readthedocs.io) (for `dither_images.py`)
- [hitherdither](https://github.com/hbldh/hitherdither) (for `dither_images.py`)
- [beautifulsoup](https://www.crummy.com/software/BeautifulSoup/bs4/doc/) (for `calculate_size.py`)
- [lxml](https://lxml.de/) (for `calculate_size.py`)

`pip install -r utils/requirements.txt`

## dithering tool

`dither_images.py` recursively traverses folders and creates dithered versions of the images it finds. It also reduces the size of all images to 800x800. These are stored in the same folder as the images in a folder called "dithers".

#### TODO

- bug: images taller than wide are rotated when the 800x800 thumbnail is made
- bug: images smaller than 800x800 are scaled _up_
- bug: pngs with transparency turn transparent areas black
- feature: configurable image size

### Usage

Dither all the images found in the subdirectories of `content` as grayscale:
`python3 utils/dither_images.py --directory content/`

Preserve the colors of the images when dithering (results in images that are 2-3x the size of the grayscale ones, but still smaller than originals):
`python3 utils/dither_images.py --directory content/ --preserve-color`

Run the script with more debug output:
`python3 utils/dither_images.py --directory content/ --colorize-by-category --verbose`

Remove all dithered files in the subdirectories of `content`:
`python3 utils/dither_images.py --remove --directory content/`

```
❯ python3 utils/dither_images.py --help
usage:
        This script recursively traverses folders and creates dithered versions of the images it finds.
        These are stored in the same folder as the images in a folder called "dithers".

       [-h] [-d DIRECTORY] [-rm] [-c] [-p] [-v]

options:
  -h, --help            show this help message and exit
  -d DIRECTORY, --directory DIRECTORY
                        Set the directory to traverse
  -rm, --remove         Removes all the folders with dithers and their contents
  -c, --colorize-by-category
                        Colorizes grayscale dithered images by category
  -p, --preserve-color  Preserve the color of the original image -- do not grayscale
  -v, --verbose         Print out more detailed information about what this script is doing
```

## Page Size Calculator

This script recursively traverses folders and enumerates the file size of all html pages and associated media.
The calculated total file size is then added to the HTML page. The script looks for a `div` with class `page-size` to add the page metadata in to. This div is currently found in `layouts/partials/footer.html`

This script should be run _after_ the site has been generated on the resulting files. It is a post-processing step.
In the case of Hugo, this is usually the directory called `public`. Add the baseurl that you also use in production:

```bash
❯ python3 utils/calculate_size.py --help
usage:
    This script recursively traverses folders and enumerates the file size of all html pages and associated media.
    The calculated total file size is then added to the HTML page.

       [-h] [-d DIRECTORY] [-rm] [-b BASEURL] [-v]

options:
  -h, --help            show this help message and exit
  -d DIRECTORY, --directory DIRECTORY
                        Set the directory to traverse
  -rm, --remove         Removes all the folders with dithers and their contents
  -b BASEURL, --baseURL BASEURL
                        hostname (and path) to the root, e.g. https://solar.lowtechmagazine.com
  -v, --verbose         Print out more detailed information about what this script is doing
```

## build_site.sh

This is a script to build the hugo site and run the various support scripts. It assumes you generate and deploy the site on the same machine.

It can be used in `cron` to make a daily build at 12:15 and log the output.

`15 12 * * * /bin/bash /path/to/repo/utils/build_site.sh > /path/to/build.log 2>&1`

```bash
❯ ./utils/build_site.sh --help
Usage: build_site.sh [options]

Options:
  --baseURL=<url>       Set the base URL of the website (default: //localhost:9000)
  --repoDir=<path>      Set the repository directory (default: current working directory)
  --contentDir=<path>   Set the content directory (default: <repoDir>/content)
  --outputDir=<path>    Set the output directory (default: <current working directory>/built-site)
  --help                Display this help message
```

# Contributions

Updates for Sequioa Fabrica made by

- [Camille Teicheira](http://camilleanne.com)
- [Ryan Orban](https://ryanorban.com)
- **NEW**: Pages CMS integration and configuration
- **NEW**: Updated power supply and demand sections with live data

The Solar v.2 theme was made by

- [Marie Otsuka](https://motsuka.com/)
- [Roel Roscam Abbing](https://test.roelof.info)
- [Marie Verdeil](https://verdeil.net/)

With contributions by

- [Erhard Maria Klein](http://www.weitblick.de/)

# Donations

If Low-Tech Magazine or this theme has been useful to your work, please support us by making a one time donation [through Paypal](https://www.paypal.com/paypalme/lowtechmagazine) or a recurring one [through Patreon](https://solar.lowtechmagazine.com/donate/)
