const path = require("path");
const { app, BrowserWindow, screen, shell, protocol } = require("electron");

const ZENBOOK_WIDTH = 3840;
const ZENBOOK_HEIGHT = 1110;
const DIMENSION_TOLERANCE = 20;
const APP_ID = "com.bubblemarks.sidebar";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "bubblemarks",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.setAppUserModelId(APP_ID);

console.log("✅ script validated");

function displayMatchesZenbook(display) {
  const sizesToCheck = [display.size, display.workAreaSize];
  return sizesToCheck.some(({ width, height }) => {
    const widthDiff = Math.abs(width - ZENBOOK_WIDTH);
    const heightDiff = Math.abs(height - ZENBOOK_HEIGHT);
    return widthDiff <= DIMENSION_TOLERANCE && heightDiff <= DIMENSION_TOLERANCE;
  });
}

function resolveTargetDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) {
    return screen.getPrimaryDisplay();
  }

  const zenbookDisplay = displays.find(displayMatchesZenbook);
  if (zenbookDisplay) {
    return zenbookDisplay;
  }

  const primaryDisplay = displays.find((display) => display.primary) || displays[0];
  const secondaryDisplays = displays.filter((display) => display.id !== primaryDisplay.id);

  if (secondaryDisplays.length === 0) {
    return primaryDisplay;
  }

  const verticalMatches = secondaryDisplays
    .filter((display) => display.bounds.y > primaryDisplay.bounds.y)
    .sort((a, b) => b.bounds.y - a.bounds.y);
  if (verticalMatches.length > 0) {
    return verticalMatches[0];
  }

  const horizontalMatches = secondaryDisplays
    .filter((display) => display.bounds.x !== primaryDisplay.bounds.x)
    .sort((a, b) => a.bounds.x - b.bounds.x);
  if (horizontalMatches.length > 0) {
    return horizontalMatches[0];
  }

  return secondaryDisplays[0];
}

function registerBubblemarksProtocol() {
  protocol.registerFileProtocol("bubblemarks", (request, callback) => {
    try {
      const url = new URL(request.url);
      const rawPath = decodeURIComponent(url.pathname);
      const trimmedPath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
      const resolvedPath = path.normalize(path.join(__dirname, trimmedPath));
      const basePath = path.normalize(__dirname + path.sep);

      if (!resolvedPath.startsWith(basePath)) {
        return callback({ error: -10 });
      }

      callback({ path: resolvedPath });
    } catch (error) {
      console.error("[Bubblemarks] Failed to resolve bubblemarks:// path", error);
      callback({ error: -324 });
    }
  });
}

function createWindow() {
  const targetDisplay = resolveTargetDisplay();
  const { bounds, size, scaleFactor } = targetDisplay;
  const targetSize = size || bounds;
  const { width, height } = targetSize;

  console.log(
    `[Bubblemarks] targeting display ${targetDisplay.id} (${width}x${height}@${scaleFactor}x)`
  );

  const mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    backgroundColor: "#f5f5f5",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.setFullScreen(true);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL("bubblemarks://index");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  registerBubblemarksProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
