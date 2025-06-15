# YouTube Remix Stage

4-Layer Creative Mixing Platform with YouTube integration and local media support.

## Features

- YouTube search and playback integration
- Local media file support
- 4-layer mixing (2 YouTube + 2 Local)
- Audio visualization
- Transport controls
- Crossfade controls

## Setup

### 1. Install Dependencies

```bash
# Install main dependencies
pnpm install

# Install renderer dependencies
cd src/renderer
pnpm install
```

### 2. YouTube API Setup

To use real YouTube search functionality, you need to set up a YouTube Data API v3 key:

1. **Get a YouTube API Key:**
   - Go to [Google Cloud Console](https://console.developers.google.com/)
   - Create a new project or select an existing one
   - Enable the "YouTube Data API v3"
   - Create credentials (API Key)
   - Optional: Restrict the API key to YouTube Data API v3 for security

2. **Configure Environment Variables:**
   
   Create `.env` files with your API key:
   
   **Root directory `.env`:**
   ```bash
   REACT_APP_YOUTUBE_API_KEY=your_actual_api_key_here
   ```
   
   **Renderer directory `src/renderer/.env`:**
   ```bash
   GENERATE_SOURCEMAP=false
   SKIP_PREFLIGHT_CHECK=true
   REACT_APP_YOUTUBE_API_KEY=your_actual_api_key_here
   ```

3. **Important Security Notes:**
   - Never commit your API key to version control
   - The `.env` files are already included in `.gitignore`
   - Consider using API key restrictions in Google Cloud Console

### 3. Run the Application

```bash
# Electron Development mode (recommended for testing YouTube API)
pnpm run dev:electron

# Browser-only development (YouTube API won't work due to CORS)
pnpm run dev:browser

# Build and start production
pnpm run build
pnpm start

# Direct Electron launch (after build)
pnpm run electron
```

**⚠️ Important**: Use `pnpm run dev:electron` for development to test YouTube search functionality. The browser-only development mode (`pnpm run dev:browser`) won't work with YouTube API due to CORS restrictions.

## Project Structure

```
youtube-remix-stage/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Electron preload scripts
│   ├── renderer/       # React frontend
│   └── youtube-view/   # YouTube player window
└── package.json
```

## Development

- Main process: `src/main/main.js`
- Renderer process: `src/renderer/src/`
- YouTube integration: `src/renderer/src/services/youtubeAPI.ts`

## API Usage Limits

YouTube Data API v3 has usage quotas:
- Default quota: 10,000 units per day
- Search operation: 100 units per request
- Video details: 1 unit per request

For development and testing, this should be sufficient for moderate usage.

## Troubleshooting

### "YouTube API key is required" Error

1. Make sure you've created the `.env` files in both root and `src/renderer/` directories
2. Verify your API key is valid and YouTube Data API v3 is enabled
3. Check the browser console for detailed error messages
4. Restart the application after adding the API key

### "Requests to this API youtube method are blocked" Error

**✅ This has been resolved!** This error was caused by CORS restrictions when accessing YouTube API directly from the browser. The solution implemented:

1. **Root Cause**: Google blocks direct browser access to YouTube Data API v3
2. **Solution**: Uses Electron's main process (Node.js environment) to bypass CORS
3. **Implementation**: API requests now go through Electron IPC to avoid browser restrictions

### API Quota Exceeded

If you see quota exceeded errors:
1. Check your [Google Cloud Console quota page](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas)
2. Wait for the quota to reset (daily reset)
3. Consider optimizing search frequency or implementing caching

### Development Issues

**Build errors:**
```bash
# Clean and reinstall dependencies
rm -rf node_modules src/renderer/node_modules
pnpm install
cd src/renderer && pnpm install
```

**Electron not starting:**
```bash
# Make sure build is complete first
pnpm run build:renderer
pnpm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
