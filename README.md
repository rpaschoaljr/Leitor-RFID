# RFID Analyzer Pro 🛡️📡

**RFID Analyzer Pro** é uma solução completa e profissional para leitura, gravação e análise profunda (autópsia) de tags RFID (Mifare Classic 1K, 4K, Ultralight, etc.). O projeto utiliza uma arquitetura moderna com **Electron** no desktop e uma **Máquina de Estados (FSM)** não bloqueante no **Arduino**, garantindo alta performance e responsividade.

---

## 🚀 Funcionalidades

-   **Interface Dark Mode:** Design moderno e minimalista para melhor experiência do usuário.
-   **Detecção Dinâmica:** Identifica automaticamente o UID, o tipo da tag (1K, 4K, Ultralight) e a capacidade de armazenamento (setores/blocos).
-   **Leitura/Escrita Multibloco:** Suporte para textos longos que ultrapassam o limite padrão de 16 caracteres, distribuindo os dados automaticamente pela memória da tag.
-   **Modo Autópsia (Deep Scan):** Visualização completa da memória em tempo real (Hexadecimal + ASCII), com destaque para blocos de sistema e trailers de segurança.
-   **Feedback em Tempo Real:** Barra de progresso com porcentagem e animações de status para todas as operações de hardware.
-   **Arquitetura Robusta:** Código Arduino baseado em Máquina de Estados, eliminando travamentos causados por `delay()`.

---

## 🛠️ Requisitos de Hardware

1.  **Arduino** (Uno, Nano, Mega ou compatível).
2.  **Módulo Leitor RFID RC522**.
3.  **Tags RFID** (Mifare Classic 1K, 4K ou similares).
4.  **Cabos de Conexão**.

### Esquema de Ligação (MFRC522 -> Arduino)

| MFRC522 | Arduino Uno/Nano |
| :--- | :--- |
| **SDA (SS)** | Pin 10 |
| **SCK** | Pin 13 |
| **MOSI** | Pin 11 |
| **MISO** | Pin 12 |
| **IRQ** | *Não conectado* |
| **GND** | GND |
| **RST** | Pin 9 |
| **3.3V** | **3.3V** (Não use 5V!) |

---

## 📦 Instalação e Configuração

### 1. Arduino
-   Abra a [Arduino IDE](https://www.arduino.cc/en/software).
-   Instale a biblioteca **MFRC522** através do Gerenciador de Bibliotecas.
-   Carregue o código localizado em `codigo-arduino/codigo-arduino.ino` para sua placa.

### 2. Desktop (Electron)
Certifique-se de ter o [Node.js](https://nodejs.org/) instalado.

```bash
# Clone o repositório
git clone <url-do-repositorio>

# Entre na pasta
cd leitor-rfid

# Instale as dependências
npm install

# Inicie a aplicação
npm start
```

*Nota para usuários Linux:* Pode ser necessário dar permissão à porta serial:
`sudo usermod -a -G dialout $USER` (reinicie a sessão após o comando).

---

## 🖥️ Como Usar

1.  **Conecte o Arduino** via USB. A aplicação detectará a porta automaticamente.
2.  **Aba Geral:** Aproxime uma tag para ver o UID e o conteúdo gravado. Use o campo de texto para gravar novas informações ou limpar a memória.
3.  **Aba Autópsia:** Clique em "Iniciar Scan Profundo" e mantenha a tag próxima ao leitor. Acompanhe a barra de progresso enquanto o software mapeia cada bloco hexadecimal da memória.

---

## 📂 Estrutura do Projeto

```text
├── main.js              # Processo principal do Electron (Backend)
├── preload.js           # Ponte de segurança entre UI e Hardware
├── package.json         # Configurações do projeto e dependências
├── codigo-arduino/      # Firmware do Arduino (C++)
│   └── codigo-arduino.ino
└── src/                 # Interface do Usuário (Frontend)
    ├── index.html       # Estrutura e Abas
    ├── css/
    │   └── style.css    # Estilos Dark Mode e Animações
    └── js/
        └── renderer.js  # Lógica de interface e comunicação IPC
```

---

## 🛡️ Licença

Este projeto está licenciado sob a **GNU General Public License v3.0 (GPL-3.0)**. 

Isso significa que você é livre para usar, estudar, modificar e redistribuir este software, desde que qualquer modificação ou obra derivada também seja publicada sob a mesma licença GPL-3.0 e com o código fonte aberto.

---
**Desenvolvido com ❤️ para a comunidade Maker.**
