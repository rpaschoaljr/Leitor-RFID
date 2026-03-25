const uidDisplay = document.getElementById('uid');
const dataDisplay = document.getElementById('data');
const typeDisplay = document.getElementById('type');
const sectorsDisplay = document.getElementById('sectors');
const autopsyInfo = document.getElementById('autopsyInfo');
const statusDisplay = document.getElementById('status');
const gravarInput = document.getElementById('gravarInput');
const btnGravar = document.getElementById('btnGravar');
const btnLimpar = document.getElementById('btnLimpar');
const btnScan = document.getElementById('btnScan');
const scanTableBody = document.getElementById('scanTableBody');
const overlay = document.getElementById('overlay');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');
const warningText = document.querySelector('.warning-text');

let gravando = false;
let totalBlocks = 64; // Fallback
let currentProgressBlocks = 0;

const COLORS = {
    success: '#28a745',
    error: '#cf6679',
    warning: '#ffb74d',
    normal: '#b0b0b0'
};

function mostrarOverlay(texto) {
    warningText.innerText = texto;
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    overlay.style.display = 'flex';
}

function esconderOverlay() {
    overlay.style.display = 'none';
}

function atualizarProgresso(atual, total) {
    const p = Math.round((atual / total) * 100);
    progressBar.style.width = `${p}%`;
    percentText.innerText = `${p}%`;
}

// Gerenciamento de Abas
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// Receber dados do Arduino
window.electronAPI.onArduinoData((data) => {
    console.log('Dados recebidos:', data);

    if (data.startsWith('TYPE:')) {
        const tipo = data.split(':')[1];
        typeDisplay.innerText = `Tipo: ${tipo}`;
        autopsyInfo.innerText = `Tag detectada: ${tipo}`;
    } else if (data.startsWith('BLOCKS:')) {
        totalBlocks = parseInt(data.split(':')[1]);
        const numSectors = totalBlocks / 4; // Simplificado para Mifare Classic
        sectorsDisplay.innerText = `Setores: ${numSectors}`;
        autopsyInfo.innerText += ` | Blocos: ${totalBlocks} | Setores: ${numSectors}`;
    } else if (data.startsWith('UID:')) {
        uidDisplay.innerText = `UID: ${data.split(':')[1]}`;
    } else if (data.startsWith('DATA:')) {
        dataDisplay.innerText = `Conteúdo: ${data.split(':')[1] || '(Vazio)'}`;
    } else if (data.startsWith('BLOCK:')) {
        const numBloco = parseInt(data.split(':')[1]);
        processarLinhaScan(data);
        atualizarProgresso(numBloco + 1, totalBlocks);
    } else if (data.startsWith('SCAN:FIM')) {
        atualizarProgresso(totalBlocks, totalBlocks);
        setTimeout(esconderOverlay, 500);
        statusDisplay.innerText = '✅ Scan Completo!';
        statusDisplay.style.color = COLORS.success;
    } else if (data.startsWith('STATUS:')) {
        esconderOverlay();
        const status = data.split(':')[1];
        gravando = false;
        statusDisplay.innerText = status === 'SUCESSO' ? '✅ Operação Concluída!' : `❌ Erro: ${status}`;
        statusDisplay.style.color = status === 'SUCESSO' ? COLORS.success : COLORS.error;
        if (status === 'SUCESSO') gravarInput.value = '';
    }
});

function processarLinhaScan(linha) {
    const partes = linha.split(':');
    const numBloco = partes[1];
    const resto = partes[2].split('|');
    const hex = resto[0].trim();
    const ascii = resto[1].trim();

    const tr = document.createElement('tr');
    if (numBloco == 0 || (parseInt(numBloco) + 1) % 4 === 0) {
        tr.classList.add('bloco-system');
    }

    tr.innerHTML = `
        <td class="bloco-num">${numBloco}</td>
        <td class="bloco-hex">${hex}</td>
        <td class="bloco-ascii">${ascii}</td>
    `;
    scanTableBody.appendChild(tr);
    const container = document.getElementById('scanTableContainer');
    container.scrollTop = container.scrollHeight;
}

btnGravar.addEventListener('click', () => {
    const texto = gravarInput.value.trim();
    if (texto.length > 0) {
        gravando = true;
        mostrarOverlay('Gravando Dados...');
        window.electronAPI.gravarTag(texto);
    }
});

btnLimpar.addEventListener('click', () => {
    gravando = true;
    mostrarOverlay('Limpando Memória...');
    window.electronAPI.gravarTag(""); 
});

btnScan.addEventListener('click', () => {
    scanTableBody.innerHTML = ''; 
    mostrarOverlay('Análise Profunda...');
    window.electronAPI.iniciarScan(); 
});
