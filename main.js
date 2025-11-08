const path = require("path");
const { app, BrowserWindow, screen, shell } = require("electron");

const ZENBOOK_WIDTH = 3840;
const ZENBOOK_HEIGHT = 1110;
const DIMENSION_TOLERANCE = 20;

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

  const nonPrimary = displays.find((display) => !display.primary);
  if (nonPrimary) {
    return nonPrimary;
  }

  return displays[0];
}

function createWindow() {
  const targetDisplay = resolveTargetDisplay();
  const { bounds } = targetDisplay;

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
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
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
