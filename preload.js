const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onArduinoData: (callback) => ipcRenderer.on('arduino-data', (event, data) => callback(data)),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => callback(status)),
  gravarTag: (texto) => ipcRenderer.send('gravar-tag', texto),
  iniciarScan: () => ipcRenderer.send('iniciar-scan')
});
