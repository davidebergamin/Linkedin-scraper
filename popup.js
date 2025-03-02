document.addEventListener("DOMContentLoaded", () => {
  const scrapeButton = document.getElementById("scrapeButton");
  const stopButton = document.getElementById("stopButton");
  const downloadButton = document.getElementById("downloadButton");
  const sheetsButton = document.getElementById("sheetsButton");
  const actionButtons = document.getElementById("actionButtons");
  const statusText = document.getElementById("status");
  const resultSummary = document.getElementById("resultSummary");
  const keywordInput = document.getElementById("keywordInput");
  const loadingSpinner = document.getElementById("loadingSpinner");
  const logContent = document.getElementById("logContent");
  
  // Store scraped comments for later download
  let scrapedComments = [];
  let filteredComments = [];
  let currentKeyword = "";
  let isScrapingInProgress = false;
  let shouldStopScraping = false;
  
  // Function to log information
  function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    logContent.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    logContent.scrollTop = logContent.scrollHeight;
    console.log(message);
  }
  
  // Clear log
  function clearLog() {
    logContent.innerHTML = "";
  }
  
  // Download button click handler
  downloadButton.addEventListener("click", () => {
    if (filteredComments.length > 0) {
      log("Downloading CSV file...");
      const csv = convertToCSV(filteredComments);
      downloadCSV(csv, currentKeyword ? `linkedin_comments_${currentKeyword}.csv` : "linkedin_comments.csv");
      statusText.textContent = "CSV file downloaded!";
    } else {
      statusText.textContent = "No comments to download.";
    }
  });
  
  // Google Sheets button click handler
  sheetsButton.addEventListener("click", () => {
    if (filteredComments.length > 0) {
      log("Opening data in Google Sheets...");
      const csv = convertToCSV(filteredComments);
      openInGoogleSheets(csv);
      statusText.textContent = "Data opened in Google Sheets!";
    } else {
      statusText.textContent = "No comments to open in Google Sheets.";
    }
  });
  
  // Stop button click handler
  stopButton.addEventListener("click", () => {
    if (isScrapingInProgress) {
      shouldStopScraping = true;
      log("Stopping scraping process...");
      statusText.textContent = "Stopping scraping...";
    }
  });

  scrapeButton.addEventListener("click", async () => {
    // Reset UI
    actionButtons.style.display = "none";
    stopButton.style.display = "inline-block";
    resultSummary.style.display = "none";
    scrapedComments = [];
    filteredComments = [];
    clearLog();
    
    // Reset control flags
    isScrapingInProgress = true;
    shouldStopScraping = false;
    
    const keyword = keywordInput.value.trim().toLowerCase();
    currentKeyword = keyword;
    statusText.textContent = "Scraping comments...";
    loadingSpinner.style.display = "block"; // Show spinner
    
    log("Starting comment scraping process...");
    if (keyword) {
      log(`Will filter comments by keyword: "${keyword}"`);
    }

    try {
      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      log(`Scraping from: ${tab.url}`);

      // Check if the tab is a LinkedIn page
      if (!tab.url.includes("linkedin.com")) {
        statusText.textContent = "Please open a LinkedIn post page.";
        log("Error: Not a LinkedIn page");
        loadingSpinner.style.display = "none"; // Hide spinner
        stopButton.style.display = "none";
        isScrapingInProgress = false;
        return;
      }

      // First, scroll to load all comments
      statusText.textContent = "Scrolling to load all comments...";
      log("Scrolling to load all comments...");
      
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { 
          action: "scrollToLoadComments", 
          debugMode: true 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error:", chrome.runtime.lastError);
            log(`Error: ${chrome.runtime.lastError.message}`);
            statusText.textContent = "Error communicating with the page. Please refresh and try again.";
            loadingSpinner.style.display = "none"; // Hide spinner
            stopButton.style.display = "none";
            isScrapingInProgress = false;
            reject(chrome.runtime.lastError);
          } else if (response && response.status === "complete") {
            log(`Scrolling complete. ${response.stats ? `Clicked ${response.stats.totalButtonsClicked} buttons.` : ""}`);
            statusText.textContent = "Comments loaded. Now scraping...";
            resolve();
          } else if (response && response.status === "stopped") {
            log("Scrolling stopped by user.");
            statusText.textContent = "Scraping stopped by user.";
            loadingSpinner.style.display = "none";
            stopButton.style.display = "none";
            isScrapingInProgress = false;
            reject(new Error("Scraping stopped by user"));
          } else {
            log("Unknown response from content script");
            statusText.textContent = "Error: Unknown response from content script";
            loadingSpinner.style.display = "none"; // Hide spinner
            stopButton.style.display = "none";
            isScrapingInProgress = false;
            reject(new Error("Unknown response from content script"));
          }
        });
        
        // Set up a listener for the stop button during scrolling
        const checkStopInterval = setInterval(() => {
          if (shouldStopScraping) {
            clearInterval(checkStopInterval);
            chrome.tabs.sendMessage(tab.id, { action: "stopScrolling" });
          }
        }, 500);
      }).catch(error => {
        log(`Error: ${error.message}`);
        if (error.message === "Scraping stopped by user") {
          return; // Exit early if stopped by user
        }
      });
      
      // Check if scraping was stopped
      if (shouldStopScraping) {
        log("Scraping process stopped by user.");
        statusText.textContent = "Scraping stopped.";
        loadingSpinner.style.display = "none";
        stopButton.style.display = "none";
        isScrapingInProgress = false;
        return;
      }

      // Now execute the scraper function
      log("Extracting comments...");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapeLinkedInComments,
        args: [true] // Always enable debug mode for the scraper
      });

      if (chrome.runtime.lastError) {
        statusText.textContent = "Error: " + chrome.runtime.lastError.message;
        log(`Scraping error: ${chrome.runtime.lastError.message}`);
        loadingSpinner.style.display = "none"; // Hide spinner
        stopButton.style.display = "none";
        isScrapingInProgress = false;
        return;
      }

      const result = results[0].result;
      scrapedComments = result.comments || [];
      
      // Apply keyword filtering if provided
      filteredComments = [...scrapedComments];
      if (keyword && filteredComments.length > 0) {
        log(`Filtering ${filteredComments.length} comments by keyword: "${keyword}"`);
        filteredComments = filteredComments.filter(comment => 
          (comment.commentText && comment.commentText.toLowerCase().includes(keyword)) ||
          (comment.name && comment.name.toLowerCase().includes(keyword)) ||
          (comment.description && comment.description.toLowerCase().includes(keyword))
        );
        log(`Found ${filteredComments.length} comments matching the keyword`);
      }
      
      // Hide spinner and stop button now that processing is complete
      loadingSpinner.style.display = "none";
      stopButton.style.display = "none";
      isScrapingInProgress = false;
      
      // Update UI based on results
      if (scrapedComments.length === 0) {
        statusText.textContent = "No comments found.";
        resultSummary.style.display = "none";
        log("No comments found on this page.");
      } else if (filteredComments.length === 0) {
        statusText.textContent = "No comments match your filter.";
        resultSummary.textContent = `0 of ${scrapedComments.length} comments match "${keyword}"`;
        resultSummary.style.display = "block";
        log(`No comments match the keyword "${keyword}" out of ${scrapedComments.length} total comments`);
      } else {
        if (keyword) {
          statusText.textContent = "Comments scraped successfully!";
          resultSummary.textContent = `${filteredComments.length} of ${scrapedComments.length} comments match "${keyword}"`;
          resultSummary.style.display = "block";
          log(`Found ${filteredComments.length} comments matching "${keyword}" out of ${scrapedComments.length} total`);
        } else {
          statusText.textContent = "Comments scraped successfully!";
          resultSummary.textContent = `${scrapedComments.length} comments found`;
          resultSummary.style.display = "block";
          log(`Successfully scraped ${scrapedComments.length} comments`);
        }
        
        // Show action buttons
        actionButtons.style.display = "flex";
        
        // Log sample comment for debugging
        if (scrapedComments.length > 0) {
          const sampleComment = scrapedComments[0];
          log(`Sample data: Name: "${sampleComment.name}", Profile: "${sampleComment.profileUrl || 'None'}"`);
        }
        
        log("Scraping process completed successfully!");
      }
    } catch (error) {
      console.error("Error:", error);
      log(`Error: ${error.message}`);
      statusText.textContent = "An error occurred. Please try again.";
      loadingSpinner.style.display = "none"; // Hide spinner in case of error
      stopButton.style.display = "none";
      isScrapingInProgress = false;
    }
  });
});

// Function to convert comments array to CSV
function convertToCSV(comments) {
  const headers = "Name,Profile URL,Description,Comment\n";
  const rows = comments
    .map((comment) => {
      // Escape commas and quotes in the text fields
      const name = comment.name ? comment.name.replace(/"/g, '""') : "Unknown";
      const profileUrl = comment.profileUrl || "";
      const description = comment.description ? comment.description.replace(/"/g, '""') : "";
      const commentText = comment.commentText ? comment.commentText.replace(/"/g, '""') : "";
      return `"${name}","${profileUrl}","${description}","${commentText}"`;
    })
    .join("\n");
  return headers + rows;
}

// Function to trigger CSV download
function downloadCSV(csvContent, fileName) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: fileName,
    saveAs: true,
  });
}

// Function to open data in Google Sheets
function openInGoogleSheets(csvContent) {
  // Create a Blob with the CSV data
  const blob = new Blob([csvContent], { type: 'text/csv' });
  
  // Create a temporary URL for the blob
  const url = URL.createObjectURL(blob);
  
  // Download the CSV file first
  const tempFileName = `linkedin_comments_temp_${Date.now()}.csv`;
  
  chrome.downloads.download({
    url: url,
    filename: tempFileName,
    saveAs: false
  }, (downloadId) => {
    // After download completes, open Google Sheets import page
    chrome.tabs.create({ 
      url: 'https://docs.google.com/spreadsheets/u/0/create' 
    }, (tab) => {
      // Wait for the Google Sheets tab to load
      setTimeout(() => {
        // Send message to the content script to show import instructions
        chrome.tabs.sendMessage(tab.id, { 
          action: "showImportInstructions",
          fileName: tempFileName
        });
      }, 2000);
    });
  });
}

// Function to trigger the file import dialog in Google Sheets
function triggerFileImport() {
  // Create a message to guide the user
  const messageDiv = document.createElement('div');
  messageDiv.style.position = 'fixed';
  messageDiv.style.top = '50%';
  messageDiv.style.left = '50%';
  messageDiv.style.transform = 'translate(-50%, -50%)';
  messageDiv.style.backgroundColor = 'white';
  messageDiv.style.padding = '20px';
  messageDiv.style.borderRadius = '8px';
  messageDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  messageDiv.style.zIndex = '9999';
  messageDiv.style.maxWidth = '400px';
  messageDiv.style.textAlign = 'center';
  
  messageDiv.innerHTML = `
    <h3 style="color: #0073b1; margin-top: 0;">Import LinkedIn Comments</h3>
    <p>To import your LinkedIn comments:</p>
    <ol style="text-align: left;">
      <li>Click on <strong>File > Import</strong> in the Google Sheets menu</li>
      <li>Select the <strong>Upload</strong> tab</li>
      <li>Click <strong>Select a file from your device</strong></li>
      <li>Navigate to your Downloads folder</li>
      <li>Select the file named <strong>linkedin_comments_temp_*.csv</strong></li>
    </ol>
    <button id="closeInstructions" style="background: #0073b1; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Got it</button>
  `;
  
  document.body.appendChild(messageDiv);
  
  // Add event listener to close button
  document.getElementById('closeInstructions').addEventListener('click', () => {
    messageDiv.remove();
  });
  
  // Try to trigger the import menu automatically
  try {
    // Find and click the File menu
    const fileMenuButton = document.querySelector('[aria-label="File"]');
    if (fileMenuButton) {
      fileMenuButton.click();
      
      // Wait for the menu to open and click Import
      setTimeout(() => {
        const importMenuItem = Array.from(document.querySelectorAll('span')).find(el => 
          el.textContent === 'Import' && el.closest('[role="menuitem"]')
        );
        if (importMenuItem) {
          importMenuItem.closest('[role="menuitem"]').click();
        }
      }, 500);
    }
  } catch (e) {
    console.error('Error triggering import dialog:', e);
  }
}

// Function to scrape LinkedIn comments
function scrapeLinkedInComments(debugMode = false) {
  // Array to store the scraped comments
  const comments = [];
  const logs = debugMode ? ["Starting comment scraping..."] : [];
  
  // Log helper function
  const log = (message) => {
    if (debugMode) logs.push(message);
    console.log(message);
  };
  
  // Debug function to analyze profile URL extraction
  const debugProfileUrlExtraction = (element, index) => {
    if (!debugMode) return;
    
    try {
      log(`Debug profile URL extraction for comment ${index + 1}:`);
      
      // Check all selectors
      log(`Testing all profile URL selectors:`);
      profileUrlSelectors.forEach(selector => {
        try {
          const el = element.querySelector(selector);
          if (el) {
            log(`  Selector "${selector}" found element: ${el.tagName}`);
            if (el.href) {
              log(`    href: ${el.href}`);
              log(`    cleaned: ${cleanProfileUrl(el.href)}`);
            } else {
              log(`    No href attribute`);
            }
          }
        } catch (e) {
          // Ignore errors for individual selectors
        }
      });
      
      // Check all links in the element
      const allLinks = Array.from(element.querySelectorAll('a'));
      log(`Found ${allLinks.length} links in the comment element`);
      allLinks.slice(0, 5).forEach((link, i) => {
        log(`  Link ${i+1}: ${link.href || 'no href'} - Text: "${link.textContent.trim().substring(0, 30)}..."`);
      });
      
      // Check for data-control-name attributes
      const controlNameElements = Array.from(element.querySelectorAll('[data-control-name]'));
      log(`Found ${controlNameElements.length} elements with data-control-name attribute`);
      controlNameElements.slice(0, 5).forEach((el, i) => {
        log(`  Element ${i+1}: data-control-name="${el.getAttribute('data-control-name')}" - Tag: ${el.tagName}`);
      });
    } catch (e) {
      log(`Error in debug profile URL extraction: ${e.message}`);
    }
  };
  
  // Helper function to clean and normalize LinkedIn profile URLs
  const cleanProfileUrl = (url) => {
    if (!url) return "";
    
    try {
      // Remove tracking parameters and fragments
      let cleanUrl = url.split('?')[0].split('#')[0];
      
      // Make sure it's a LinkedIn profile URL
      if (!cleanUrl.includes('linkedin.com')) return "";
      
      // Extract the profile path
      const match = cleanUrl.match(/linkedin\.com\/(in\/[^\/]+|profile\/[^\/]+)/);
      if (match) {
        // Ensure the URL starts with https://
        if (!cleanUrl.startsWith('http')) {
          cleanUrl = 'https://' + cleanUrl.replace(/^\/\//, '');
        }
        
        // Normalize to www.linkedin.com
        cleanUrl = cleanUrl.replace(/https?:\/\/([\w-]+\.)?linkedin\.com/, 'https://www.linkedin.com');
        
        return cleanUrl;
      }
      
      return url.split('?')[0]; // Return original URL without parameters if no match
    } catch (e) {
      log(`Error cleaning profile URL: ${e.message}`);
      return url;
    }
  };
  
  try {
    log("Searching for comment elements...");
    
    // Now try different selectors for comments (LinkedIn's DOM structure might vary)
    const selectors = [
      // Common selectors for LinkedIn comments
      ".comments-comment-item",
      ".comments-comments-list__comment-item",
      ".comments-comment-social-activity",
      "article.comments-comment-item",
      ".comments-comments-list__comment-item-container",
      ".feed-shared-comment",
      ".comments-container .comments-comment-item-container",
      ".comments-container article",
      ".comments-comments-list article",
      ".comments-comment-meta",
      // Add more potential selectors here as LinkedIn updates their DOM
    ];
    
    let commentElements = [];
    let usedSelector = "";
    
    // Try each selector until we find comments
    for (const selector of selectors) {
      try {
        commentElements = document.querySelectorAll(selector);
        if (commentElements.length > 0) {
          log(`Found ${commentElements.length} comments with selector: ${selector}`);
          usedSelector = selector;
          break;
        }
      } catch (error) {
        log(`Error with selector ${selector}: ${error.message}`);
      }
    }
    
    // If no comments found with predefined selectors, try a more generic approach
    if (commentElements.length === 0) {
      log("No comments found with predefined selectors. Trying generic approach...");
      
      // Look for elements with "comment" in their class name
      const commentClassElements = Array.from(document.querySelectorAll('*[class*="comment"]'));
      log(`Found ${commentClassElements.length} elements with "comment" in class name`);
      
      if (commentClassElements.length > 0) {
        // Filter to likely comment containers
        commentElements = commentClassElements.filter(el => {
          // Check if it has text content and doesn't seem to be a button or input
          return el.textContent.trim().length > 0 && 
                 !el.tagName.match(/^(BUTTON|INPUT|TEXTAREA)$/i) &&
                 el.querySelectorAll('a, span').length > 0;
        });
        log(`Filtered to ${commentElements.length} likely comment elements`);
      }
    }
    
    if (commentElements.length === 0) {
      log("No comment elements found on the page.");
      return { comments: [], logs };
    }
    
    log(`Processing ${commentElements.length} comments...`);
    
    // Define selectors for name, profile URL, and comment text
    const nameSelectors = [
      ".comments-post-meta__name-text span",
      ".comments-post-meta__actor-link",
      ".feed-shared-actor__name",
      ".feed-shared-actor__title",
      "span.comments-comment-meta__description-title",
      ".comments-post-meta__name",
      ".update-components-actor__name",
      ".update-components-actor__title",
      // Add more selectors as needed
    ];
    
    const profileUrlSelectors = [
      ".comments-post-meta__name a",
      ".feed-shared-actor__container a",
      ".comments-post-meta__actor-link",
      ".update-components-actor__container a",
      "a.comments-post-meta__actor-link",
      "a.feed-shared-actor__container-link",
      "a.update-components-actor__container-link",
      "a.comments-comment-item__commenter-name-link",
      "a[data-control-name='comment_actor']",
      "a[data-control-name='actor']",
      // New selectors for better profile URL extraction
      ".comments-comment-meta__description-title a",
      ".comments-comment-meta__name a",
      ".comments-comment-meta a",
      ".comments-comment-meta__actor a",
      ".comments-comment-meta__actor-link",
      ".comments-comment-item__actor a",
      ".comments-comment-item__commenter a",
      ".comments-comment-item__commenter-info a",
      "a.artdeco-entity-lockup__title-link",
      "a.comments-comment-meta__actor-link",
      "a.comments-post-meta__profile-link",
      "a.feed-shared-comment-actor__container-link",
      "a.comments-comment-item__author-link",
      "a.comments-comment-item__name-link",
      "a.comments-comment-item__profile-link",
      "a.comments-comment-meta__name-link",
      "a.comments-comment-meta__profile-link",
      // Add more selectors as needed
    ];
    
    const commentTextSelectors = [
      ".comments-comment-item-content-body",
      ".feed-shared-comment-item__content",
      ".comments-comment-item__main-content",
      ".comments-comment-item-content-body span",
      "span[dir='ltr']",
      ".feed-shared-text",
      // Add more selectors as needed
    ];
    
    const descriptionSelectors = [
      ".comments-comment-meta__description-subtitle",
      ".feed-shared-actor__description",
      ".comments-post-meta__headline",
      ".comments-comment-item__commenter-headline",
      ".update-components-actor__description",
      // Add more selectors as needed
    ];
    
    // Process each comment element
    commentElements.forEach((element, index) => {
      try {
        log(`Processing comment ${index + 1}...`);
        
        // Extract name
        let name = "Unknown";
        for (const selector of nameSelectors) {
          try {
            const nameElement = element.querySelector(selector);
            if (nameElement && nameElement.textContent.trim()) {
              name = nameElement.textContent.trim();
              log(`Comment ${index + 1}: Found name "${name}" with selector ${selector}`);
              break;
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error getting name with selector ${selector}: ${error.message}`);
          }
        }
        
        // Debug profile URL extraction
        if (debugMode) {
          debugProfileUrlExtraction(element, index);
        }
        
        // Extract profile URL - Enhanced approach
        let profileUrl = "";
        
        // First try with direct selectors
        for (const selector of profileUrlSelectors) {
          try {
            const profileLinkElement = element.querySelector(selector);
            if (profileLinkElement && profileLinkElement.href) {
              profileUrl = cleanProfileUrl(profileLinkElement.href);
              log(`Comment ${index + 1}: Found profile URL "${profileUrl}" with selector ${selector}`);
              break;
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error getting profile URL with selector ${selector}: ${error.message}`);
          }
        }
        
        // If no profile URL found, try a more aggressive approach
        if (!profileUrl) {
          try {
            // Find all links in the comment element
            const allLinks = Array.from(element.querySelectorAll('a'));
            
            // Filter for likely profile links
            const profileLinks = allLinks.filter(link => {
              const href = link.href || '';
              return (href.includes('linkedin.com/in/') || 
                     href.includes('/profile/') ||
                     (link.getAttribute('data-control-name') && 
                      (link.getAttribute('data-control-name').includes('actor') || 
                       link.getAttribute('data-control-name').includes('profile'))));
            });
            
            if (profileLinks.length > 0) {
              profileUrl = cleanProfileUrl(profileLinks[0].href);
              log(`Comment ${index + 1}: Found profile URL "${profileUrl}" with generic approach`);
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error in generic profile URL extraction: ${error.message}`);
          }
        }
        
        // If still no profile URL, try an even more aggressive approach
        if (!profileUrl) {
          try {
            // Look for any link that might be near the commenter's name
            const nameElement = element.querySelector(nameSelectors.find(s => element.querySelector(s)));
            if (nameElement) {
              // Try to find a link in the parent or grandparent element
              let parent = nameElement.parentElement;
              for (let i = 0; i < 3; i++) { // Check up to 3 levels up
                if (!parent) break;
                
                const links = parent.querySelectorAll('a');
                for (const link of links) {
                  if (link.href && (link.href.includes('linkedin.com/in/') || link.href.includes('/profile/'))) {
                    profileUrl = cleanProfileUrl(link.href);
                    log(`Comment ${index + 1}: Found profile URL "${profileUrl}" by proximity to name`);
                    break;
                  }
                }
                
                if (profileUrl) break;
                parent = parent.parentElement;
              }
            }
            
            // If still no URL, look for any link in the comment that might be a profile
            if (!profileUrl) {
              const allLinks = Array.from(element.querySelectorAll('a'));
              // Sort links by length of href (profile URLs tend to be shorter than other URLs)
              allLinks.sort((a, b) => (a.href?.length || 0) - (b.href?.length || 0));
              
              for (const link of allLinks) {
                if (link.href) {
                  // Clean and check if it's a LinkedIn profile URL
                  const cleanUrl = cleanProfileUrl(link.href);
                  if (cleanUrl) {
                    profileUrl = cleanUrl;
                    log(`Comment ${index + 1}: Found profile URL "${profileUrl}" from sorted links`);
                    break;
                  }
                }
              }
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error in extended profile URL extraction: ${error.message}`);
          }
        }
        
        // Final fallback: Look for any link on the page that might contain the commenter's name
        if (!profileUrl && name !== "Unknown") {
          try {
            // Get all links on the page
            const allPageLinks = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]'));
            
            // Try to find a link that contains the commenter's name or part of it
            const nameParts = name.toLowerCase().split(' ');
            
            // Look for links that might contain parts of the name in the URL
            for (const link of allPageLinks) {
              const href = link.href.toLowerCase();
              // Check if any part of the name is in the URL
              if (nameParts.some(part => part.length > 2 && href.includes(part))) {
                profileUrl = cleanProfileUrl(link.href);
                log(`Comment ${index + 1}: Found profile URL "${profileUrl}" by name matching in URL`);
                break;
              }
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error in name-based profile URL extraction: ${error.message}`);
          }
        }
        
        // Extract description (job title/role)
        let description = "";
        for (const selector of descriptionSelectors) {
          try {
            const descElement = element.querySelector(selector);
            if (descElement && descElement.textContent.trim()) {
              description = descElement.textContent.trim();
              log(`Comment ${index + 1}: Found description "${description}" with selector ${selector}`);
              break;
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error getting description with selector ${selector}: ${error.message}`);
          }
        }
        
        // Extract comment text
        let commentText = "";
        for (const selector of commentTextSelectors) {
          try {
            const commentTextElement = element.querySelector(selector);
            if (commentTextElement && commentTextElement.textContent.trim()) {
              commentText = commentTextElement.textContent.trim();
              commentText = commentText.replace(/\n+/g, " ").replace(/\s+/g, " ");
              log(`Comment ${index + 1}: Found comment text "${commentText.substring(0, 50)}..." with selector ${selector}`);
              break;
            }
          } catch (error) {
            log(`Comment ${index + 1}: Error getting comment text with selector ${selector}: ${error.message}`);
          }
        }
        
        // If we still don't have comment text, try a more generic approach
        if (!commentText) {
          log(`Comment ${index + 1}: No comment text found with selectors, trying generic approach`);
          // Get all text nodes that are not inside buttons or links
          const textNodes = Array.from(element.querySelectorAll('*'))
            .filter(el => !el.closest('button') && !el.tagName.match(/^(BUTTON|A|INPUT)$/i))
            .map(el => el.textContent.trim())
            .filter(text => text.length > 10); // Likely to be comment text if longer
          
          if (textNodes.length > 0) {
            // Use the longest text as the comment
            commentText = textNodes.reduce((a, b) => a.length > b.length ? a : b);
            commentText = commentText.replace(/\n+/g, " ").replace(/\s+/g, " ");
            log(`Comment ${index + 1}: Found comment text with generic approach: "${commentText.substring(0, 50)}..."`);
          }
        }
        
        if (name !== "Unknown" || profileUrl || commentText) {
          comments.push({
            name,
            profileUrl,
            description,
            commentText
          });
          log(`Comment ${index + 1}: Added to results`);
        } else {
          log(`Comment ${index + 1}: Skipped due to missing data`);
        }
      } catch (error) {
        log(`Comment ${index + 1}: Error processing - ${error.message}`);
      }
    });
    
    log(`Total comments scraped: ${comments.length}`);
  } catch (error) {
    log(`Error during scraping: ${error.message}`);
  }
  
  return { comments, logs };
} 