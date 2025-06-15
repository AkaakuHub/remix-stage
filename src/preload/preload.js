const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // YouTube player controls
  youtube: {
    loadVideo: (videoId) => ipcRenderer.invoke('youtube:load-video', videoId),
    play: () => ipcRenderer.invoke('youtube:play'),
    pause: () => ipcRenderer.invoke('youtube:pause'),
    setVolume: (volume) => ipcRenderer.invoke('youtube:set-volume', volume),
    getCurrentTime: () => ipcRenderer.invoke('youtube:get-current-time'),
    seekTo: (seconds) => ipcRenderer.invoke('youtube:seek-to', seconds),
    search: (query, apiKey) => ipcRenderer.invoke('youtube:search', query, apiKey)
  },

  // OAuth callback listener
  onOAuthCallback: (callback) => {
    ipcRenderer.on('oauth-callback', (event, url) => callback(url));
  },

  // Remove OAuth callback listener
  removeOAuthCallback: () => {
    ipcRenderer.removeAllListeners('oauth-callback');
  }
});