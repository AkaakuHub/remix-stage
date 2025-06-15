const { app, BrowserWindow, WebContentsView, ipcMain, protocol } = require('electron');
const path = require('path');
const https = require('https');

// Set default protocol for OAuth callbacks
app.setAsDefaultProtocolClient('remixstage');

let mainWindow;
let mainView;
let youtubeView;
let mainViewLoaded = false;
let youtubeViewLoaded = false;

// Security configuration following best practices
const createSecureWebPreferences = () => ({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(__dirname, '../preload/preload.js')
});

// Function to show window when both views are ready
function checkAndShowWindow() {
  if (mainViewLoaded && youtubeViewLoaded && mainWindow) {
    console.log('Both views loaded, showing window');
    mainWindow.show();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
}

// Function to load dev server with retry logic
async function loadDevServerWithRetry(maxRetries = 10, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to development server (attempt ${i + 1}/${maxRetries})`);
      await mainView.webContents.loadURL('http://localhost:3000');
      console.log('Successfully connected to development server');
      return;
    } catch (error) {
      console.log(`Connection attempt ${i + 1} failed:`, error.message);
      if (i < maxRetries - 1) {
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to development server after all retries');
}

function createWindow() {
  // Reset load states
  mainViewLoaded = false;
  youtubeViewLoaded = false;

  // Create main window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: createSecureWebPreferences(),
    titleBarStyle: 'hiddenInset',
    show: true, // Show immediately instead of waiting
    center: true, // Center the window on screen
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'YouTube Remix Stage'
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
  
  console.log('Window created and views added');
  console.log('Window bounds:', mainWindow.getBounds());
  console.log('Window visible:', mainWindow.isVisible());
  console.log('Window minimized:', mainWindow.isMinimized());

  // Set initial bounds for views
  const windowBounds = mainWindow.getBounds();
  layoutViews(windowBounds.width, windowBounds.height);

  // Load main renderer (React app in development, built files in production)
  const isDev = process.env.NODE_ENV === 'development';
  console.log('isDev:', isDev);
  if (isDev) {
    console.log('Loading development server at http://localhost:3000');
    loadDevServerWithRetry();
    // Enable DevTools in development
    mainView.webContents.openDevTools();
  } else {
    console.log('Loading production build from:', path.join(__dirname, '../renderer/build/index.html'));
    mainView.webContents.loadFile(path.join(__dirname, '../renderer/build/index.html'));
  }

  // Load YouTube view HTML
  console.log('Loading YouTube view from:', path.join(__dirname, '../youtube-view/youtube.html'));
  youtubeView.webContents.loadFile(path.join(__dirname, '../youtube-view/youtube.html'));

  // Handle window resize to adjust view layouts
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    layoutViews(bounds.width, bounds.height);
  });

  // Show window when ready (fallback)
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // Add error handling for load failures
  mainView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Main view failed to load:', errorCode, errorDescription, validatedURL);
    
    // If it's a dev server connection failure, try again
    if (process.env.NODE_ENV === 'development' && errorCode === -102) {
      console.log('Development server connection failed, retrying...');
      setTimeout(() => {
        loadDevServerWithRetry(5, 2000);
      }, 2000);
    }
  });

  youtubeView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('YouTube view failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainView.webContents.on('did-finish-load', () => {
    console.log('Main view finished loading');
    mainViewLoaded = true;
    checkAndShowWindow();
  });

  youtubeView.webContents.on('did-finish-load', () => {
    console.log('YouTube view finished loading');
    youtubeViewLoaded = true;
    checkAndShowWindow();
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
  if (mainView && mainView.webContents) {
    mainView.webContents.send('youtube-state-change', state);
  }
});

ipcMain.on('youtube-player-event', (event, eventType, data) => {
  // Forward YouTube player events to main view
  if (mainView && mainView.webContents) {
    mainView.webContents.send('youtube-event', eventType, data);
  }
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
    if (mainView && mainView.webContents) {
      mainView.webContents.send('oauth-callback', url);
    }
  }
});

// Handle second instance for Windows/Linux OAuth
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    const url = commandLine.find(arg => arg.startsWith('remixstage://'));
    if (url && mainView && mainView.webContents) {
      mainView.webContents.send('oauth-callback', url);
    }
    
    // Focus main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Standard Electron app lifecycle
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.show();
  }
  createWindow();
});

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