# Fact-It 🎯

> Real-time fact-checking Chrome extension for social media and web articles

A Chrome extension that uses AI to detect and verify factual claims in social media posts as you browse. Built with TypeScript, Vite, and Manifest V3.

## ⚠️ Important: Facebook Support (Known Issues To Be Fixed)

**Facebook requires special handling due to dynamic selectors:**

- **You must scroll** on Facebook for the extension to activate (scroll fast/for a while after page loads)
- **Selector discovery is not always successful** - Facebook's DOM structure changes frequently
- **This is a known issue that needs to be fixed** in future versions
- **To debug**: Open Chrome DevTools (F12) → Console tab to check logs

**When you scroll, you should see in the console:**
```
Fact-It: [Facebook] User started scrolling, tracking...
Fact-It: [Facebook] 🎉 Scroll detected (XXXpx) - count: 1/1
Fact-It: [Facebook] ✅ Activation threshold reached! Starting selector discovery...
Fact-It: [Facebook] 🚀 Extension activated!
Fact-It: [Facebook] 🔍 Starting selector discovery...
```

**Then either:**
- ✅ **Success**: `Fact-It: [Facebook] ✅ Found valid selector with XX% confidence`
- ❌ **Failure**: `Fact-It: [Facebook] ❌ Failed to discover selectors`

- If selectors fail, try refreshing the page and scrolling again

**Other platforms (Twitter, LinkedIn) work reliably without these issues.**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Chrome browser (latest version)
- Basic familiarity with terminal/command line

### Installation

1. **Clone and install dependencies:**

```bash
cd fact-it
npm install
```

2. **Start development server with HMR:**

```bash
npm run dev
```

This will:
- Build the extension to `dist/` folder
- Watch for file changes
- Auto-reload the extension when you save files ⚡

3. **Load extension in Chrome:**

- Open Chrome and navigate to `chrome://extensions`
- Enable "Developer mode" (toggle in top-right)
- Click "Load unpacked"
- Select the `dist` folder from this project

4. **Test it works:**

- Visit [Twitter/X](https://twitter.com)
- Open DevTools Console (F12)
- Scroll through tweets
- Look for log messages: `Fact-It: 🎯 Detected new tweet!`
- You'll see a small 👁️ emoji appear briefly on detected tweets

**You're all set!** The extension is running in development mode with hot reload.

---

## 🛠️ Development Workflow

### Daily Development Loop

This is your typical workflow while building features:

1. **Start dev server** (if not running):
   ```bash
   npm run dev
   ```

2. **Make changes** to any file in `src/`:
   - Edit `src/content/twitter-content.ts` to change tweet detection logic
   - Edit `src/background/service-worker.ts` to add API calls
   - Edit `src/popup/popup.html` to change the settings UI

3. **Save the file** → Extension auto-reloads in Chrome ⚡

4. **Check results**:
   - Refresh the Twitter page (or the page auto-refreshes)
   - Check console for logs
   - Test the new functionality

5. **Repeat** steps 2-4 until feature works

### Available Scripts

```bash
npm run dev          # Development with HMR (use this most!)
npm run build        # Production build (optimized, minified)
npm run lint         # Check code quality
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
npm run type-check   # Check TypeScript types
```

### Hot Module Replacement (HMR)

HMR means **instant updates without manual reloading**:

- ✅ Save a file → Extension auto-reloads
- ✅ See changes immediately (< 1 second)
- ✅ Console logs preserved
- ✅ No need to click "Reload" in `chrome://extensions`

**Note:** Some changes require page refresh:
- Manifest.json changes → Reload extension manually
- Content script changes → Refresh the page (Twitter, etc.)
- Background worker changes → Auto-reloads via HMR
- Popup changes → Close and reopen popup

---

## 🐛 Debugging Guide

### Method 1: Chrome DevTools (Recommended)

**For Content Scripts (Twitter page):**

1. Visit Twitter/X
2. Open DevTools (F12 or Right-click → Inspect)
3. Go to **Console** tab
4. You'll see all `console.log()` from `src/content/twitter-content.ts`
5. Go to **Sources** tab → `(no domain)` → Your TypeScript files
6. Set breakpoints directly in TypeScript code (source maps enabled!)

**For Background Service Worker:**

1. Go to `chrome://extensions`
2. Find "Fact-It"
3. Click "service worker" link (under extension details)
4. DevTools opens for background worker
5. Console shows logs from `src/background/service-worker.ts`
6. Sources tab shows TypeScript files with source maps

**For Popup:**

1. Right-click extension icon (top-right of Chrome)
2. Select "Inspect popup"
3. DevTools opens for popup
4. Console shows logs from `src/popup/popup.ts`

### Method 2: VS Code Debugger

1. Open VS Code
2. Press F5 or go to Run → Start Debugging
3. Select "Debug Chrome Extension" configuration
4. Chrome launches with extension loaded
5. Set breakpoints in VS Code
6. Debugger pauses at breakpoints!

**Note:** This is more advanced. Chrome DevTools is usually easier for extension development.

### Common Debugging Tasks

**Check if extension is running:**
```javascript
// In console on Twitter page
chrome.runtime.sendMessage({ type: 'PING' }, console.log);
// Should log: { status: 'ok', timestamp: ... }
```

**Check stored settings:**
```javascript
chrome.storage.local.get(null, console.log);
// Shows all stored data
```

**Force reload extension:**
```bash
# In chrome://extensions
# Click the reload icon (🔄) next to Fact-It
```

**View source maps in DevTools:**
- Sources tab → `webpack://` → `src/` folder
- Original TypeScript files appear here
- Set breakpoints, step through code normally

---

## 📁 Project Structure

```
fact-it/
├── src/
│   ├── background/
│   │   └── service-worker.ts       # Background service worker (API calls)
│   ├── content/
│   │   └── twitter-content.ts      # Twitter page observer
│   ├── popup/
│   │   ├── popup.html              # Extension settings UI
│   │   ├── popup.ts                # Popup logic
│   │   └── popup.css               # Popup styles
│   ├── shared/
│   │   ├── types.ts                # Shared TypeScript types
│   │   └── constants.ts            # App-wide constants
│   └── manifest.json               # Chrome extension manifest
├── public/
│   └── icons/                      # Extension icons (SVG placeholders)
├── dist/                           # Build output (git-ignored)
├── .vscode/                        # VS Code workspace settings
│   ├── settings.json               # Editor config (auto-format on save)
│   ├── extensions.json             # Recommended extensions
│   └── launch.json                 # Debugger configuration
├── vite.config.ts                  # Vite build configuration
├── tsconfig.json                   # TypeScript configuration
├── .eslintrc.js                    # ESLint rules
├── .prettierrc                     # Prettier formatting
├── package.json                    # Dependencies & scripts
└── README.md                       # You are here!
```

### Key Files Explained

**`src/manifest.json`** - Defines extension structure:
- Permissions (storage, scripting)
- Content scripts (which pages to run on)
- Background worker configuration
- Popup page definition

**`src/background/service-worker.ts`** - Background worker:
- Handles API calls (OpenAI, Brave Search)
- Message passing with content scripts
- Storage management
- Runs even when browser is closed (event-driven)

**`src/content/twitter-content.ts`** - Twitter page script:
- Runs on twitter.com/x.com pages
- Uses MutationObserver to detect new tweets
- Extracts tweet text
- Sends to background worker for checking
- Adds visual indicators to tweets

**`src/popup/popup.html`** - Settings UI:
- Shown when clicking extension icon
- API key input fields
- Settings configuration
- Status indicators

**`vite.config.ts`** - Build configuration:
- `vite-plugin-web-extension` for HMR
- Source map generation
- File watching
- Auto-reload on changes

---

## 🧪 Testing Your Changes

### Manual Testing Checklist

After making changes, verify:

**Content Script (Twitter):**
- [ ] Open Twitter/X
- [ ] Scroll through timeline
- [ ] Check console: Do you see "Detected new tweet!" logs?
- [ ] Do tweets show the 👁️ emoji indicator?
- [ ] Refresh page → Does detection still work?

**Background Worker:**
- [ ] Go to `chrome://extensions` → Click "service worker"
- [ ] Check console: Are messages received?
- [ ] Send test message from Twitter console:
  ```javascript
  chrome.runtime.sendMessage({ type: 'PING' }, console.log);
  ```

**Popup:**
- [ ] Click extension icon
- [ ] Does popup open?
- [ ] Try entering API key → Click "Save Settings"
- [ ] Check console: Settings saved?
- [ ] Reopen popup → Are settings persisted?

**Message Passing:**
- [ ] Content script sends message → Background receives it
- [ ] Background sends response → Content receives it
- [ ] No `chrome.runtime.lastError` in console

### Error Debugging

**Extension won't load:**
```
Error: "Service worker registration failed"
→ Check manifest.json syntax (valid JSON?)
→ Check file paths match actual files
→ Rebuild: npm run dev
```

**Content script not running:**
```
No console logs on Twitter
→ Check manifest.json: content_scripts.matches includes twitter.com
→ Refresh the page (F5)
→ Check host_permissions in manifest
```

**Service worker inactive:**
```
"service worker" link is grayed out
→ Click it anyway (Chrome wakes it up)
→ Check for errors in chrome://extensions
→ Rebuild and reload extension
```

**HMR not working:**
```
Changes don't appear after saving
→ Check terminal: Is npm run dev still running?
→ Check for build errors in terminal
→ Try manual reload: chrome://extensions → 🔄
```

**TypeScript errors:**
```
npm run type-check
→ Shows all TypeScript errors
→ Fix errors one by one
→ npm run dev (auto-fixes some issues)
```

---

## 🎨 Code Style & Quality

This project uses:

- **ESLint** - Catch bugs and enforce best practices
- **Prettier** - Auto-format code consistently
- **TypeScript Strict Mode** - Maximum type safety

### Auto-formatting

**In VS Code:**
- Just save the file (Ctrl+S / Cmd+S)
- Prettier auto-formats
- ESLint auto-fixes

**Manual:**
```bash
npm run format       # Format all files
npm run lint:fix     # Fix linting issues
```

### Type Checking

TypeScript is configured in **strict mode**:

```bash
npm run type-check   # Check for type errors
```

No `any` types allowed! The extension enforces type safety everywhere.

---

## 🔧 Common Customizations

### Add a New Platform (LinkedIn, Facebook)

1. Create content script: `src/content/linkedin-content.ts`
2. Add platform to `manifest.json`:
   ```json
   {
     "content_scripts": [
       {
         "matches": ["*://linkedin.com/*"],
         "js": ["content/linkedin-content.ts"],
         "run_at": "document_idle"
       }
     ]
   }
   ```
3. Add selectors to `src/shared/constants.ts`
4. Test on LinkedIn!

### Change Tweet Detection Logic

Edit `src/content/twitter-content.ts`:

```typescript
function processTweet(tweetElement: Element): void {
  // Your custom logic here
  // Example: Only check tweets with images
  const hasImage = tweetElement.querySelector('img[alt]');
  if (!hasImage) return;

  // Rest of function...
}
```

### Add API Integration

Edit `src/background/service-worker.ts`:

```typescript
async function handleCheckClaim(message, sendResponse) {
  // Replace mock with real API call
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [/* ... */],
    }),
  });

  const data = await response.json();
  sendResponse({ verdict: data.choices[0].message.content });
}
```

### Customize Visual Indicators

Edit `src/content/twitter-content.ts`:

```typescript
function addDebugIndicator(tweetElement, elementId) {
  // Change emoji
  indicator.textContent = '✓';  // Checkmark instead of 👁️

  // Change color
  indicator.style.background = '#4CAF50';  // Green

  // Change position
  indicator.style.top = '50%';
  indicator.style.left = '50%';
}
```

---

## 🚢 Building for Production

When ready to publish:

1. **Create production build:**
   ```bash
   npm run build
   ```

2. **Test production build:**
   - Load `dist/` folder in Chrome
   - Test all features work
   - Check for console errors

3. **Package for Chrome Web Store:**
   ```bash
   cd dist
   zip -r ../fact-it.zip .
   ```

4. **Upload to Chrome Web Store:**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Upload `fact-it.zip`
   - Fill in listing details
   - Submit for review

**Production build differences:**
- Minified code (smaller file size)
- No source maps (faster load)
- Optimized assets
- No development warnings

---

## 📚 Additional Resources

### Chrome Extension Documentation

- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Service Workers](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)

### Tools & Libraries

- [Vite Documentation](https://vitejs.dev/)
- [vite-plugin-web-extension](https://github.com/aklinker1/vite-plugin-web-extension)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [ESLint Rules](https://eslint.org/docs/rules/)

### Debugging Resources

- [Chrome DevTools Guide](https://developer.chrome.com/docs/devtools/)
- [Debugging Extensions](https://developer.chrome.com/docs/extensions/mv3/tut_debugging/)

---

## ❓ Troubleshooting

### Vite Issues

**Q: `npm run dev` fails with "Cannot find module 'vite'"**

A: Install dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Q: HMR not working after code change**

A: Check terminal for build errors. If no errors, try:
```bash
# Kill dev server (Ctrl+C)
npm run dev  # Restart
```

### Chrome Extension Issues

**Q: Extension not appearing in Chrome**

A:
1. Verify `dist/` folder exists and contains files
2. Check `chrome://extensions` for error messages
3. Try: Remove extension → Reload unpacked → Select `dist/` again

**Q: "Manifest file is missing or unreadable"**

A:
1. Check `dist/manifest.json` exists
2. Verify JSON is valid (no syntax errors)
3. Rebuild: `npm run dev`

**Q: Content script not running on Twitter**

A:
1. Check manifest `matches` includes current domain
2. Refresh the Twitter page
3. Check console for errors
4. Verify `src/content/twitter-content.ts` has no runtime errors

### TypeScript Issues

**Q: "Cannot find module '@/shared/types'"**

A: Path alias issue. Check:
1. `tsconfig.json` has `"paths": { "@/*": ["src/*"] }`
2. `vite.config.ts` has `resolve: { alias: { '@': '/src' } }`
3. Restart TypeScript server in VS Code: Cmd+Shift+P → "Restart TS Server"

**Q: Type errors in VS Code but build works**

A:
```bash
npm run type-check  # See actual errors
# Fix errors shown in output
```

---

## 🤝 Contributing

This is currently a development scaffold. Future phases will add:

- Phase 2: OpenAI API integration (Stage 1 + Stage 2)
- Phase 3: Multi-platform support (LinkedIn, Facebook)
- Phase 4: Caching & performance optimization
- Phase 5: UI polish & accessibility
- Phase 6: Testing & Chrome Web Store release

See `tmp/2025-10-18-fact-checking-extension-implementation-plan.md` for full roadmap.

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🎯 Next Steps

Now that your development environment is set up:

1. **Explore the codebase:**
   - Read through `src/content/twitter-content.ts` (tweet detection)
   - Understand message passing in `src/background/service-worker.ts`
   - Check out the popup UI in `src/popup/`

2. **Make a small change:**
   - Change the debug emoji in `twitter-content.ts` from 👁️ to ✅
   - Save and see it auto-reload
   - Visit Twitter to see your change!

3. **Plan your first feature:**
   - Add claim detection logic
   - Integrate OpenAI API
   - Build visual indicators
   - See the implementation plan for guidance

**Happy coding!** 🚀

---

**Questions?** Check the [troubleshooting section](#-troubleshooting) or open an issue.
