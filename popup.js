document.addEventListener('DOMContentLoaded', function() {
    // Initialize i18n text content
    document.getElementById('primaryDropText').textContent = 
        chrome.i18n.getMessage('dropPrimaryFile');
    document.getElementById('secondaryDropText').textContent = 
        chrome.i18n.getMessage('dropSecondaryFile');
    
    const dropZones = {
        primary: document.getElementById('primaryDropZone'),
        secondary: document.getElementById('secondaryDropZone')
    };
    
    const fileInputs = {
        primary: document.getElementById('primaryFileInput'),
        secondary: document.getElementById('secondaryFileInput')
    };
    
    const status = document.getElementById('status');

    Object.entries(dropZones).forEach(([key, zone]) => {
        const input = fileInputs[key];
        
        zone.addEventListener('click', () => input.click());
        
        input.addEventListener('change', (e) => {
            handleFile(e.target.files[0], key === 'secondary');
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.srt')) {
                handleFile(file, key === 'secondary');
            } else {
                status.textContent = chrome.i18n.getMessage('errorInvalidFile');
            }
        });
    });

    function handleFile(file, isSecondary) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id, 
                    {
                        action: 'createSubtitleOverlay',
                        srtContent: content,
                        isSecondary
                    },
                    function(response) {
                        if (response && response.success) {
                            status.textContent = chrome.i18n.getMessage(
                                'statusFileLoaded',
                                [isSecondary ? 
                                    chrome.i18n.getMessage('secondary') : 
                                    chrome.i18n.getMessage('primary'),
                                file.name]
                            );
                            const storageKey = isSecondary ? 'secondarySRT' : 'primarySRT';
                            chrome.storage.local.set({ [storageKey]: content });
                        } else {
                            status.textContent = chrome.i18n.getMessage('errorLoading');
                        }
                    }
                );
            });
        };
        
        reader.readAsText(file);
    }
});