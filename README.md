# [Solar v.2](https://github.com/lowtechmag/solar_v2) for Sequioa Fabrica

- Rebuild of [Low-tech Magazine's Solar theme with Hugo](https://github.com/lowtechmag/solar_v2)
- Updated for the Sequioa Fabrica usecase:
  - removed localization to reduce complexity
  - blog is now just a component of website, instead of main focus
  - added an events calendar
  - update to build scripts to be more generalized
  - builds + deploys static site with github actions

Requires [Hugo 0.145](https://gohugo.io/) or newer!

## Local Development
Install Hugo: https://gohugo.io/installation/

```bash
# run local server -- will rebuild on local code change
hugo server
```

## Adding pages and writing posts
There is a handy guide! 

- If running locally, check out [http://localhost:1313/article-template-how-to](http://localhost:1313/article-template-how-to)
- raw markdown at [content/article-template-how-to/index.md](./content/article-template-how-to/index.md)

### working with images:

It's helpful to resize all images to max 800x800 before committing them to github (`sips -Z 800 *.jpeg`). It's also nice to remove exif data which may contain location and other sensitive information: `exiftool -overwrite_original -all= <image.jpg>`

## Authors

This site builds custom taxonomy for `Authors` which can be accessed via `http://localhost:1313/authors/`. Individual data about each author can be written in `content/authors/authorname/index.md`


# Deploys and Github Actions

Deploys will/do happen when PRs are merged to main.

There are currently 3 Github actions that run:
1. `Test build hugo site` - runs on every commit -- makes sure that the site builds and that no errors have been introduced
2. _IN DEVELOPMENT_ `Build and deploy site` -- will be the action that will build the site and deploy it to the main domain. Currently doesn't do any deploy because we still need to get a permanent ip address for the board (in other words, install the solar and power system).
3. _IN DEVELOPMENT_ `Deploy Hugo site to Pages` -- is a temporary task that builds the site for github pages as a sort of preview/eval site. Will be replaced by action 2.

# Additional utilities

In `utils` there are various utilities to be used before or after site rendering. 

### Installation & Depedencies

depends on 
* [Pillow](https://pillow.readthedocs.io) (for `dither_images.py`)
* [hitherdither](https://github.com/hbldh/hitherdither) (for `dither_images.py`)
* [beautifulsoup](https://www.crummy.com/software/BeautifulSoup/bs4/doc/) (for `calculate_size.py`)
* [lxml](https://lxml.de/) (for `calculate_size.py`)

`pip install -r utils/requirements.txt`

## dithering tool

`dither_images.py` recursively traverses folders and creates dithered versions of the images it finds. It also reduces the size of all images to 800x800. These are stored in the same folder as the images in a folder called "dithers".

#### TODO:
* bug: images taller than wide are rotated when the 800x800 thumbnail is made
* bug: images smaller than 800x800 are scaled _up_
* bug: pngs with transparency turn transparent areas black
* feature: configurable image size

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

This script should be run *after* the site has been generated on the resulting files. It is a post-processing step.
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
* [Camille Teicheira](http://camilleanne.com)

The Solar v.2 theme was made by

* [Marie Otsuka](https://motsuka.com/)
* [Roel Roscam Abbing](https://test.roelof.info)
* [Marie Verdeil](https://verdeil.net/)

With contributions by
* [Erhard Maria Klein](http://www.weitblick.de/)

# Donations

If Low-Tech Magazine or this theme has been useful to your work, please support us by making a one time donation [through Paypal](https://www.paypal.com/paypalme/lowtechmagazine) or a recurring one [through Patreon](https://solar.lowtechmagazine.com/donate/) 
