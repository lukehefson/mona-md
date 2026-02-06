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
  setPreviewState: (state) => ipcRenderer.send('preview:state', state),
  onMenu: (channel, handler) => {
    ipcRenderer.on(channel, (_event, payload) => handler(payload));
  }
});
