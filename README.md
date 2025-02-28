# LinkedIn Comment Scraper Chrome Extension

A Chrome extension that allows you to scrape comments from LinkedIn posts and export them as a CSV file.

## Features

- Scrape comments from LinkedIn posts
- Export comments as a CSV file with the following data:
  - Commenter's name
  - Commenter's LinkedIn profile URL
  - Comment text

## Installation

1. Download or clone this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The LinkedIn Comment Scraper extension should now be installed and visible in your extensions list

## Usage

1. Navigate to a LinkedIn post with comments
2. Click on the LinkedIn Comment Scraper extension icon in your browser toolbar
3. Click the "Scrape Comments" button in the popup
4. Wait for the scraping process to complete
5. The CSV file will be automatically downloaded to your computer

## Troubleshooting

If the extension doesn't work as expected, it might be due to changes in LinkedIn's DOM structure. Here are some tips:

1. Make sure you're on a LinkedIn post page with comments
2. Check the browser console for any error messages
3. LinkedIn's DOM structure might have changed. You may need to update the selectors in the `popup.js` file:
   - Look for the `scrapeLinkedInComments` function
   - Update the selectors (e.g., `.comments-comment-item`, `.comments-post-meta__name-text span`, etc.) to match LinkedIn's current DOM structure

## License

This project is licensed under the MIT License - see the LICENSE file for details. 