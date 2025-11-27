# Bubblemarks Sidebar (Electron)

This project packages Bubblemarks as a desktop sidebar tailored for the ASUS Zenbook Pro Duo second display. It ships with Electron wiring to open the experience full-screen on the ScreenPad Plus (3840×1110) while staying harmless if that panel is unavailable.

## Requirements
- Node.js 18+
- npm (bundled with Node)
- Windows 10/11 for the packaged installer (Electron Builder NSIS target)

## Install
```bash
npm install
```

## Run in development
```bash
npm start
```
This launches Electron, locates the ScreenPad-sized display (3840×1110 ±20px), and renders `index.html` full-screen on that monitor. If the Zenbook panel is missing, the app falls back to the primary display or the lowest secondary display to stay off your main workspace.

## Package for Windows
```bash
npm run package:win
```
The build uses Electron Builder with the existing `appId` (`com.bubblemarks.sidebar`) and assets in `/assets`. The resulting NSIS installer (`BubblemarksSidebar-Setup-<version>.exe`) appears in `dist/`.

## Display targeting logic
- Prefers a display matching 3840×1110 (work area or total size) within a 20px tolerance.
- If no match exists, falls back to the primary monitor.
- Otherwise targets the lowest-positioned secondary display (ideal for a stacked ScreenPad) and finally any remaining secondary.

The Electron log includes a line like:
```
[Bubblemarks] targeting display <id> (<width>x<height>@<scale>x)
```
to confirm which monitor was selected.

## Notes for the ScreenPad
- Keep Windows set to extend displays so Electron can see the second screen.
- Ensure scaling matches the ScreenPad defaults for pixel-perfect layout (the app logs the detected scale factor).
- Icons live in `/assets`; update the `.ico` or `.png` there before packaging if you want a custom installer graphic.
