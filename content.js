/**
 * SubtitlePlayer - A class that manages the display and playback of SRT subtitles
 * in a Chrome extension environment. It creates an overlay for subtitles and
 * provides playback controls including play, pause, and seeking functionality.
 */
class SubtitlePlayer {
  // Class fields - modern JavaScript approach
  subtitles = [];
  currentIndex = 0;
  isPlaying = false;
  startTime = 0;
  timeOffset = 0;
  currentTimeMs = 0;
  duration = 0;
  
  // DOM elements that need class-wide access
  overlay = null;
  progressBar = null;
  timeDisplay = null;
  playPauseButton = null;
  timerInterval = null;
  animationFrameId = null;

  /**
   * Initialize the SubtitlePlayer and set up message handling
   * for Chrome extension communication.
   */
  constructor() {
    this.setupMessageListener();
  }

  /**
   * Establishes a message listener for communication with the Chrome extension
   * using async/await pattern for better error handling.
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      try {
        if (message.action === 'createSubtitleOverlay') {
          await this.initializeOverlay();
          await this.loadSubtitles(message.srtContent);
          sendResponse({ success: true });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keeps message port open for async operations
    });
  }

  /**
   * Creates and initializes the DOM elements for the subtitle overlay and controls.
   * Uses modern DOM manipulation methods and error handling.
   * @returns {Promise<void>}
   */
  async initializeOverlay() {
    if (!this.overlay) {
      try {
        // Create main subtitle display overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'subtitle-overlay';
        
        // Create subtitle text container
        const textContainer = document.createElement('div');
        textContainer.className = 'subtitle-text';
        this.overlay.appendChild(textContainer);
        
        // Create controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'controls-container';
        
        // Initialize progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        // Initialize play/pause button
        this.playPauseButton = document.createElement('button');
        this.playPauseButton.className = 'subtitle-button';
        this.playPauseButton.textContent = 'Play';
        this.playPauseButton.addEventListener('click', () => this.togglePlayPause());
        
        // Initialize progress slider
        this.progressBar = document.createElement('input');
        Object.assign(this.progressBar, {
          type: 'range',
          className: 'progress-bar',
          min: '0',
          step: '100',
          value: '0'
        });
        
        this.progressBar.addEventListener('input', (e) => {
          this.currentTimeMs = parseInt(e.target.value);
          this.updateSubtitleDisplay();
          this.updateTimeDisplay();
        });
        
        // Initialize editable time display
        this.timeDisplay = document.createElement('input');
        Object.assign(this.timeDisplay, {
          type: 'text',
          className: 'time-display',
          readOnly: false
        });
        
        // Add time display input handler
        this.timeDisplay.addEventListener('change', (e) => {
          const newTime = this.parseTimeInput(e.target.value);
          if (newTime !== null && newTime >= 0 && newTime <= this.duration) {
            this.currentTimeMs = newTime;
            this.progressBar.value = this.currentTimeMs;
            this.updateSubtitleDisplay();
            this.updateTimeDisplay();
          } else {
            this.updateTimeDisplay(); // Reset to current time if invalid
          }
        });
        
        // Create reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'subtitle-button';
        resetButton.textContent = 'Reset';
        resetButton.addEventListener('click', () => this.reset());
        
        // Assemble the controls
        progressContainer.append(this.progressBar);
        controlsContainer.append(
          this.playPauseButton,
          progressContainer,
          this.timeDisplay,
          resetButton
        );
        
        this.overlay.append(textContainer, controlsContainer);
        document.body.appendChild(this.overlay);
      } catch (error) {
        console.error('Error initializing overlay:', error);
        throw new Error('Failed to initialize subtitle overlay');
      }
    }
  }

  /**
   * Parses SRT format subtitle content into structured data using modern string methods.
   * @param {string} content - Raw SRT format subtitle content
   * @returns {Array} Array of objects containing {start, end, text} for each subtitle
   */
  parseSRT(content) {
    try {
      const blocks = content.trim().split('\n\n');
      return blocks.map(block => {
        const [, timecode, ...textLines] = block.split('\n');
        const [startTime, endTime] = timecode.split(' --> ');
        return {
          start: this.timeToMs(startTime),
          end: this.timeToMs(endTime),
          text: textLines.join('\n')
        };
      });
    } catch (error) {
      console.error('Error parsing SRT:', error);
      throw new Error('Invalid SRT format');
    }
  }

  parseTimeInput(timeStr) {
    try {
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
      return (hours * 3600000 + minutes * 60000 + seconds * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Converts SRT timestamp format (HH:MM:SS,mmm) to milliseconds
   * @param {string} timeStr - Timestamp in SRT format
   * @returns {number} Time in milliseconds
   */
  timeToMs(timeStr) {
    try {
      const [time, ms] = timeStr.split(',');
      const [hours, minutes, seconds] = time.split(':').map(Number);
      return (hours * 3600000 + minutes * 60000 + seconds * 1000 + parseInt(ms));
    } catch (error) {
      console.error('Error converting time:', error);
      throw new Error('Invalid timestamp format');
    }
  }

  /**
   * Loads and processes subtitle content, initializing the player state
   * @param {string} content - Raw SRT subtitle content to load
   * @returns {Promise<void>}
   */
  async loadSubtitles(content) {
    try {
      this.subtitles = this.parseSRT(content);
      this.duration = this.subtitles[this.subtitles.length - 1]?.end ?? 0;
      this.progressBar.max = this.duration;
      await this.reset();
      console.log('Loaded subtitles:', this.subtitles.length, 'Duration:', this.duration);
    } catch (error) {
      console.error('Error loading subtitles:', error);
      throw new Error('Failed to load subtitles');
    }
  }

  /**
   * Toggles between play and pause states
   */
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Starts or resumes subtitle playback using requestAnimationFrame for smoother updates
   */
  play() {
    if (!this.subtitles.length) return;
    
    this.isPlaying = true;
    this.playPauseButton.textContent = 'Pause';
    
    this.startTimer();
  }

  /**
   * Initializes the playback timer using requestAnimationFrame for better performance
   */
  startTimer() {
    let lastTime = performance.now();
    
    const updateFrame = (currentTime) => {
      if (!this.isPlaying) return;
      
      const deltaTime = currentTime - lastTime;
      this.currentTimeMs += deltaTime;
      
      if (this.currentTimeMs >= this.duration) {
        this.reset();
        return;
      }
      
      this.progressBar.value = this.currentTimeMs;
      this.updateSubtitleDisplay();
      this.updateTimeDisplay();
      
      lastTime = currentTime;
      this.animationFrameId = requestAnimationFrame(updateFrame);
    };
    
    this.animationFrameId = requestAnimationFrame(updateFrame);
  }

  /**
   * Pauses subtitle playback and cleans up animation frame
   */
  pause() {
    this.isPlaying = false;
    this.playPauseButton.textContent = 'Play';
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Resets the player to initial state
   * Clears current subtitle, resets time to 0, and stops playback
   */
  async reset() {
    this.currentTimeMs = 0;
    this.currentIndex = 0;
    this.isPlaying = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.playPauseButton.textContent = 'Play';
    this.progressBar.value = '0';
    await Promise.all([
      this.updateSubtitleDisplay(),
      this.updateTimeDisplay()
    ]);
  }

  // Add new method to parse time input
  parseTimeInput(timeStr) {
    try {
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
      return (hours * 3600000 + minutes * 60000 + seconds * 1000);
    } catch (error) {
      return null;
    }
  }

  updateSubtitleDisplay() {
    try {
      const currentSub = this.subtitles.find(sub => 
        this.currentTimeMs >= sub.start && this.currentTimeMs <= sub.end
      );
      
      const textContainer = this.overlay.querySelector('.subtitle-text');
      textContainer.textContent = currentSub ? currentSub.text : '';
    } catch (error) {
      console.error('Error updating subtitle display:', error);
    }
  }

  /**
   * Updates the time display showing current position and total duration
   * Formats time as HH:MM:SS
   */
  updateTimeDisplay() {
    try {
      const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
      };
      
      this.timeDisplay.textContent = `${formatTime(this.currentTimeMs)} / ${formatTime(this.duration)}`;
    } catch (error) {
      console.error('Error updating time display:', error);
    }
  }
}

// Create a single instance of SubtitlePlayer when the script loads
const subtitlePlayer = new SubtitlePlayer();