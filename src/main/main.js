const { app, BrowserWindow, WebContentsView, ipcMain, protocol } = require('electron');
const path = require('path');
const https = require('https');

// Set default protocol for OAuth callbacks
app.setAsDefaultProtocolClient('remixstage');

let mainWindow;
let mainView;
// Legacy YouTube view for compatibility
let youtubeView;
// New approach: Dedicated frameless BrowserWindows for YouTube capture
let youtubeWindowA; // Dedicated window for YouTube Layer A
let youtubeWindowB; // Dedicated window for YouTube Layer B
let mainViewLoaded = false;
let youtubeViewLoaded = false;
let youtubeWindowALoaded = false;
let youtubeWindowBLoaded = false;

// Security configuration following best practices
const createSecureWebPreferences = () => ({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(__dirname, '../preload/preload.js')
});

// Function to show window when all views are ready
function checkAndShowWindow() {
  if (mainViewLoaded && youtubeViewLoaded && youtubeWindowALoaded && youtubeWindowBLoaded && mainWindow) {
    console.log('All views and YouTube windows loaded, showing window');
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
  youtubeWindowALoaded = false;
  youtubeWindowBLoaded = false;

  // Create main window
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1400,
    minHeight: 800,
    webPreferences: createSecureWebPreferences(),
    titleBarStyle: 'default',
    show: true,
    center: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'YouTube Remix Stage'
  });

  // Create WebContentsView for main UI
  mainView = new WebContentsView({
    webPreferences: createSecureWebPreferences()
  });

  // Create isolated WebContentsView for YouTube IFrame Player (legacy compatibility)
  youtubeView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/youtube-preload.js')
    }
  });

  // Create dedicated frameless BrowserWindows for YouTube capture
  // These will be positioned off-screen for pure video capture
  const youtubeWindowConfig = {
    width: 1280,
    height: 720,
    x: -1300, // Position off-screen to the left
    y: 0,
    frame: false, // Frameless for clean capture
    show: false, // Start hidden, will show when needed
    skipTaskbar: true, // Don't show in taskbar
    alwaysOnTop: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Need to disable sandbox for YouTube
      webSecurity: false, // May need to disable for YouTube embedding
      preload: path.join(__dirname, '../preload/youtube-window-preload.js')
    }
  };

  // YouTube Window A (Layer 1)
  youtubeWindowA = new BrowserWindow({
    ...youtubeWindowConfig,
    y: 0,
    title: 'YouTube Layer A'
  });

  // YouTube Window B (Layer 2) 
  youtubeWindowB = new BrowserWindow({
    ...youtubeWindowConfig,
    y: 750, // Position below Window A
    title: 'YouTube Layer B'
  });

  // Add main view to main window
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
    
    // Enable DevTools in production with keyboard shortcut
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainView.webContents.openDevTools();
      }
    });
  }

  // Load YouTube view HTML for legacy compatibility
  console.log('Loading legacy YouTube view from:', path.join(__dirname, '../youtube-view/youtube.html'));
  youtubeView.webContents.loadFile(path.join(__dirname, '../youtube-view/youtube.html'));

  // Load dedicated YouTube windows
  console.log('Loading YouTube capture windows...');
  youtubeWindowA.loadFile(path.join(__dirname, '../youtube-window/youtube-player.html'));
  youtubeWindowB.loadFile(path.join(__dirname, '../youtube-window/youtube-player.html'));

  // Handle window resize to adjust view layouts
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    layoutViews(bounds.width, bounds.height);
  });

  // Add IPC handler for desktop capture
  ipcMain.handle('get-desktop-sources', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return sources;
  });

  // Add IPC handler for capturing YouTube BrowserWindows
  ipcMain.handle('capture-youtube-window', async (event, layerId) => {
    console.log(`[YouTube Window Capture] Starting capture for layerId: ${layerId}`);
    
    try {
      const targetWindow = getYouTubeWindowByLayerId(layerId);
      
      if (!targetWindow) {
        throw new Error(`YouTube window not found for layer: ${layerId}`);
      }
      
      // Capture the specific YouTube window content
      const image = await targetWindow.webContents.capturePage();
      
      return {
        layerId: layerId,
        image: image.toDataURL(),
        bounds: targetWindow.getBounds()
      };
      
    } catch (error) {
      console.error(`[YouTube Window Capture] Error for ${layerId}:`, error);
      throw new Error(`Failed to capture YouTube window ${layerId}: ${error.message}`);
    }
  });

  // Legacy IPC handler for capturing specific YouTube WebContentsView
  ipcMain.handle('capture-youtube-view', async (event, layerId) => {
    console.log(`[YouTube View Capture] Starting capture for layerId: ${layerId}`);
    
    try {
      // Capture the specific YouTube view content
      const image = await youtubeView.webContents.capturePage();
      
      return {
        layerId: layerId,
        image: image.toDataURL(),
        bounds: youtubeView.getBounds()
      };
      
    } catch (error) {
      console.error(`[YouTube View Capture] Error for ${layerId}:`, error);
      throw new Error(`Failed to capture YouTube view ${layerId}: ${error.message}`);
    }
  });

  // Add IPC handler for capturing specific WebContentsView
  ipcMain.handle('capture-view', async (event, viewType) => {
    console.log(`[Desktop Capture] Starting capture for viewType: ${viewType}`);
    
    try {
      // Check if we have screen recording permission on macOS
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const hasPermission = systemPreferences.getMediaAccessStatus('screen');
        console.log(`[Desktop Capture] macOS screen access status: ${hasPermission}`);
        
        if (hasPermission !== 'granted') {
          console.log('[Desktop Capture] Requesting screen access permission...');
          systemPreferences.askForMediaAccess('screen');
          // On macOS, we need to wait for permission to be granted
          throw new Error('Screen recording permission required. Please grant permission in System Preferences.');
        }
      }
      
      const { desktopCapturer } = require('electron');
      
      console.log('[Desktop Capture] Getting available sources...');
      
      // Get all available sources with more permissive options
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 300, height: 200 },
        fetchWindowIcons: false
      });
      
      console.log(`[Desktop Capture] Found ${sources.length} sources:`, sources.map(s => ({
        name: s.name,
        id: s.id.substring(0, 20) + '...'
      })));
      
      if (sources.length === 0) {
        throw new Error('No capture sources available. Check permissions.');
      }
      
      // First try to find our specific app window
      let targetSource = sources.find(source => 
        source.name.includes('YouTube Remix Stage') || 
        source.name.includes('Electron') ||
        source.name.includes('remix-stage')
      );
      
      // If not found, use the first screen source as fallback
      if (!targetSource) {
        console.log('[Desktop Capture] App window not found, looking for screen...');
        targetSource = sources.find(source => source.name.includes('Screen')) || sources[0];
      }
      
      if (targetSource) {
        console.log(`[Desktop Capture] Selected source: "${targetSource.name}" (ID: ${targetSource.id.substring(0, 20)}...)`);
        return {
          id: targetSource.id,
          name: targetSource.name,
          thumbnail: targetSource.thumbnail.toDataURL()
        };
      }
      
      throw new Error('No suitable capture source found after checking all sources');
      
    } catch (error) {
      console.error('[Desktop Capture] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        platform: process.platform
      });
      throw new Error(`Failed to get sources: ${error.message}`);
    }
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

  youtubeWindowA.webContents.on('did-finish-load', () => {
    console.log('YouTube Window A finished loading');
    youtubeWindowALoaded = true;
    checkAndShowWindow();
  });

  youtubeWindowB.webContents.on('did-finish-load', () => {
    console.log('YouTube Window B finished loading');
    youtubeWindowBLoaded = true;
    checkAndShowWindow();
  });
}

function layoutViews(width, height) {
  // Main view takes full window - we handle layout internally with React
  mainView.setBounds({
    x: 0,
    y: 0,
    width: width,
    height: height
  });

  // Hide legacy YouTube view for API compatibility
  youtubeView.setBounds({
    x: -1000,
    y: -1000,
    width: 1,
    height: 1
  });

  // YouTube windows are managed as separate BrowserWindows
  // No need to adjust their bounds here - they maintain their off-screen position
}

// IPC handlers for YouTube player control
ipcMain.handle('youtube:load-video', async (event, videoId, layerId) => {
  console.log(`[YouTube] Loading video ${videoId} for layer ${layerId}`);
  
  const targetWindow = getYouTubeWindowByLayerId(layerId);
  
  if (targetWindow) {
    // Load YouTube video URL directly in the dedicated window
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1&controls=1&rel=0&modestbranding=1`;
    console.log(`[YouTube] Loading URL: ${youtubeUrl}`);
    
    await targetWindow.loadURL(youtubeUrl);
    
    // Show the window for capture (but keep it off-screen)
    if (!targetWindow.isVisible()) {
      targetWindow.show();
    }
  }
  
  // Legacy compatibility - also load in main youtube view
  const targetView = getYouTubeViewByLayerId(layerId);
  if (targetView) {
    await targetView.webContents.executeJavaScript(`
      if (window.player && window.player.loadVideoById) {
        window.player.loadVideoById('${videoId}');
        // Immediately pause after loading to prevent autoplay
        setTimeout(() => {
          if (window.player && window.player.pauseVideo) {
            window.player.pauseVideo();
          }
        }, 100);
      }
    `);
  }
});

// Helper function to get YouTube window by layer ID
function getYouTubeWindowByLayerId(layerId) {
  switch (layerId) {
    case 'youtube1':
      return youtubeWindowA;
    case 'youtube2':
      return youtubeWindowB;
    default:
      return null;
  }
}

// Helper function to get YouTube view by layer ID (legacy compatibility)
function getYouTubeViewByLayerId(layerId) {
  return youtubeView; // fallback to legacy view for compatibility
}

ipcMain.handle('youtube:play', async (event, layerId) => {
  const targetView = getYouTubeViewByLayerId(layerId);
  
  if (targetView) {
    await targetView.webContents.executeJavaScript(`
      if (window.player && window.player.playVideo) {
        window.player.playVideo();
      }
    `);
  }
});

ipcMain.handle('youtube:pause', async (event, layerId) => {
  const targetView = getYouTubeViewByLayerId(layerId);
  
  if (targetView) {
    await targetView.webContents.executeJavaScript(`
      if (window.player && window.player.pauseVideo) {
        window.player.pauseVideo();
      }
    `);
  }
});

ipcMain.handle('youtube:set-volume', async (event, volume, layerId) => {
  const targetView = getYouTubeViewByLayerId(layerId);
  
  if (targetView) {
    await targetView.webContents.executeJavaScript(`
      if (window.player && window.player.setVolume) {
        window.player.setVolume(${volume});
      }
    `);
  }
});

ipcMain.handle('youtube:get-current-time', async (event, layerId) => {
  const targetView = getYouTubeViewByLayerId(layerId);
  
  if (targetView) {
    return await targetView.webContents.executeJavaScript(`
      window.player && window.player.getCurrentTime ? window.player.getCurrentTime() : 0
    `);
  }
  return 0;
});

ipcMain.handle('youtube:seek-to', async (event, seconds, layerId) => {
  const targetView = getYouTubeViewByLayerId(layerId);
  
  if (targetView) {
    await targetView.webContents.executeJavaScript(`
      if (window.player && window.player.seekTo) {
        window.player.seekTo(${seconds});
      }
    `);
  }
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