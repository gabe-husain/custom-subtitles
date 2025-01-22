// Main entry point for the Chrome extension popup interface
document.addEventListener('DOMContentLoaded', function() {
    // Object containing references to the drop zones for both primary and secondary subtitles
    const dropZones = {
      primary: document.getElementById('primaryDropZone'),
      secondary: document.getElementById('secondaryDropZone')
    };
    
    // Object containing references to the hidden file inputs for both subtitle tracks
    const fileInputs = {
      primary: document.getElementById('primaryFileInput'),
      secondary: document.getElementById('secondaryFileInput')
    };
    
    // Reference to status display element that shows feedback to the user
    const status = document.getElementById('status');
  
    // Set up drag and drop functionality for both primary and secondary zones
    Object.entries(dropZones).forEach(([key, zone]) => {
      const input = fileInputs[key];
      
      // Enable clicking on drop zone to trigger file input
      zone.addEventListener('click', () => input.click());
      
      // Handle file selection through the traditional file input
      input.addEventListener('change', (e) => {
        handleFile(e.target.files[0], key === 'secondary');
      });
  
      // Handle dragover event to show visual feedback
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();  // Prevent default to allow drop
        e.stopPropagation();
        zone.classList.add('dragover');  // Add visual feedback class
      });
  
      // Remove visual feedback when drag leaves the zone
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
      });
  
      // Handle actual file drop
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        // Only process .srt files
        if (file && file.name.endsWith('.srt')) {
          handleFile(file, key === 'secondary');
        }
      });
    });
  
    /**
     * Handles the processing of an uploaded SRT file
     * @param {File} file - The SRT file to process
     * @param {boolean} isSecondary - Whether this is the secondary subtitle track
     */
    function handleFile(file, isSecondary) {
      const reader = new FileReader();
      
      // Set up file reader completion handler
      reader.onload = (e) => {
        const content = e.target.result;
        
        // Find the active tab and send message to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(
            tabs[0].id, 
            {
              action: 'createSubtitleOverlay',
              srtContent: content,
              isSecondary
            },
            // Handle response from content script
            function(response) {
              if (response && response.success) {
                // Update status and store subtitle content in local storage
                status.textContent = `Loaded ${isSecondary ? 'secondary' : 'primary'}: ${file.name}`;
                const storageKey = isSecondary ? 'secondarySRT' : 'primarySRT';
                chrome.storage.local.set({ [storageKey]: content });
              } else {
                status.textContent = 'Error loading subtitles';
              }
            }
          );
        });
      };
      
      // Start reading the file as text
      reader.readAsText(file);
    }
});