// This script runs on LinkedIn pages and helps with auto-scrolling to load all comments
// It also provides utility functions to help with scraping

// Global flag to control scrolling
let shouldStopScrolling = false;

// Function to scroll to the bottom of the page to load more comments
function scrollToBottom() {
  window.scrollTo(0, document.body.scrollHeight);
}

// Function to click "Show more comments" buttons
function clickShowMoreButtons() {
  const showMoreSelectors = [
    'button.comments-comments-list__show-previous-button',
    'button.comments-comments-list__load-more-comments-button',
    'button[aria-label="Load more comments"]',
    'button.show-prev-button',
    // New selector based on user's finding
    'button span.artdeco-button__text:contains("Carica altri commenti")',
    'button:contains("Carica altri commenti")',
    'button:contains("Load more comments")',
    // Add more selectors as LinkedIn updates their DOM
  ];
  
  let buttonsClicked = 0;
  
  showMoreSelectors.forEach(selector => {
    try {
      // First try with querySelector if it's a valid selector
      const buttons = document.querySelectorAll(selector);
      buttons.forEach(button => {
        try {
          button.click();
          buttonsClicked++;
          console.log(`Clicked a 'Show more comments' button with selector: ${selector}`);
        } catch (e) {
          console.log(`Error clicking show more button with selector ${selector}:`, e);
        }
      });
    } catch (e) {
      // If the selector is invalid (like those with :contains), try a different approach
      if (selector.includes(':contains')) {
        const text = selector.match(/:contains\("(.+?)"\)/)[1];
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(button => {
          if (button.textContent.includes(text)) {
            try {
              button.click();
              buttonsClicked++;
              console.log(`Clicked a button containing text: ${text}`);
            } catch (err) {
              console.log(`Error clicking button containing text ${text}:`, err);
            }
          }
        });
      }
    }
  });
  
  // Try a more generic approach - look for any button that might be a "load more" button
  if (buttonsClicked === 0) {
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(button => {
      const buttonText = button.textContent.toLowerCase().trim();
      if (
        buttonText.includes('load more') || 
        buttonText.includes('show more') || 
        buttonText.includes('carica altri') ||
        buttonText.includes('view more')
      ) {
        try {
          button.click();
          buttonsClicked++;
          console.log(`Clicked a button with text: ${buttonText}`);
        } catch (err) {
          console.log(`Error clicking button with text ${buttonText}:`, err);
        }
      }
    });
  }
  
  return buttonsClicked;
}

// Function to expand all comment threads
function expandCommentThreads() {
  const expandSelectors = [
    'button.comments-comment-item__view-replies-link',
    'button.comments-comment-social-activity__replies-link',
    'button[aria-label="View replies"]',
    'button:contains("View replies")',
    'button:contains("Visualizza risposte")',
    // Add more selectors as LinkedIn updates their DOM
  ];
  
  let threadsExpanded = 0;
  
  expandSelectors.forEach(selector => {
    try {
      const expandButtons = document.querySelectorAll(selector);
      expandButtons.forEach(button => {
        try {
          button.click();
          threadsExpanded++;
          console.log("Expanded a comment thread");
        } catch (e) {
          console.log("Error expanding comment thread:", e);
        }
      });
    } catch (e) {
      // If the selector is invalid (like those with :contains), try a different approach
      if (selector.includes(':contains')) {
        const text = selector.match(/:contains\("(.+?)"\)/)[1];
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(button => {
          if (button.textContent.includes(text)) {
            try {
              button.click();
              threadsExpanded++;
              console.log(`Expanded a thread with button text: ${text}`);
            } catch (err) {
              console.log(`Error expanding thread with button text ${text}:`, err);
            }
          }
        });
      }
    }
  });
  
  return threadsExpanded;
}

// Function to detect DOM structure and provide debug info
function detectDOMStructure() {
  const domInfo = {
    pageTitle: document.title,
    url: window.location.href,
    commentSelectors: [],
    nameSelectors: [],
    profileUrlSelectors: [],
    commentTextSelectors: [],
    buttonTexts: []
  };
  
  // Collect all button texts for debugging
  const allButtons = document.querySelectorAll('button');
  allButtons.forEach(button => {
    const text = button.textContent.trim();
    if (text) {
      domInfo.buttonTexts.push(text);
    }
  });
  
  // Test different comment selectors
  const commentSelectors = [
    ".comments-comment-item",
    ".comments-comments-list__comment-item",
    ".comments-comment-social-activity",
    "article.comments-comment-item",
    ".comments-comments-list__comment-item-container",
    ".feed-shared-comment",
    ".comments-container",
    ".comments-comment-meta",
    // Add more as needed
  ];
  
  commentSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        domInfo.commentSelectors.push({
          selector: selector,
          count: elements.length,
          sample: elements[0].outerHTML.substring(0, 200) + '...' // Sample of the HTML
        });
      }
    } catch (e) {
      console.error(`Error checking selector ${selector}:`, e);
    }
  });
  
  // Find all profile links on the page
  try {
    const profileLinks = Array.from(document.querySelectorAll('a')).filter(link => {
      const href = link.href || '';
      return href.includes('linkedin.com/in/') || href.includes('/profile/');
    });
    
    domInfo.profileLinks = {
      count: profileLinks.length,
      samples: profileLinks.slice(0, 5).map(link => link.href)
    };
  } catch (e) {
    console.error("Error finding profile links:", e);
  }
  
  return domInfo;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scrollToLoadComments") {
    // Reset the stop flag
    shouldStopScrolling = false;
    
    // Get debug mode from message
    const debugMode = message.debugMode || false;
    const logs = debugMode ? ["Starting scrolling to load comments..."] : [];
    
    // Log helper function
    const log = (message) => {
      if (debugMode) logs.push(message);
      console.log(message);
    };
    
    // Scroll to load more comments
    let scrollAttempts = 0;
    const maxScrollAttempts = 15; // Increased from 10 to 15
    let lastHeight = document.body.scrollHeight;
    let totalButtonsClicked = 0;
    let totalThreadsExpanded = 0;
    
    log(`Initial page height: ${lastHeight}px`);
    
    const scrollInterval = setInterval(() => {
      // Check if we should stop scrolling
      if (shouldStopScrolling) {
        clearInterval(scrollInterval);
        log("Scrolling stopped by user request");
        sendResponse({ 
          status: "stopped",
          message: "Scrolling stopped by user",
          stats: {
            scrollAttempts,
            totalButtonsClicked,
            totalThreadsExpanded,
            finalHeight: document.body.scrollHeight
          },
          logs: debugMode ? logs : undefined
        });
        return;
      }
      
      // Scroll to bottom
      scrollToBottom();
      scrollAttempts++;
      log(`Scroll attempt ${scrollAttempts}/${maxScrollAttempts}`);
      
      // Try to click "Show more comments" buttons
      const buttonsClicked = clickShowMoreButtons();
      totalButtonsClicked += buttonsClicked;
      if (buttonsClicked > 0) {
        log(`Clicked ${buttonsClicked} 'Show more comments' buttons (total: ${totalButtonsClicked})`);
      }
      
      // Try to expand comment threads
      const threadsExpanded = expandCommentThreads();
      totalThreadsExpanded += threadsExpanded;
      if (threadsExpanded > 0) {
        log(`Expanded ${threadsExpanded} comment threads (total: ${totalThreadsExpanded})`);
      }
      
      // Check if we've reached the bottom or max attempts
      setTimeout(() => {
        // Check again if we should stop
        if (shouldStopScrolling) {
          clearInterval(scrollInterval);
          log("Scrolling stopped by user request");
          sendResponse({ 
            status: "stopped",
            message: "Scrolling stopped by user",
            stats: {
              scrollAttempts,
              totalButtonsClicked,
              totalThreadsExpanded,
              finalHeight: document.body.scrollHeight
            },
            logs: debugMode ? logs : undefined
          });
          return;
        }
        
        const newHeight = document.body.scrollHeight;
        log(`New page height: ${newHeight}px (change: ${newHeight - lastHeight}px)`);
        
        if ((newHeight === lastHeight && buttonsClicked === 0 && threadsExpanded === 0) || scrollAttempts >= maxScrollAttempts) {
          clearInterval(scrollInterval);
          
          if (scrollAttempts >= maxScrollAttempts) {
            log(`Reached maximum scroll attempts (${maxScrollAttempts})`);
          } else {
            log("No more new content to load");
          }
          
          // Collect DOM structure info for debugging
          const domInfo = detectDOMStructure();
          log(`Page title: ${domInfo.pageTitle}`);
          log(`Found ${domInfo.commentSelectors.length} different comment selectors`);
          
          if (debugMode) {
            // Count all potential comment elements
            const commentElements = document.querySelectorAll('*[class*="comment"]');
            log(`Found ${commentElements.length} elements with "comment" in their class name`);
            
            // Count all potential buttons that might load more comments
            const potentialLoadButtons = Array.from(document.querySelectorAll('button'))
              .filter(btn => {
                const text = btn.textContent.toLowerCase();
                return text.includes('load') || text.includes('more') || text.includes('carica') || text.includes('show');
              });
            log(`Found ${potentialLoadButtons.length} potential "load more" buttons`);
            
            // Log profile links found
            if (domInfo.profileLinks) {
              log(`Found ${domInfo.profileLinks.count} profile links on the page`);
              if (domInfo.profileLinks.samples && domInfo.profileLinks.samples.length > 0) {
                log(`Sample profile links: ${domInfo.profileLinks.samples.join(', ')}`);
              }
            }
          }
          
          sendResponse({ 
            status: "complete",
            message: `Scrolled ${scrollAttempts} times to load comments`,
            stats: {
              scrollAttempts,
              totalButtonsClicked,
              totalThreadsExpanded,
              finalHeight: newHeight
            },
            domInfo,
            logs: debugMode ? logs : undefined
          });
        }
        lastHeight = newHeight;
      }, 1500);
    }, 2000);
    
    // Keep the message channel open for the asynchronous response
    return true;
  }
  
  // Add a handler for stopping the scrolling process
  if (message.action === "stopScrolling") {
    shouldStopScrolling = true;
    console.log("Received stop scrolling request");
    sendResponse({ status: "stopping" });
    return false;
  }
  
  // Add a helper function to detect LinkedIn's DOM structure
  if (message.action === "detectDOMStructure") {
    const domInfo = detectDOMStructure();
    sendResponse({ domInfo });
    return false;
  }
  
  // Handle the showImportInstructions message for Google Sheets
  if (message.action === "showImportInstructions") {
    // This is handled by the triggerFileImport function in popup.js
    // which is injected directly into the Google Sheets page
    return false;
  }
}); 