/**
 * Class representing a single subtitle track with timing and display capabilities
 */
class SubtitleTrack {
  subtitles = [];          // Array to store parsed subtitle entries
  currentTimeMs = 0;       // Current playback position in milliseconds
  duration = 0;            // Total duration of subtitle track
  timeOffset = 0;          // Offset to adjust timing of subtitles

  /**
   * Creates a new subtitle track
   * @param {string} color - Color to display subtitles in (default: white)
   */
  constructor(color = 'white') {
    this.color = color;
  }

  /**
   * Loads and parses SRT content into subtitle track
   * @param {string} content - Raw SRT file content
   */
  loadSubtitles(content) {
    this.subtitles = this.parseSRT(content);
    this.duration = this.subtitles[this.subtitles.length - 1]?.end ?? 0;
    this.currentTimeMs = 0;
  }

  /**
   * Gets the current subtitle based on playback position
   * @returns {Object|undefined} Current subtitle entry or undefined if none active
   */
  getCurrentSubtitle() {
    const adjustedTime = this.currentTimeMs + this.timeOffset;
    return this.subtitles.find(sub => 
      adjustedTime >= sub.start && adjustedTime <= sub.end
    );
  }

  /**
   * Parses SRT format content into structured subtitle data
   * @param {string} content - Raw SRT content
   * @returns {Array} Array of parsed subtitle objects
   */
  parseSRT(content) {
    const blocks = content.trim().split(/\r?\n\r?\n+/);
    return blocks.map(block => {
      const lines = block.split(/\r?\n/);
      const [, timecode, ...textLines] = lines;
      const [startTime, endTime] = timecode.split(' --> ');
      return {
        start: this.timeToMs(startTime),
        end: this.timeToMs(endTime),
        text: textLines.join('\n')
      };
    });
  }

  /**
   * Converts SRT timestamp to milliseconds
   * @param {string} timeStr - SRT format timestamp (00:00:00,000)
   * @returns {number} Milliseconds
   */
  timeToMs(timeStr) {
    const [time, ms] = timeStr.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return (hours * 3600000 + minutes * 60000 + seconds * 1000 + parseInt(ms));
  }
}

/**
 * Main class for managing dual subtitle playback and synchronization
 */
class DualSubtitlePlayer {
  isPlaying = false;      // Playback state
  syncEnabled = true;     // Whether tracks should stay synchronized
  tracks = {
    primary: new SubtitleTrack('white'),
    secondary: new SubtitleTrack('yellow')
  };
  
  constructor() {
    this.overlay = null; // Initialize overlay as null
  }

  /**
   * Sets up Chrome extension message listener for subtitle loading
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      if (message.action === 'createSubtitleOverlay') {
        await this.initializeOverlay();
        await this.loadSubtitles(message.srtContent, message.isSecondary);
        sendResponse({ success: true });
      }
      return true;
    });
  }

  /**
   * Creates and initializes the subtitle overlay UI
   */
  async initializeOverlay() {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'subtitle-overlay';
      
      // Create subtitle text containers
      for (const [key, track] of Object.entries(this.tracks)) {
        const textContainer = document.createElement('div');
        textContainer.className = `subtitle-text ${key}`;
        textContainer.style.color = track.color;
        this.overlay.appendChild(textContainer);
      }

      const controlsWrapper = document.createElement('div');
      controlsWrapper.className = 'controls-wrapper';
      
      for (const [key, track] of Object.entries(this.tracks)) {
        const controls = this.createTrackControls(key);
        controlsWrapper.appendChild(controls);
      }

      // Create sync toggle button with i18n
      const syncToggle = document.createElement('button');
      syncToggle.className = 'sync-toggle';
      syncToggle.textContent = chrome.i18n.getMessage('syncOn');
      syncToggle.addEventListener('click', () => {
        this.syncEnabled = !this.syncEnabled;
        syncToggle.textContent = this.syncEnabled ? 
          chrome.i18n.getMessage('syncOn') : 
          chrome.i18n.getMessage('syncOff');
      });

      const masterControls = document.createElement('div');
      masterControls.className = 'master-controls';
      
      this.playPauseButton = document.createElement('button');
      this.playPauseButton.className = 'subtitle-button';
      this.playPauseButton.textContent = chrome.i18n.getMessage('play');
      this.playPauseButton.addEventListener('click', () => this.togglePlayPause());
      
      masterControls.append(this.playPauseButton, syncToggle);
      controlsWrapper.appendChild(masterControls);
      
      this.overlay.appendChild(controlsWrapper);
      document.body.appendChild(this.overlay);
    }
  }

  /**
   * Creates control elements for a subtitle track
   * @param {string} trackKey - Key identifying the track (primary/secondary)
   * @returns {HTMLElement} Container with track controls
   */
  createTrackControls(trackKey) {
    const track = this.tracks[trackKey];
    const container = document.createElement('div');
    container.className = 'track-controls';
    
    // Create progress slider
    const progressBar = document.createElement('input');
    Object.assign(progressBar, {
      type: 'range',
      className: 'progress-bar',
      min: '0',
      step: '100',
      value: '0'
    });

    // Handle progress bar input
    progressBar.addEventListener('input', (e) => {
      const newTime = parseInt(e.target.value);
      if (this.syncEnabled) {
        this.setAllTracksTime(newTime, trackKey);
      } else {
        track.currentTimeMs = newTime;
      }
      this.updateDisplay();
    });

    // Create time display/input field
    const timeDisplay = document.createElement('input');
    Object.assign(timeDisplay, {
      type: 'text',
      className: 'time-display',
      value: '00:00:00 / 00:00:00'
    });

    // Handle manual time input
    timeDisplay.addEventListener('change', (e) => {
      const newTime = this.parseTimeInput(e.target.value);
      if (newTime !== null) {
        if (this.syncEnabled) {
          this.setAllTracksTime(newTime, trackKey);
        } else {
          track.currentTimeMs = newTime;
        }
        this.updateDisplay();
      }
    });

    container.append(progressBar, timeDisplay);
    return container;
  }

  /**
   * Updates time for all tracks while maintaining relative offset
   * @param {number} newTime - New time in milliseconds
   * @param {string} sourceTrack - Key of track initiating the change
   */
  setAllTracksTime(newTime, sourceTrack) {
    const sourceOffset = this.tracks[sourceTrack].timeOffset;
    for (const [key, track] of Object.entries(this.tracks)) {
      if (key === sourceTrack) {
        track.currentTimeMs = newTime;
      } else {
        track.currentTimeMs = newTime + (sourceOffset - track.timeOffset);
      }
    }
  }

  /**
   * Loads subtitle content into specified track
   * @param {string} content - SRT content
   * @param {boolean} isSecondary - Whether to load into secondary track
   */
  async loadSubtitles(content, isSecondary = false) {
    // Ensure overlay is initialized first
    if (!this.overlay) {
      await this.initializeOverlay();
    }
    
    const track = isSecondary ? this.tracks.secondary : this.tracks.primary;
    track.loadSubtitles(content);
    this.updateDisplay();
  }

  // Playback control methods
  togglePlayPause() {
    this.isPlaying ? this.pause() : this.play();
  }

  play() {
    this.isPlaying = true;
    this.playPauseButton.textContent = chrome.i18n.getMessage('pause');
    this.startTimer();
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.textContent = chrome.i18n.getMessage('play');
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  /**
   * Starts the playback timer using requestAnimationFrame
   */
  startTimer() {
    let lastTime = performance.now();
    
    const updateFrame = (currentTime) => {
      if (!this.isPlaying) return;
      
      const deltaTime = currentTime - lastTime;
      for (const track of Object.values(this.tracks)) {
        track.currentTimeMs += deltaTime;
      }
      
      this.updateDisplay();
      lastTime = currentTime;
      this.animationFrameId = requestAnimationFrame(updateFrame);
    };
    
    this.animationFrameId = requestAnimationFrame(updateFrame);
  }

  /**
   * Updates all UI elements to reflect current state
   * Updates subtitle text, progress bars, and time displays for both tracks
   */
  updateDisplay() {
    // Update subtitle text displays
    for (const [key, track] of Object.entries(this.tracks)) {
      const textContainer = this.overlay.querySelector(`.subtitle-text.${key}`);
      const currentSub = track.getCurrentSubtitle();
      textContainer.textContent = currentSub ? currentSub.text : '';
    }

    // Update progress bars and time displays for each track
    const controls = this.overlay.querySelectorAll('.track-controls');
    Object.entries(this.tracks).forEach(([key, track], index) => {
      const progressBar = controls[index].querySelector('.progress-bar');
      const timeDisplay = controls[index].querySelector('.time-display');
      
      // Update progress bar max value and current position
      progressBar.max = track.duration;
      progressBar.value = track.currentTimeMs;
      
      // Only update time display if it's not being edited
      if (document.activeElement !== timeDisplay) {
        timeDisplay.value = this.formatTimeDisplay(track.currentTimeMs, track.duration);
      }
    });
  }

  /**
   * Formats time values into human-readable string
   * @param {number} current - Current time in milliseconds
   * @param {number} total - Total duration in milliseconds
   * @returns {string} Formatted time string "HH:MM:SS / HH:MM:SS"
   */
  formatTimeDisplay(current, total) {
    const format = (ms) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    };
    return `${format(current)} / ${format(total)}`;
  }

  /**
   * Parses user-input time string into milliseconds
   * @param {string} timeStr - Time string in format "HH:MM:SS / HH:MM:SS"
   * @returns {number|null} Time in milliseconds, or null if invalid format
   */
  parseTimeInput(timeStr) {
    try {
      const timePart = timeStr.split('/')[0].trim();
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
      return (hours * 3600000 + minutes * 60000 + seconds * 1000);
    } catch {
      return null;
    }
  }
}

// Wait for the message from popup:
let player = null;

// Initialize message listeners with proper async handling
async function initializePlayer() {
    if (!player) {
        player = new DualSubtitlePlayer();
        await player.initializeOverlay(); // Ensure overlay is created
    }
    return player;
}

// Modified message listener with proper async/await
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'createSubtitleOverlay') {
        (async () => {
            try {
                const currentPlayer = await initializePlayer();
                await currentPlayer.loadSubtitles(message.srtContent, message.isSecondary);
                sendResponse({ success: true });
            } catch (error) {
                console.error('Subtitle loading error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep the message channel open
    }
    return true;
});