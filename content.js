// Main SubtitlePlayer class
class SubtitlePlayer {
  subtitles = [];
  currentIndex = 0;
  isPlaying = false;
  startTime = 0;
  timeOffset = 0;
  currentTimeMs = 0;
  duration = 0;
  
  overlay = null;
  progressBar = null;
  timeDisplay = null;
  playPauseButton = null;
  animationFrameId = null;

  constructor() {
    this.setupMessageListener();
  }

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
      return true;
    });
  }

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
        
        // Initialize progress container
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
        
        // Create time control group
        const timeControlGroup = document.createElement('div');
        timeControlGroup.className = 'time-control-group';
        
        // Initialize time display
        this.timeDisplay = document.createElement('input');
        Object.assign(this.timeDisplay, {
          type: 'text',
          className: 'time-display',
          readOnly: false,
          value: '00:00:00 / 00:00:00'
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
        
        // Initialize skip button
        const skipButton = document.createElement('button');
        skipButton.className = 'skip-button';
        skipButton.textContent = 'Skip';
        skipButton.addEventListener('click', () => {
          const newTime = this.parseTimeInput(this.timeDisplay.value);
          if (newTime !== null && newTime >= 0 && newTime <= this.duration) {
            this.currentTimeMs = newTime;
            this.progressBar.value = this.currentTimeMs;
            this.updateSubtitleDisplay();
            this.updateTimeDisplay();
          }
        });
        
        // Create reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'subtitle-button';
        resetButton.textContent = 'Reset';
        resetButton.addEventListener('click', () => this.reset());
        
        // Assemble time control group
        timeControlGroup.append(
          this.timeDisplay,
          skipButton
        );
        
        // Assemble the controls
        progressContainer.append(this.progressBar);
        controlsContainer.append(
          this.playPauseButton,
          progressContainer,
          timeControlGroup,
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

  parseSRT(content) {
    try {
      // Split blocks by two or more consecutive line breaks, allowing for different whitespace
      const blocks = content.trim().split(/\r?\n\r?\n+/);
      
      return blocks.map(block => {
        // Split the block into lines, preserving original line breaks
        const lines = block.split(/\r?\n/);
        
        // First line is the subtitle number
        const [index, timecode, ...textLines] = lines;
        
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

  parseTimeInput(timeStr) {
    try {
      // Handle input with or without total duration part
      const timePart = timeStr.split('/')[0].trim();
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
      return (hours * 3600000 + minutes * 60000 + seconds * 1000);
    } catch (error) {
      return null;
    }
  }

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

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (!this.subtitles.length) return;
    
    this.isPlaying = true;
    this.playPauseButton.textContent = 'Pause';
    
    this.startTimer();
  }

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

  pause() {
    this.isPlaying = false;
    this.playPauseButton.textContent = 'Play';
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

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

  updateTimeDisplay() {
    try {
      const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
      };
      
      // Only update the value if the input is not focused
      if (document.activeElement !== this.timeDisplay) {
        this.timeDisplay.value = `${formatTime(this.currentTimeMs)} / ${formatTime(this.duration)}`;
      }
    } catch (error) {
      console.error('Error updating time display:', error);
    }
  }
}

// Create instance
const subtitlePlayer = new SubtitlePlayer();