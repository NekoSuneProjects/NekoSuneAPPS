// updater/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('updaterAPI', {
  onStatus: cb => ipcRenderer.on('status', (_e, data) => cb(data)),
  onProgress: cb => ipcRenderer.on('progress', (_e, data) => cb(data)),
  quit: () => ipcRenderer.invoke('updater:retryQuit')
})
