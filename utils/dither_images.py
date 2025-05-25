# image dithering script
# © 2022 Roel Roscam Abbing, released as AGPLv3
# see https://www.gnu.org/licenses/agpl-3.0.html
# Support your local low-tech magazine: https://solar.lowtechmagazine.com/donate.html
# Updated 2025 by Camille Teicheira for Sequioa Fabrica

import argparse
import logging
import math
import os
import shutil
from dataclasses import dataclass
from enum import Enum
from typing import Tuple

import hitherdither
from PIL import Image, ImageOps


@dataclass
class ColorSettings:
    posterize = 3
    max_palette_size = 80


@dataclass
class CategoryEnum(Enum):
    low_tech = "low-tech"
    obsolete = "obsolete"
    high_tech = "high-tech"
    grayscale = "grayscale"


def colorize(source_image, category):
    """
    Picks a colored dithering palette based on the post category.
    # TODO: update this for a non-low-tech magazine use case
    """

    colors = {
        "low-tech": hitherdither.palette.Palette(
            [
                (30, 32, 40),
                (11, 21, 71),
                (57, 77, 174),
                (158, 168, 218),
                (187, 196, 230),
                (243, 244, 250),
            ]
        ),
        "obsolete": hitherdither.palette.Palette(
            [
                (9, 74, 58),
                (58, 136, 118),
                (101, 163, 148),
                (144, 189, 179),
                (169, 204, 195),
                (242, 247, 246),
            ]
        ),
        "high-tech": hitherdither.palette.Palette(
            [
                (86, 9, 6),
                (197, 49, 45),
                (228, 130, 124),
                (233, 155, 151),
                (242, 193, 190),
                (252, 241, 240),
            ]
        ),
        "grayscale": hitherdither.palette.Palette(
            [
                (25, 25, 25),
                (75, 75, 75),
                (125, 125, 125),
                (175, 175, 175),
                (225, 225, 225),
                (250, 250, 250),
            ]
        ),
    }

    if category:
        for i in colors.keys():
            if i in category.lower():
                color = colors[i]
                logging.info(f"Applying color palette '{i}' for {category}")
                break
            else:
                logging.info(f"No category for {source_image}, {category}")
                color = colors["grayscale"]

    else:
        logging.info(f"No category for {source_image}, {category}")
        color = colors["grayscale"]

    return color


def dither_image(
    source_image: str,
    output_image: str,
    colorize_by_category: CategoryEnum = None,
    color_settings: ColorSettings = None,
    method="bayer",
    thumbnail_size: Tuple[int] = (800, 800),
):
    # see hitherdither docs for different dithering algos and settings
    try:
        img = Image.open(source_image)
        if img.has_transparency_data:
            img = img.convert("RGBA")
            background = Image.new("RGBA", img.size, (255, 255, 255))
            alpha_composite = Image.alpha_composite(background, img)
            img = alpha_composite.convert("RGB")
        else:
            img = img.convert("RGB")

        # make image smaller
        img.thumbnail(thumbnail_size, Image.LANCZOS)

        if colorize_by_category:
            palette = colorize(source_image, colorize_by_category)
        elif color_settings:
            simpleimg = ImageOps.posterize(img, color_settings.posterize)
            colors = [
                c[1]
                for c in sorted(simpleimg.getcolors(maxcolors=1000000), reverse=True)
            ]
            palette_size = min(
                math.floor(len(colors) / 2), color_settings.max_palette_size
            )
            palette = hitherdither.palette.Palette(colors[:palette_size])
        else:
            palette = hitherdither.palette.Palette(
                [
                    (25, 25, 25),
                    (75, 75, 75),
                    (125, 125, 125),
                    (175, 175, 175),
                    (225, 225, 225),
                    (250, 250, 250),
                ]
            )

        if method == "bayer":
            threshold = [50, 50, 50]
            img_dithered = hitherdither.ordered.bayer.bayer_dithering(
                img, palette, threshold, order=8
            )
        else:
            img_dithered = hitherdither.diffusion.error_diffusion_dithering(
                img, palette, method=method, order=2
            )

        if colorize_by_category:
            img_dithered = colorize(img_dithered, category)
            logging.debug(f"Created {img_dithered} in category {category}")

        img_dithered.save(output_image, optimize=True)
        logging.info(
            f"🖼 dithered {os.path.basename(source_image)}; saved to {output_image}"
        )

    except Exception as e:
        print("err")
        logging.warning("❌ failed to convert {}".format(source_image))
        logging.warning(e)


def delete_dithers(content_dir):
    logging.info("Deleting 'dither' folders in {} and below".format(content_dir))
    for root, dirs, files in os.walk(content_dir, topdown=True):
        if root.endswith("dithers"):
            shutil.rmtree(root)
            logging.info("Removed {}".format(root))


def parse_front_matter(md):
    with open(md) as f:
        contents = f.readlines()
        cat = None
        for l in contents:
            if l.startswith("categories: "):
                cat = l.split("categories: ")[1]
                cat = cat.strip("[")
                cat = cat.strip()
                cat = cat.strip("]")

                logging.debug("Categories: {} from {}".format(cat, l.strip()))
        return cat


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        """
        This script recursively traverses folders and creates dithered versions of the images it finds.
        These are stored in the same folder as the images in a folder called "dithers".
        """
    )

    parser.add_argument(
        "-d", "--directory", help="Set the directory to traverse", default="."
    )

    parser.add_argument(
        "-rm",
        "--remove",
        help="Removes all the folders with dithers and their contents",
        action="store_true",
    )

    parser.add_argument(
        "-c",
        "--colorize-by-category",
        help="Colorizes grayscale dithered images by category",
        action="store_true",
    )

    parser.add_argument(
        "-p",
        "--preserve-color",
        help="Preserve the color of the original image -- do not grayscale",
        action="store_true",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        help="Print out more detailed information about what this script is doing",
        action="store_true",
    )

    parser.add_argument(
        "-o",
        "--overwrite",
        help="Overwrite dithers if they already exist",
        action="store_true",
    )

    parser.add_argument(
        "-ft",
        "--file-type",
        help="Output filetype for images",
        default="png",
        choices=["png", "webp"],
    )

    parser.add_argument(
        "-ms",
        "--max-size",
        help="Maximum width and height of the dithered image in pixels",
        default=800,
    )

    args = parser.parse_args()

    image_ext = [".jpg", ".JPG", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".bmp"]

    content_dir = args.directory

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    exclude_dirs = set(["dithers"])

    logging.info(f"Dithering all images in {content_dir} and subfolders")
    logging.debug(f"excluding directories: {''.join(exclude_dirs)}")

    prev_root = None

    image_count = {"dithered": 0, "total": 0}
    if args.remove:
        delete_dithers(os.path.abspath(content_dir))
    else:
        for root, dirs, files in os.walk(os.path.abspath(content_dir), topdown=True):
            logging.debug(f"Checking next folder {root}")

            dirs[:] = [d for d in dirs if d not in exclude_dirs]

            category = None
            if prev_root is None:
                prev_root = root

            if prev_root is not root:
                if files:
                    if any(x.endswith(tuple(image_ext)) for x in files):
                        if not os.path.exists(os.path.join(root, "dithers")):
                            os.mkdir(os.path.join(root, "dithers"))
                            logging.info(f"📁 created in {root}")

            if args.colorize_by_category:
                # iterate over md files to find one with a category
                if not category:
                    for i in os.listdir(root):
                        if i.startswith("index"):
                            category = parse_front_matter(os.path.join(root, i))
                            break

            for fname in files:
                if fname.endswith(tuple(image_ext)):
                    file_, ext = os.path.splitext(fname)
                    source_image = os.path.join(root, fname)
                    output_image = os.path.join(
                        os.path.join(root, "dithers"),
                        file_ + f"_dithered.{args.file_type}",
                    )
                    if not os.path.exists(output_image) or args.overwrite:
                        image_count["dithered"] += 1
                        image_count["total"] += 1
                        dither_image(
                            source_image=source_image,
                            output_image=output_image,
                            colorize_by_category=category,
                            color_settings=ColorSettings()
                            if args.preserve_color
                            else None,
                            thumbnail_size=(int(args.max_size), int(args.max_size)),
                        )

                    else:
                        image_count["total"] += 1
                        logging.debug(f"Dithered version of {fname} found, skipping")

            prev_root = root

    logging.info(
        f"Done dithering. Dithered {image_count['dithered']}/{image_count['total']} images."
    )
