const { contextBridge, ipcRenderer } = require('electron');

// Minimal preload for YouTube view
contextBridge.exposeInMainWorld('electronAPI', {
  // Send YouTube player state changes to main process
  sendPlayerState: (state) => {
    ipcRenderer.send('youtube-player-state', state);
  },

  // Send YouTube player events to main process
  sendPlayerEvent: (event, data) => {
    ipcRenderer.send('youtube-player-event', event, data);
  }
});