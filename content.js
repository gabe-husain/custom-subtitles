class SubtitleTrack {
  subtitles = [];
  currentTimeMs = 0;
  duration = 0;
  timeOffset = 0;

  constructor(color = 'white') {
    this.color = color;
  }

  loadSubtitles(content) {
    this.subtitles = this.parseSRT(content);
    this.duration = this.subtitles[this.subtitles.length - 1]?.end ?? 0;
    this.currentTimeMs = 0;
  }

  getCurrentSubtitle() {
    const adjustedTime = this.currentTimeMs + this.timeOffset;
    return this.subtitles.find(sub => 
      adjustedTime >= sub.start && adjustedTime <= sub.end
    );
  }

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

  timeToMs(timeStr) {
    const [time, ms] = timeStr.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return (hours * 3600000 + minutes * 60000 + seconds * 1000 + parseInt(ms));
  }
}

class DualSubtitlePlayer {
  isPlaying = false;
  syncEnabled = true;
  tracks = {
    primary: new SubtitleTrack('white'),
    secondary: new SubtitleTrack('yellow')
  };
  
  constructor() {
    this.setupMessageListener();
  }

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

      // Create controls for each track
      const controlsWrapper = document.createElement('div');
      controlsWrapper.className = 'controls-wrapper';
      
      for (const [key, track] of Object.entries(this.tracks)) {
        const controls = this.createTrackControls(key);
        controlsWrapper.appendChild(controls);
      }

      // Add sync toggle
      const syncToggle = document.createElement('button');
      syncToggle.className = 'sync-toggle';
      syncToggle.textContent = 'Sync: On';
      syncToggle.addEventListener('click', () => {
        this.syncEnabled = !this.syncEnabled;
        syncToggle.textContent = `Sync: ${this.syncEnabled ? 'On' : 'Off'}`;
      });

      const masterControls = document.createElement('div');
      masterControls.className = 'master-controls';
      
      this.playPauseButton = document.createElement('button');
      this.playPauseButton.className = 'subtitle-button';
      this.playPauseButton.textContent = 'Play';
      this.playPauseButton.addEventListener('click', () => this.togglePlayPause());
      
      masterControls.append(this.playPauseButton, syncToggle);
      controlsWrapper.appendChild(masterControls);
      
      this.overlay.appendChild(controlsWrapper);
      document.body.appendChild(this.overlay);
    }
  }

  createTrackControls(trackKey) {
    const track = this.tracks[trackKey];
    const container = document.createElement('div');
    container.className = 'track-controls';
    
    const progressBar = document.createElement('input');
    Object.assign(progressBar, {
      type: 'range',
      className: 'progress-bar',
      min: '0',
      step: '100',
      value: '0'
    });

    progressBar.addEventListener('input', (e) => {
      const newTime = parseInt(e.target.value);
      if (this.syncEnabled) {
        this.setAllTracksTime(newTime, trackKey);
      } else {
        track.currentTimeMs = newTime;
      }
      this.updateDisplay();
    });

    const timeDisplay = document.createElement('input');
    Object.assign(timeDisplay, {
      type: 'text',
      className: 'time-display',
      value: '00:00:00 / 00:00:00'
    });

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

  loadSubtitles(content, isSecondary = false) {
    const track = isSecondary ? this.tracks.secondary : this.tracks.primary;
    track.loadSubtitles(content);
    this.updateDisplay();
  }

  togglePlayPause() {
    this.isPlaying ? this.pause() : this.play();
  }

  play() {
    this.isPlaying = true;
    this.playPauseButton.textContent = 'Pause';
    this.startTimer();
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.textContent = 'Play';
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

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

  updateDisplay() {
    // Update subtitle text
    for (const [key, track] of Object.entries(this.tracks)) {
      const textContainer = this.overlay.querySelector(`.subtitle-text.${key}`);
      const currentSub = track.getCurrentSubtitle();
      textContainer.textContent = currentSub ? currentSub.text : '';
    }

    // Update progress bars and time displays
    const controls = this.overlay.querySelectorAll('.track-controls');
    Object.entries(this.tracks).forEach(([key, track], index) => {
      const progressBar = controls[index].querySelector('.progress-bar');
      const timeDisplay = controls[index].querySelector('.time-display');
      
      progressBar.max = track.duration;
      progressBar.value = track.currentTimeMs;
      
      if (document.activeElement !== timeDisplay) {
        timeDisplay.value = this.formatTimeDisplay(track.currentTimeMs, track.duration);
      }
    });
  }

  formatTimeDisplay(current, total) {
    const format = (ms) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    };
    return `${format(current)} / ${format(total)}`;
  }

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

const player = new DualSubtitlePlayer();