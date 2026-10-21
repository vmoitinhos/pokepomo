'use strict';

const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let quitting = false;

const SAVE_FILE = path.join(app.getPath('userData'), 'savegame.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: '#0f1020',
    title: 'PokePomo',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function buildTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'sprites', '25.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 18, height: 18 });
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('PokePomo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show PokePomo', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWindow());
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (process.platform === 'darwin') app.dock?.show();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(() => {
  createWindow();
  buildTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { quitting = true; });

ipcMain.handle('save:read', () => {
  try {
    if (!fs.existsSync(SAVE_FILE)) return null;
    return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch (err) {
    console.error('[save:read]', err);
    return null;
  }
});

ipcMain.handle('save:write', (_evt, data) => {
  try {
    const tmp = `${SAVE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, SAVE_FILE);
    return { ok: true };
  } catch (err) {
    console.error('[save:write]', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('save:path', () => SAVE_FILE);

ipcMain.handle('save:reset', () => {
  try {
    if (fs.existsSync(SAVE_FILE)) fs.unlinkSync(SAVE_FILE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('app:notify', (_evt, { title, body }) => {
  if (mainWindow && !mainWindow.isFocused()) {
    const { Notification } = require('electron');
    if (Notification.isSupported()) new Notification({ title, body }).show();
    if (process.platform === 'darwin') app.dock?.bounce('critical');
  }
  return { ok: true };
});

ipcMain.handle('app:setBadge', (_evt, text) => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(text || '');
  }
  return { ok: true };
});

ipcMain.handle('app:setTitle', (_evt, title) => {
  if (mainWindow) mainWindow.setTitle(title || 'PokePomo');
  if (tray) tray.setToolTip(title || 'PokePomo');
  return { ok: true };
});

ipcMain.handle('data:readJson', (_evt, relPath) => {
  try {
    const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(__dirname, '..', safe);
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error('[data:readJson]', relPath, err);
    return null;
  }
});
