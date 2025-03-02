// This script helps with importing CSV data into Google Sheets

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showImportInstructions") {
    showImportInstructions(message.fileName);
    return true;
  }
});

// Function to show import instructions
function showImportInstructions(fileName) {
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
  messageDiv.style.fontFamily = 'Arial, sans-serif';
  
  messageDiv.innerHTML = `
    <h3 style="color: #0073b1; margin-top: 0;">Import LinkedIn Comments</h3>
    <p>To import your LinkedIn comments:</p>
    <ol style="text-align: left;">
      <li>Click on <strong>File > Import</strong> in the Google Sheets menu</li>
      <li>Select the <strong>Upload</strong> tab</li>
      <li>Click <strong>Select a file from your device</strong></li>
      <li>Navigate to your Downloads folder</li>
      <li>Select the file named <strong>${fileName}</strong></li>
    </ol>
    <button id="closeInstructions" style="background: #0073b1; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Got it</button>
  `;
  
  document.body.appendChild(messageDiv);
  
  // Add event listener to close button
  document.getElementById('closeInstructions').addEventListener('click', () => {
    messageDiv.remove();
  });
  
  // Try to trigger the import menu automatically
  setTimeout(() => {
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
  }, 1500);
} 