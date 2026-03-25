const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let mainWindow;
let arduinoPort;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  // mainWindow.webContents.openDevTools(); // Útil para depuração
}

app.whenReady().then(() => {
  createWindow();

  // Listar portas seriais disponíveis e tentar conectar (exemplo simplificado)
  listPorts();
});

async function listPorts() {
  const ports = await SerialPort.list();
  console.log('Portas disponíveis:', ports);
  
  // IDs de Fabricantes Comuns (Original e Clones)
  const commonVIDs = [
    '1a86', // CH340/CH341 (Clones Chineses Populares)
    '10c4', // Silicon Labs CP210x
    '0403', // FTDI
    '2341', // Arduino SA (Originais)
    '2a03', // dog hunter AG (Originais)
    '16d0'  // MCS (Alguns modelos Pro Micro)
  ];

  const arduino = ports.find(p => {
    const vid = p.vendorId?.toLowerCase();
    const manufacturer = p.manufacturer?.toLowerCase() || '';
    const friendlyName = p.friendlyName?.toLowerCase() || '';

    return commonVIDs.includes(vid) || 
           manufacturer.includes('arduino') || 
           friendlyName.includes('arduino');
  });

  if (arduino) {
    connectToArduino(arduino.path);
  } else {
    console.log('Arduino não encontrado. Verifique a conexão USB.');
  }
}

function connectToArduino(portPath) {
  arduinoPort = new SerialPort({
    path: portPath,
    baudRate: 9600,
    autoOpen: true
  });

  const parser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  arduinoPort.on('open', () => {
    console.log('Conectado ao Arduino na porta:', portPath);
  });

  parser.on('data', (data) => {
    console.log('Dados do Arduino:', data);
    // Enviar dados para o Renderer
    if (mainWindow) {
      mainWindow.webContents.send('arduino-data', data);
    }
  });

  arduinoPort.on('error', (err) => {
    console.error('Erro na serial:', err.message);
  });
}

ipcMain.on('iniciar-scan', (event) => {
  if (arduinoPort && arduinoPort.isOpen) {
    arduinoPort.write("SCAN\n");
    console.log('>>> ENVIANDO SCAN PARA ARDUINO');
  }
});

// Receber comando de gravação do Renderer
ipcMain.on('gravar-tag', (event, texto) => {
  if (arduinoPort && arduinoPort.isOpen) {
    const comandoBruto = `GRAVAR:${texto}\n`;
    arduinoPort.write(comandoBruto);
    console.log('>>> ENVIANDO PARA ARDUINO:', JSON.stringify(comandoBruto));
  } else {
    console.error('ERRO: Arduino não conectado ou porta fechada.');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
