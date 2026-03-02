const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mona', {
  openFile: () => ipcRenderer.invoke('dialog:open'),
  saveDialog: (defaultPath) => ipcRenderer.invoke('dialog:save', defaultPath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  addRecent: (filePath) => ipcRenderer.invoke('recents:add', filePath),
  getRecents: () => ipcRenderer.invoke('recents:get'),
  clearRecents: () => ipcRenderer.invoke('recents:clear'),
  getLastFile: () => ipcRenderer.invoke('last:get'),
  loadTemp: () => ipcRenderer.invoke('temp:load'),
  clearTemp: () => ipcRenderer.invoke('temp:clear'),
  getTempPath: () => ipcRenderer.invoke('temp:path'),
  exitFullscreen: () => ipcRenderer.invoke('window:exit-fullscreen'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  setWindowTitle: (payload) => ipcRenderer.invoke('window:title', payload),
  setPreviewState: (state) => ipcRenderer.send('preview:state', state),
  findInPage: (text, options) => ipcRenderer.invoke('find:start', text, options),
  stopFindInPage: () => ipcRenderer.invoke('find:stop'),
  onFindResult: (handler) => {
    ipcRenderer.on('find-result', (_event, payload) => handler(payload));
  },
  onMenu: (channel, handler) => {
    ipcRenderer.on(channel, (_event, payload) => handler(payload));
  }
});
