document.addEventListener("DOMContentLoaded", () => {
  const scrapeButton = document.getElementById("scrapeButton");
  const statusText = document.getElementById("status");
  const debugModeCheckbox = document.getElementById("debugMode");
  const debugInfo = document.getElementById("debugInfo");
  const debugContent = document.getElementById("debugContent");
  
  // Debug mode toggle
  debugModeCheckbox.addEventListener("change", () => {
    debugInfo.style.display = debugModeCheckbox.checked ? "block" : "none";
  });
  
  // Function to log debug information
  function logDebug(message) {
    if (debugModeCheckbox.checked) {
      const timestamp = new Date().toLocaleTimeString();
      debugContent.innerHTML += `[${timestamp}] ${message}\n`;
      debugContent.scrollTop = debugContent.scrollHeight;
    }
  }

  scrapeButton.addEventListener("click", async () => {
    statusText.textContent = "Scraping comments...";
    
    // Clear previous debug info
    if (debugModeCheckbox.checked) {
      debugContent.innerHTML = "";
    }
    
    logDebug("Starting comment scraping process...");

    try {
      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      logDebug(`Active tab URL: ${tab.url}`);

      // Check if the tab is a LinkedIn page
      if (!tab.url.includes("linkedin.com")) {
        statusText.textContent = "Please open a LinkedIn post page.";
        logDebug("Error: Not a LinkedIn page");
        return;
      }

      // First, detect LinkedIn's DOM structure to help with scraping
      statusText.textContent = "Analyzing LinkedIn page structure...";
      logDebug("Analyzing LinkedIn page structure...");
      
      // First, scroll to load all comments
      statusText.textContent = "Scrolling to load all comments...";
      logDebug("Scrolling to load all comments...");
      
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: "scrollToLoadComments" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error:", chrome.runtime.lastError);
            logDebug(`Error: ${chrome.runtime.lastError.message}`);
            statusText.textContent = "Error communicating with the page. Please refresh and try again.";
            reject(chrome.runtime.lastError);
          } else if (response && response.status === "complete") {
            logDebug(`Scrolling complete: ${response.message || "All comments loaded"}`);
            
            // Log detailed stats if available
            if (response.stats) {
              logDebug(`Scroll attempts: ${response.stats.scrollAttempts}`);
              logDebug(`Buttons clicked: ${response.stats.totalButtonsClicked}`);
              logDebug(`Threads expanded: ${response.stats.totalThreadsExpanded}`);
            }
            
            // Log DOM structure info if available
            if (response.domInfo) {
              logDebug(`Page title: ${response.domInfo.pageTitle}`);
              logDebug(`URL: ${response.domInfo.url}`);
              
              if (response.domInfo.commentSelectors && response.domInfo.commentSelectors.length > 0) {
                logDebug(`Found comment elements with these selectors:`);
                response.domInfo.commentSelectors.forEach(info => {
                  logDebug(`  - ${info.selector}: ${info.count} elements`);
                });
              } else {
                logDebug("No comment elements found with known selectors");
              }
              
              if (response.domInfo.buttonTexts && response.domInfo.buttonTexts.length > 0) {
                logDebug(`Button texts found on page (first 10):`);
                response.domInfo.buttonTexts.slice(0, 10).forEach(text => {
                  logDebug(`  - "${text}"`);
                });
              }
            }
            
            statusText.textContent = "Comments loaded. Now scraping...";
            resolve();
          } else {
            logDebug("Unknown response from content script");
            statusText.textContent = "Error: Unknown response from content script";
            reject(new Error("Unknown response from content script"));
          }
        });
      }).catch(error => {
        logDebug(`Promise error: ${error.message}`);
      });

      // Now execute the scraper function
      logDebug("Executing scraper function...");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapeLinkedInComments
      });

      if (chrome.runtime.lastError) {
        statusText.textContent = "Error: " + chrome.runtime.lastError.message;
        logDebug(`Scraping error: ${chrome.runtime.lastError.message}`);
        return;
      }

      const comments = results[0].result;
      logDebug(`Found ${comments ? comments.length : 0} comments`);
      
      if (!comments || comments.length === 0) {
        statusText.textContent = "No comments found. Make sure you're on a LinkedIn post with comments.";
        logDebug("No comments found. LinkedIn may have updated their DOM structure.");
        
        // Try to get more debug info
        const debugResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: getDebugInfo
        });
        
        if (debugResults && debugResults[0] && debugResults[0].result) {
          const debugInfo = debugResults[0].result;
          logDebug("Debug info from page:");
          logDebug(`HTML structure sample: ${debugInfo.htmlSample}`);
          logDebug(`Comment containers found: ${debugInfo.commentContainers}`);
        }
        
        return;
      }

      // Log some sample comments for debugging
      if (debugModeCheckbox.checked && comments.length > 0) {
        logDebug(`Sample comment: ${JSON.stringify(comments[0], null, 2)}`);
      }

      // Convert comments to CSV
      logDebug("Converting comments to CSV...");
      const csv = convertToCSV(comments);
      
      // Download CSV
      logDebug("Downloading CSV file...");
      downloadCSV(csv, "linkedin_comments.csv");
      
      statusText.textContent = `Scraped ${comments.length} comments! CSV downloaded.`;
      logDebug("Scraping process completed successfully!");
    } catch (error) {
      console.error("Error:", error);
      logDebug(`Error: ${error.message}`);
      statusText.textContent = "An error occurred. Please try again.";
    }
  });
});

// Function to get additional debug info from the page
function getDebugInfo() {
  try {
    // Get a sample of the page HTML
    const htmlSample = document.body.innerHTML.substring(0, 1000);
    
    // Try to find comment containers with various methods
    const commentContainers = [];
    
    // Method 1: Look for elements with "comment" in their class name
    const commentClassElements = Array.from(document.querySelectorAll('*[class*="comment"]'));
    commentContainers.push(`Elements with "comment" in class: ${commentClassElements.length}`);
    
    // Method 2: Look for elements that might contain comments based on text content
    const possibleCommentContainers = Array.from(document.querySelectorAll('div, article, section, li'))
      .filter(el => el.textContent.includes('comment') || el.textContent.includes('Comment'));
    commentContainers.push(`Elements containing "comment" text: ${possibleCommentContainers.length}`);
    
    return {
      htmlSample,
      commentContainers
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

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

// This function will be injected into the LinkedIn page
function scrapeLinkedInComments() {
  // Array to store the scraped comments
  const comments = [];
  
  try {
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
          console.log(`Found ${commentElements.length} comments with selector: ${selector}`);
          usedSelector = selector;
          break;
        }
      } catch (e) {
        console.error(`Error with selector ${selector}:`, e);
      }
    }
    
    // If no comments found with standard selectors, try a more generic approach
    if (commentElements.length === 0) {
      console.log("No comments found with standard selectors. Trying generic approach...");
      
      // Look for elements with "comment" in their class name
      const commentClassElements = Array.from(document.querySelectorAll('*[class*="comment"]'));
      
      // Filter to likely comment containers
      commentElements = commentClassElements.filter(el => {
        // Check if it has text content
        if (!el.textContent.trim()) return false;
        
        // Check if it has a reasonable size (not too small)
        if (el.textContent.length < 10) return false;
        
        // Check if it's likely a container (has children)
        if (el.children.length < 2) return false;
        
        return true;
      });
      
      if (commentElements.length > 0) {
        console.log(`Found ${commentElements.length} potential comments using generic approach`);
        usedSelector = "generic";
      }
    }
    
    if (commentElements.length === 0) {
      console.log("No comments found with any of the known selectors. LinkedIn may have updated their DOM structure.");
      return {
        comments: [],
        debug: {
          message: "No comments found with known selectors",
          selectors: selectors,
          htmlSample: document.body.innerHTML.substring(0, 1000) // Sample of the HTML for debugging
        }
      };
    }
    
    // Process each comment element
    commentElements.forEach((element) => {
      try {
        // Try different selectors for name, profile URL, and comment text
        // Name selectors
        const nameSelectors = [
          ".comments-post-meta__name-text span",
          ".comments-post-meta__actor-link span",
          ".comments-comment-item__commenter-name-text",
          ".feed-shared-actor__name",
          ".update-components-actor__name",
          ".feed-shared-actor__title",
          // New selector based on user's finding
          "span.comments-comment-meta__description-title",
          ".comments-comment-meta__name",
          ".comments-comment-meta__name-text",
          "a.comments-post-meta__actor-link",
          // Add more potential selectors here
        ];
        
        // Profile URL selectors
        const profileUrlSelectors = [
          ".comments-post-meta__name a",
          ".comments-post-meta__actor-link",
          ".comments-comment-item__commenter-name-link",
          ".feed-shared-actor__container-link",
          "a.update-components-actor__container-link",
          "a.feed-shared-actor__container-link",
          "a.comments-post-meta__actor-link",
          // Add more potential selectors here
        ];
        
        // Description selectors (job title/role)
        const descriptionSelectors = [
          ".comments-comment-meta__description-subtitle",
          ".feed-shared-actor__description",
          ".comments-post-meta__headline",
          ".comments-comment-item__commenter-headline",
          ".update-components-actor__description",
          // Add more potential selectors here
        ];
        
        // Comment text selectors
        const commentTextSelectors = [
          ".comments-comment-item-content-body",
          ".comments-comment-item__main-content",
          ".comments-comment-item__comment-text",
          ".feed-shared-update-v2__commentary",
          ".update-components-text",
          ".feed-shared-text",
          ".comments-comment-item__content-body",
          ".comments-comment-item-content",
          "span[dir='ltr']", // New selector based on user's finding
          // Add more potential selectors here
        ];
        
        // Extract name
        let name = "Unknown";
        let nameSelector = "";
        for (const selector of nameSelectors) {
          try {
            const nameElement = element.querySelector(selector);
            if (nameElement) {
              name = nameElement.innerText.trim();
              nameSelector = selector;
              break;
            }
          } catch (e) {
            console.error(`Error with name selector ${selector}:`, e);
          }
        }
        
        // If name is still unknown, try a more generic approach
        if (name === "Unknown") {
          // Look for any element that might contain a name
          const possibleNameElements = Array.from(element.querySelectorAll('a, span, div'))
            .filter(el => {
              const text = el.innerText.trim();
              // Names typically have 2+ characters and don't have too many words
              return text.length >= 2 && text.split(' ').length <= 5 && !text.includes('@');
            });
          
          if (possibleNameElements.length > 0) {
            // Take the first one as a best guess
            name = possibleNameElements[0].innerText.trim();
            nameSelector = "generic";
          }
        }
        
        // Extract profile URL
        let profileUrl = "";
        let profileUrlSelector = "";
        for (const selector of profileUrlSelectors) {
          try {
            const profileLinkElement = element.querySelector(selector);
            if (profileLinkElement && profileLinkElement.href) {
              profileUrl = profileLinkElement.href;
              // Clean up the profile URL (remove tracking parameters)
              profileUrl = profileUrl.split('?')[0];
              profileUrlSelector = selector;
              break;
            }
          } catch (e) {
            console.error(`Error with profile URL selector ${selector}:`, e);
          }
        }
        
        // If profile URL is still empty, try a more generic approach
        if (!profileUrl) {
          // Look for any anchor tag that might be a profile link
          const possibleProfileLinks = Array.from(element.querySelectorAll('a'))
            .filter(a => a.href && a.href.includes('/in/'));
          
          if (possibleProfileLinks.length > 0) {
            profileUrl = possibleProfileLinks[0].href.split('?')[0];
            profileUrlSelector = "generic";
          }
        }
        
        // Extract description (job title/role)
        let description = "";
        let descriptionSelector = "";
        for (const selector of descriptionSelectors) {
          try {
            const descriptionElement = element.querySelector(selector);
            if (descriptionElement) {
              description = descriptionElement.innerText.trim();
              descriptionSelector = selector;
              break;
            }
          } catch (e) {
            console.error(`Error with description selector ${selector}:`, e);
          }
        }
        
        // Extract comment text
        let commentText = "";
        let commentTextSelector = "";
        for (const selector of commentTextSelectors) {
          try {
            const commentTextElement = element.querySelector(selector);
            if (commentTextElement) {
              commentText = commentTextElement.innerText.trim();
              // Clean up the comment text (remove extra newlines, etc.)
              commentText = commentText.replace(/\n+/g, " ").replace(/\s+/g, " ");
              commentTextSelector = selector;
              break;
            }
          } catch (e) {
            console.error(`Error with comment text selector ${selector}:`, e);
          }
        }
        
        // If comment text is still empty, try a more generic approach
        if (!commentText) {
          // The comment text is likely the longest text content in the element
          const textNodes = Array.from(element.querySelectorAll('*'))
            .filter(el => el.innerText && el.innerText.trim().length > 0)
            .map(el => ({
              element: el,
              text: el.innerText.trim()
            }))
            .sort((a, b) => b.text.length - a.text.length);
          
          if (textNodes.length > 0) {
            // The longest text is likely the comment
            commentText = textNodes[0].text.replace(/\n+/g, " ").replace(/\s+/g, " ");
            commentTextSelector = "generic";
          }
        }
        
        // Add to comments array if we have at least a name or comment text
        if (name !== "Unknown" || commentText) {
          comments.push({
            name,
            profileUrl,
            description,
            commentText,
            debug: {
              nameSelector,
              profileUrlSelector,
              descriptionSelector,
              commentTextSelector,
              elementHTML: element.outerHTML.substring(0, 200) + '...' // Sample of the HTML
            }
          });
        }
      } catch (error) {
        console.error("Error scraping a comment:", error);
      }
    });
    
    return comments;
  } catch (error) {
    console.error("Error in scraping function:", error);
    return {
      comments: [],
      debug: {
        error: error.message,
        stack: error.stack
      }
    };
  }
} 