# Extension Icons

These are placeholder SVG icons for the Fact-It extension.

## Converting SVG to PNG

To convert these SVGs to PNG for use in the Chrome extension:

**Option 1: Online Tool**
- Use [CloudConvert](https://cloudconvert.com/svg-to-png) or similar
- Upload each SVG
- Set the appropriate dimensions (16x16, 48x48, 128x128)
- Download as PNG

**Option 2: Command Line (ImageMagick)**
```bash
# Install ImageMagick first: brew install imagemagick
convert icon16.svg -resize 16x16 icon16.png
convert icon48.svg -resize 48x48 icon48.png
convert icon128.svg -resize 128x128 icon128.png
```

**Option 3: Design Tool**
- Open in Figma, Sketch, or Adobe Illustrator
- Export as PNG at the required sizes

## Icon Design

Current placeholder shows a star shape. For production, consider:
- A checkmark icon (representing fact-checking)
- A shield (representing protection from misinformation)
- A magnifying glass (representing investigation)
- Custom branding

Replace these placeholder icons before publishing to Chrome Web Store.
