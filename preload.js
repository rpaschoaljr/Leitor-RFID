const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onArduinoData: (callback) => ipcRenderer.on('arduino-data', (event, data) => callback(data)),
  gravarTag: (texto) => ipcRenderer.send('gravar-tag', texto),
  iniciarScan: () => ipcRenderer.send('iniciar-scan')
});
