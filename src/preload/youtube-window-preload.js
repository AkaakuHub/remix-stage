const { contextBridge, ipcRenderer } = require('electron');

// Minimal preload for YouTube capture windows
// These windows are dedicated for video capture only

console.log('[YouTube Window Preload] Initializing YouTube capture window...');

// Expose minimal API for YouTube window control
contextBridge.exposeInMainWorld('electronAPI', {
  // Basic communication with main process
  sendMessage: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  
  // Receive messages from main process
  onMessage: (channel, callback) => {
    ipcRenderer.on(channel, callback);
  }
});

// Window optimization for video capture
window.addEventListener('DOMContentLoaded', () => {
  console.log('[YouTube Window] DOM loaded, optimizing for capture...');
  
  // Remove unnecessary elements that might interfere with capture
  const style = document.createElement('style');
  style.textContent = `
    /* Hide YouTube UI elements for cleaner capture */
    .ytp-chrome-top,
    .ytp-chrome-bottom,
    .ytp-gradient-top,
    .ytp-gradient-bottom {
      opacity: 0.3 !important;
      transition: opacity 0.3s ease !important;
    }
    
    /* Ensure video takes full window */
    #movie_player {
      width: 100% !important;
      height: 100% !important;
    }
    
    /* Hide distracting elements during capture */
    .ytp-paid-content-overlay,
    .ytp-ce-element,
    .ytp-cards-teaser,
    .ytp-endscreen-element {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
  
  // Auto-focus for better interaction
  window.focus();
});

// Prevent context menu for cleaner capture
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Optimize for smooth video playback
window.addEventListener('load', () => {
  console.log('[YouTube Window] Window loaded, ready for capture');
  
  // Disable text selection for cleaner capture
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  
  // Prevent drag and drop
  document.body.style.pointerEvents = 'auto';
});