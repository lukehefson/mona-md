const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mona', {
  updateDocumentState: (payload) => ipcRenderer.send('document:update-state', payload),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  openPreviewLink: (href) => ipcRenderer.invoke('preview:open-link', href),
  exitFullscreen: () => ipcRenderer.invoke('window:exit-fullscreen'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  findInPage: (text, options) => ipcRenderer.invoke('find:start', text, options),
  stopFindInPage: () => ipcRenderer.invoke('find:stop'),
  onFindResult: (handler) => {
    ipcRenderer.on('find-result', (_event, payload) => handler(payload));
  },
  onDocumentLoad: (handler) => {
    ipcRenderer.on('document-load', (_event, payload) => handler(payload));
  },
  onDocumentSaved: (handler) => {
    ipcRenderer.on('document-saved', (_event, payload) => handler(payload));
  },
  onMenu: (channel, handler) => {
    ipcRenderer.on(channel, (_event, payload) => handler(payload));
  }
});
