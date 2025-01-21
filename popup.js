document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const status = document.getElementById('status');
  
    // Handle file selection via click
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
      handleFile(e.target.files[0]);
    });
  
    // Handle drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
  
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
      
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.srt')) {
        handleFile(file);
      }
    });
  
    function handleFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        
        // Send subtitle content to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(
            tabs[0].id, 
            {
              action: 'createSubtitleOverlay',
              srtContent: content
            },
            function(response) {
              if (response && response.success) {
                status.textContent = `Loaded: ${file.name}`;
                // Store the SRT content in chrome.storage
                chrome.storage.local.set({ 'currentSRT': content });
              } else {
                status.textContent = 'Error loading subtitles';
              }
            }
          );
        });
      };
      reader.readAsText(file);
    }
  });