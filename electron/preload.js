'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pokepomo', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (data) => ipcRenderer.invoke('save:write', data),
  savePath: () => ipcRenderer.invoke('save:path'),
  resetSave: () => ipcRenderer.invoke('save:reset'),
  readJson: (relPath) => ipcRenderer.invoke('data:readJson', relPath),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  setBadge: (text) => ipcRenderer.invoke('app:setBadge', text),
  setTitle: (title) => ipcRenderer.invoke('app:setTitle', title),
});
