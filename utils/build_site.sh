#!/bin/bash
set -e;
# © 2023 Roel Roscam Abbing, released as AGPLv3
# see https://www.gnu.org/licenses/agpl-3.0.html
# Support your local low-tech magazine: https://solar.lowtechmagazine.com/donate/
# Updated 2025 by Camille Teicheira for Sequioa Fabrica

# Default values
baseURL="//localhost:9000" #the URL of the website e.g. https://solar.lowtechmagazine.com/
repoDir="$(pwd)"
contentDir="$repoDir/content"
outputDir="$(pwd)/built-site"

# Parse named arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --baseURL*|--baseURL)
        if [[ "$1" == *=* ]]; then baseURL="${1#*=}"; else shift; baseURL="$1"; fi;;
        --repoDir*|--repoDir)
            if [[ "$1" == *=* ]]; then repoDir="${1#*=}"; else shift; repoDir="$1"; fi
        contentDir="$repoDir/content";;
        --contentDir*|--contentDir)
        if [[ "$1" == *=* ]]; then contentDir="${1#*=}"; else shift; contentDir="$1"; fi;;
        --outputDir*|--outputDir)
        if [[ "$1" == *=* ]]; then outputDir="${1#*=}"; else shift; outputDir="$1"; fi;;
        --help*|--help)
            echo "Usage: $(basename "$0") [options]"
            echo ""
            echo "Options:"
            echo "  --baseURL=<url>       Set the base URL of the website (default: //localhost:9000)"
            echo "  --repoDir=<path>      Set the repository directory (default: current working directory)"
            echo "  --contentDir=<path>   Set the content directory (default: <repoDir>/content)"
            echo "  --outputDir=<path>    Set the output directory (default: <current working directory>/built-site)"
            echo "  --help                Display this help message"
        exit 0;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

echo "Building site with the following parameters:"
echo "baseURL: $baseURL"
echo "repoDir: $repoDir"
echo "contentDir: $contentDir"
echo "outputDir: $outputDir"
echo ""

now=`date`
now_seconds=`date +%s`

mkdir -p "$outputDir"

echo "$updated"
echo "Rebuilding the site"

cd "$repoDir"

echo "Dithering new images"

python3 utils/dither_images.py -d "$contentDir" --preserve-color

echo "Generating site"
hugo --baseURL "$baseURL" --destination "$outputDir" --ignoreCache --environment production --minify

echo "Calculating page sizes"
python3 utils/calculate_size.py --directory "$outputDir" --baseURL "$baseURL"

echo "Removing original media from" "$outputDir"
python3 utils/clean_output.py --directory "$outputDir"

after_seconds=`date +%s`
time_elapsed=$(( $after_seconds - $now_seconds ))
echo "Site generation took $time_elapsed seconds"
