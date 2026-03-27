const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let mainWindow;
let arduinoPort;
let isConnecting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  listPorts();
  
  setInterval(() => {
    if (!arduinoPort || !arduinoPort.isOpen) {
      if (!isConnecting) listPorts();
    }
  }, 5000);
});

async function listPorts() {
  isConnecting = true;
  try {
    const ports = await SerialPort.list();
    const commonVIDs = ['1a86', '10c4', '0403', '2341', '2a03', '16d0'];
    const arduino = ports.find(p => {
      const vid = p.vendorId?.toLowerCase();
      const manufacturer = p.manufacturer?.toLowerCase() || '';
      const friendlyName = p.friendlyName?.toLowerCase() || '';
      return commonVIDs.includes(vid) || manufacturer.includes('arduino') || friendlyName.includes('arduino');
    });

    if (arduino) connectToArduino(arduino.path);
    else sendStatus('DESCONECTADO');
  } catch (err) {
    console.error('Erro ao listar portas:', err);
  } finally {
    isConnecting = false;
  }
}

function sendStatus(status) {
  if (mainWindow) mainWindow.webContents.send('connection-status', status);
}

function connectToArduino(portPath) {
  if (arduinoPort && arduinoPort.isOpen) return;

  arduinoPort = new SerialPort({
    path: portPath,
    baudRate: 115200, 
    autoOpen: true
  });

  const parser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  arduinoPort.on('open', () => {
    console.log('Conectado ao Arduino na porta:', portPath);
    sendStatus('CONECTADO');
  });

  parser.on('data', (data) => {
    if (mainWindow) mainWindow.webContents.send('arduino-data', data);
  });

  arduinoPort.on('close', () => {
    console.log('Porta fechada.');
    sendStatus('DESCONECTADO');
  });

  arduinoPort.on('error', (err) => {
    console.error('Erro na serial:', err.message);
    sendStatus('ERRO');
  });
}

ipcMain.on('iniciar-scan', (event) => {
  if (arduinoPort && arduinoPort.isOpen) arduinoPort.write("SCAN\n");
});

ipcMain.on('cancelar-operacao', (event) => {
  if (arduinoPort && arduinoPort.isOpen) {
    arduinoPort.write("CANCEL\n");
    console.log('Comando CANCEL enviado ao Arduino');
  }
});

ipcMain.on('resetar-porta', (event) => {
  if (arduinoPort && arduinoPort.isOpen) {
    console.log('Watchdog: Resetando porta serial por inatividade...');
    arduinoPort.close(() => {
      // O intervalo de 5s no main.js já chamará listPorts() automaticamente,
      // mas vamos forçar aqui para ser mais rápido.
      setTimeout(() => listPorts(), 1000);
    });
  }
});

ipcMain.on('gravar-tag', (event, texto) => {
  if (arduinoPort && arduinoPort.isOpen) {
    const comandoBruto = `GRAVAR:${texto}\n`;
    arduinoPort.write(comandoBruto);
  } else {
    sendStatus('DESCONECTADO');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
