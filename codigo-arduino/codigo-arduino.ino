#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN 9
#define SS_PIN 10

MFRC522 mfrc522(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;

enum Estado {
  ST_IDLE,
  ST_CARD_DETECTED,
  ST_READING_BLOCKS,
  ST_WRITING_BLOCKS,
  ST_SCANNING_FULL,
  ST_FINISHING
};

Estado estadoAtual = ST_IDLE;
String comandoPendente = "";
bool modoGravacao = false;
bool modoScan = false;
String dadosLidosBuffer = "";
byte blocoAtual = 0;
byte blocoMaxScan = 63;
const byte BLOCO_INICIAL = 0;
unsigned long lastActionTime = 0;
const int COOLDOWN_MS = 1000;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();
  for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;
  Serial.println("SISTEMA:PRONTO");
}

bool ehBlocoUtil(byte b) {
  if (b == 0) return false;
  if ((b + 1) % 4 == 0) return false;
  return true;
}

// FUNÇÃO DE AUTENTICAÇÃO CENTRALIZADA
bool prepararBloco(byte bloco) {
  // Para MIFARE Classic, precisamos autenticar o setor. 
  // A biblioteca gerencia isso se passarmos o bloco.
  MFRC522::StatusCode status = mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloco, &key, &(mfrc522.uid));
  if (status == MFRC522::STATUS_OK) {
    return true;
  }
  Serial.print("DEBUG:FALHA_AUTH_BLOCO_"); Serial.println(bloco);
  return false;
}

void loop() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.startsWith("GRAVAR:")) {
      comandoPendente = input.substring(7);
      modoGravacao = true;
      modoScan = false;
      lastActionTime = 0; 
      Serial.println("LOG:OPERACAO_GRAVACAO_INICIADA");
    } else if (input == "SCAN") {
      modoScan = true;
      modoGravacao = false;
      lastActionTime = 0;
      Serial.println("LOG:SCAN_SOLICITADO");
    }
  }

  switch (estadoAtual) {
    case ST_IDLE:
      // Se houver comando pendente, forçamos a busca da tag (Wakeup)
      if (millis() - lastActionTime > COOLDOWN_MS || modoScan || modoGravacao) {
        bool cartaoEncontrado = false;
        
        if (mfrc522.PICC_IsNewCardPresent()) {
          cartaoEncontrado = true;
        } 
        else if (modoScan || modoGravacao) {
          byte bufferATQA[2];
          byte bufferSize = sizeof(bufferATQA);
          if (mfrc522.PICC_WakeupA(bufferATQA, &bufferSize) == MFRC522::STATUS_OK) {
            cartaoEncontrado = true;
          }
        }

        if (cartaoEncontrado && mfrc522.PICC_ReadCardSerial()) {
          estadoAtual = ST_CARD_DETECTED;
        }
      }
      break;

    case ST_CARD_DETECTED:
      {
        MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);
        Serial.print("TYPE:"); Serial.println(mfrc522.PICC_GetTypeName(piccType));
        
        if (piccType == MFRC522::PICC_TYPE_MIFARE_1K) blocoMaxScan = 63;
        else if (piccType == MFRC522::PICC_TYPE_MIFARE_4K) blocoMaxScan = 255;
        else if (piccType == MFRC522::PICC_TYPE_MIFARE_UL) blocoMaxScan = 15;
        else blocoMaxScan = 63;

        Serial.print("BLOCKS:"); Serial.println(blocoMaxScan + 1);
        Serial.print("UID:");
        for (byte i = 0; i < mfrc522.uid.size; i++) {
          Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
          Serial.print(mfrc522.uid.uidByte[i], HEX);
        }
        Serial.println();
        
        blocoAtual = BLOCO_INICIAL;
        dadosLidosBuffer = "";
        
        if (modoGravacao) estadoAtual = ST_WRITING_BLOCKS;
        else if (modoScan) estadoAtual = ST_SCANNING_FULL;
        else estadoAtual = ST_READING_BLOCKS;
      }
      break;

    case ST_SCANNING_FULL:
      if (blocoAtual > blocoMaxScan) {
        Serial.println("SCAN:FIM");
        modoScan = false;
        estadoAtual = ST_FINISHING;
      } else {
        executarScanBloco();
        blocoAtual++;
      }
      break;

    case ST_READING_BLOCKS:
      {
        // Removi o limite de 20 para ler a tag toda conforme solicitado
        if (blocoAtual > blocoMaxScan) { 
          Serial.print("DATA:"); Serial.println(dadosLidosBuffer);
          estadoAtual = ST_FINISHING;
        } else {
          if (ehBlocoUtil(blocoAtual)) processarLeituraBloco();
          blocoAtual++;
        }
      }
      break;

    case ST_WRITING_BLOCKS:
      {
        int count = 0;
        byte ultimoBlocoTexto = 1;
        for(byte b = 1; b <= blocoMaxScan; b++) {
          if(ehBlocoUtil(b)) {
            count += 16;
            ultimoBlocoTexto = b;
            if(count >= (int)comandoPendente.length()) break;
          }
        }

        byte limiteEscrita;
        if (comandoPendente == "") limiteEscrita = blocoMaxScan;
        else limiteEscrita = (ultimoBlocoTexto > 10) ? ultimoBlocoTexto : 10;
        
        if (limiteEscrita > blocoMaxScan) limiteEscrita = blocoMaxScan;

        if (blocoAtual > limiteEscrita) {
          Serial.println("STATUS:SUCESSO");
          comandoPendente = "";
          modoGravacao = false;
          
          // Re-lê para atualizar interface
          blocoAtual = BLOCO_INICIAL;
          dadosLidosBuffer = "";
          estadoAtual = ST_READING_BLOCKS; 
        } else {
          if (ehBlocoUtil(blocoAtual)) processarEscritaBloco();
          blocoAtual++;
        }
      }
      break;

    case ST_FINISHING:
      mfrc522.PICC_HaltA();
      mfrc522.PCD_StopCrypto1();
      lastActionTime = millis();
      estadoAtual = ST_IDLE;
      blocoAtual = 0;
      break;
  }
}

void executarScanBloco() {
  if (!prepararBloco(blocoAtual)) return;

  byte buffer[18]; byte size = sizeof(buffer);
  if (mfrc522.MIFARE_Read(blocoAtual, buffer, &size) == MFRC522::STATUS_OK) {
    Serial.print("BLOCK:"); Serial.print(blocoAtual); Serial.print(":");
    for (byte i = 0; i < 16; i++) {
      if(buffer[i] < 0x10) Serial.print("0");
      Serial.print(buffer[i], HEX);
    }
    Serial.print("|");
    for (byte i = 0; i < 16; i++) Serial.print((buffer[i] >= 32 && buffer[i] <= 126) ? (char)buffer[i] : '.');
    Serial.println();
  }
}

void processarLeituraBloco() {
  if (!prepararBloco(blocoAtual)) return;

  byte buffer[18]; byte size = sizeof(buffer);
  if (mfrc522.MIFARE_Read(blocoAtual, buffer, &size) == MFRC522::STATUS_OK) {
    for (byte i = 0; i < 16; i++) if (buffer[i] >= 32 && buffer[i] <= 126) dadosLidosBuffer += (char)buffer[i];
  }
}

void processarEscritaBloco() {
  if (!prepararBloco(blocoAtual)) return;

  byte dataBlock[16] = {0}; 
  int progresso = 0;
  for(int b = 1; b < blocoAtual; b++) if(ehBlocoUtil(b)) progresso += 16;

  if (progresso < (int)comandoPendente.length()) {
    for (byte i = 0; i < 16; i++) {
      if (progresso + i < (int)comandoPendente.length()) dataBlock[i] = (byte)comandoPendente[progresso + i];
    }
  }
  mfrc522.MIFARE_Write(blocoAtual, dataBlock, 16);
}
