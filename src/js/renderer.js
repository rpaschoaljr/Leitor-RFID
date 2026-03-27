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
const btnCancelar = document.getElementById('btnCancelar');
const scanTableBody = document.getElementById('scanTableBody');
const overlay = document.getElementById('overlay');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');
const warningText = document.querySelector('.warning-text');
const connStatus = document.getElementById('connStatus');

let gravando = false;
let totalBlocks = 64; 
let operacaoAtiva = false;
let timeoutInatividade;
let ultimoSinalDeVida = Date.now();

const COLORS = {
    success: '#28a745',
    error: '#cf6679',
    warning: '#ffb74d',
    normal: '#b0b0b0'
};

// Monitor global de batimento cardíaco (Heartbeat)
setInterval(() => {
    const agora = Date.now();
    const diff = agora - ultimoSinalDeVida;
    
    if (diff > 3000) { // Se não houver sinal por 3 segundos
        connStatus.style.color = COLORS.error;
        connStatus.innerText = '● Sem Resposta';
    } else if (diff <= 3000 && connStatus.innerText === '● Sem Resposta') {
        connStatus.style.color = COLORS.success;
        connStatus.innerText = '● Conectado';
    }

    if (diff > 6000) { // Novo: Se passar de 6 segundos, reseta a porta USB
        console.warn('Watchdog Crítico: 6s sem batimento. Resetando conexão USB...');
        ultimoSinalDeVida = Date.now(); // Reseta para evitar loops infinitos
        window.electronAPI.resetarPorta();
        statusDisplay.innerText = '♻️ Reconectando USB por inatividade...';
    }

    if (operacaoAtiva && diff > 5000) { // Watchdog de 5s durante operação
        console.warn('Watchdog: Arduino travou durante operação.');
        statusDisplay.innerText = '⚠️ Erro Crítico: Conexão Perdida com Arduino';
        statusDisplay.style.color = COLORS.error;
        window.electronAPI.cancelarOperacao();
        esconderOverlay();
    }
}, 1000);

window.electronAPI.onConnectionStatus((status) => {
    if (status === 'CONECTADO') {
        connStatus.innerText = '● Conectado';
        connStatus.style.color = COLORS.success;
        connStatus.classList.remove('disconnected');
        connStatus.classList.add('connected');
        statusDisplay.innerText = 'Pronto para leitura';
        ultimoSinalDeVida = Date.now();
    } else {
        connStatus.innerText = '● Desconectado';
        connStatus.style.color = COLORS.error;
        connStatus.classList.remove('connected');
        connStatus.classList.add('disconnected');
        statusDisplay.innerText = 'Arduino não encontrado';
        statusDisplay.style.color = COLORS.error;
        if (operacaoAtiva) esconderOverlay();
    }
});

function mostrarOverlay(texto) {
    operacaoAtiva = true;
    warningText.innerText = texto;
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    overlay.style.display = 'flex';
}

function esconderOverlay() {
    operacaoAtiva = false;
    overlay.style.display = 'none';
}

function atualizarProgresso(atual, total) {
    const p = Math.round((atual / total) * 100);
    progressBar.style.width = `${p}%`;
    percentText.innerText = `${p}%`;
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

window.electronAPI.onArduinoData((data) => {
    ultimoSinalDeVida = Date.now(); // Qualquer dado recebido reseta o cronômetro de vida

    if (data === 'LOG:HEARTBEAT') return; // Não processa log de batimento na interface

    console.log('Dados recebidos:', data);

    if (data.includes('OPERACAO_CANCELADA')) {
        esconderOverlay();
        statusDisplay.innerText = '⚠️ Operação Cancelada';
        statusDisplay.style.color = COLORS.warning;
    }

    if (data.startsWith('TYPE:')) {
        const tipo = data.split(':')[1];
        typeDisplay.innerText = `Tipo: ${tipo}`;
        autopsyInfo.innerText = `Tag detectada: ${tipo}`;
    } else if (data.startsWith('BLOCKS:')) {
        totalBlocks = parseInt(data.split(':')[1]);
        const numSectors = totalBlocks / 4; 
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

btnCancelar.addEventListener('click', () => {
    window.electronAPI.cancelarOperacao();
    esconderOverlay();
    statusDisplay.innerText = 'Operação interrompida pelo usuário';
    statusDisplay.style.color = COLORS.warning;
});

btnGravar.addEventListener('click', () => {
    const texto = gravarInput.value.trim();
    if (texto.length > 0) {
        dataDisplay.innerText = 'Conteúdo: Atualizando...'; 
        mostrarOverlay('Gravando Dados...');
        window.electronAPI.gravarTag(texto);
    }
});

btnLimpar.addEventListener('click', () => {
    dataDisplay.innerText = 'Conteúdo: Limpando...'; 
    mostrarOverlay('Limpando Memória...');
    window.electronAPI.gravarTag(""); 
});

btnScan.addEventListener('click', () => {
    scanTableBody.innerHTML = ''; 
    mostrarOverlay('Análise Profunda...');
    window.electronAPI.iniciarScan(); 
});
