chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'initializeOverlay') {
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const tab = tabs[0];
            
            try {
                // Inject CSS first
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['styles.css']
                });
                
                // Then inject the content script
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                // Send success response
                sendResponse({ success: true });
            } catch (error) {
                console.error('Injection error:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // Keep message channel open for async response
    }
});
