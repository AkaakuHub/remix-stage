const { app, BrowserWindow, WebContentsView, ipcMain, protocol } = require('electron');
const path = require('path');
const https = require('https');

// Set default protocol for OAuth callbacks
app.setAsDefaultProtocolClient('remixstage');

let mainWindow;
let mainView;
let youtubeView;

// Security configuration following best practices
const createSecureWebPreferences = () => ({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(__dirname, '../preload/preload.js')
});

function createWindow() {
  // Create main window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: createSecureWebPreferences(),
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // Create WebContentsView for main UI
  mainView = new WebContentsView({
    webPreferences: createSecureWebPreferences()
  });

  // Create isolated WebContentsView for YouTube IFrame Player
  youtubeView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/youtube-preload.js')
    }
  });

  // Add views to main window
  mainWindow.contentView.addChildView(mainView);
  mainWindow.contentView.addChildView(youtubeView);

  // Set initial bounds for views
  const windowBounds = mainWindow.getBounds();
  layoutViews(windowBounds.width, windowBounds.height);

  // Load main renderer (React app in development, built files in production)
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainView.webContents.loadURL('http://localhost:3000');
    // Enable DevTools in development
    mainView.webContents.openDevTools();
  } else {
    mainView.webContents.loadFile(path.join(__dirname, '../renderer/build/index.html'));
  }

  // Load YouTube view HTML
  youtubeView.webContents.loadFile(path.join(__dirname, '../youtube-view/youtube.html'));

  // Handle window resize to adjust view layouts
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    layoutViews(bounds.width, bounds.height);
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

function layoutViews(width, height) {
  // Main view takes left side (70% of width)
  const mainWidth = Math.floor(width * 0.7);
  mainView.setBounds({
    x: 0,
    y: 0,
    width: mainWidth,
    height: height
  });

  // YouTube view takes right side (30% of width)
  youtubeView.setBounds({
    x: mainWidth,
    y: 0,
    width: width - mainWidth,
    height: height
  });
}

// IPC handlers for YouTube player control
ipcMain.handle('youtube:load-video', async (event, videoId) => {
  youtubeView.webContents.executeJavaScript(`
    if (window.player && window.player.loadVideoById) {
      window.player.loadVideoById('${videoId}');
    }
  `);
});

ipcMain.handle('youtube:play', async () => {
  youtubeView.webContents.executeJavaScript(`
    if (window.player && window.player.playVideo) {
      window.player.playVideo();
    }
  `);
});

ipcMain.handle('youtube:pause', async () => {
  youtubeView.webContents.executeJavaScript(`
    if (window.player && window.player.pauseVideo) {
      window.player.pauseVideo();
    }
  `);
});

ipcMain.handle('youtube:set-volume', async (event, volume) => {
  youtubeView.webContents.executeJavaScript(`
    if (window.player && window.player.setVolume) {
      window.player.setVolume(${volume});
    }
  `);
});

ipcMain.handle('youtube:get-current-time', async () => {
  return youtubeView.webContents.executeJavaScript(`
    window.player && window.player.getCurrentTime ? window.player.getCurrentTime() : 0
  `);
});

ipcMain.handle('youtube:seek-to', async (event, seconds) => {
  youtubeView.webContents.executeJavaScript(`
    if (window.player && window.player.seekTo) {
      window.player.seekTo(${seconds});
    }
  `);
});

// IPC handlers for YouTube player state updates
ipcMain.on('youtube-player-state', (event, state) => {
  // Forward YouTube player state to main view
  mainView.webContents.send('youtube-state-change', state);
});

ipcMain.on('youtube-player-event', (event, eventType, data) => {
  // Forward YouTube player events to main view
  mainView.webContents.send('youtube-event', eventType, data);
});

// YouTube API handler - executes in Node.js environment to avoid CORS
ipcMain.handle('youtube:search', async (event, query, apiKey) => {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('API_KEY_MISSING'));
      return;
    }

    if (!query || query.trim().length === 0) {
      reject(new Error('INVALID_QUERY'));
      return;
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&` +
      `type=video&` +
      `q=${encodeURIComponent(query.trim())}&` +
      `maxResults=12&` +
      `key=${apiKey}`;

    const request = https.get(searchUrl, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          if (response.statusCode === 200) {
            const result = JSON.parse(data);
            resolve(result);
          } else {
            const errorData = JSON.parse(data);
            console.error('YouTube API Error:', errorData);
            reject(new Error(`API_ERROR: ${errorData.error?.message || 'Unknown error'}`));
          }
        } catch (parseError) {
          console.error('JSON Parse Error:', parseError);
          reject(new Error('PARSE_ERROR'));
        }
      });
    });

    request.on('error', (error) => {
      console.error('Request Error:', error);
      reject(new Error(`NETWORK_ERROR: ${error.message}`));
    });

    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('TIMEOUT'));
    });
  });
});

// Handle OAuth callback URLs
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('remixstage://')) {
    // Forward OAuth callback to renderer
    mainView.webContents.send('oauth-callback', url);
  }
});

// Handle second instance for Windows/Linux OAuth
app.on('second-instance', (event, commandLine) => {
  const url = commandLine.find(arg => arg.startsWith('remixstage://'));
  if (url) {
    mainView.webContents.send('oauth-callback', url);
  }
  
  // Focus main window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Standard Electron app lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, url) => {
    event.preventDefault();
  });
});