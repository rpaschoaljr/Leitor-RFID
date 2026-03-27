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
unsigned long lastHeartbeatTime = 0;
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

bool prepararBloco(byte bloco) {
  MFRC522::StatusCode status = mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloco, &key, &(mfrc522.uid));
  if (status == MFRC522::STATUS_OK) return true;
  
  // Se falhar a autenticação, avisamos o erro e encerramos a operação
  Serial.print("ERROR:AUTH_FAILED_BLOCK_"); Serial.println(bloco);
  return false;
}

void loop() {
  if (millis() - lastHeartbeatTime >= 1000) {
    Serial.println("LOG:HEARTBEAT");
    lastHeartbeatTime = millis();
  }

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
    } else if (input == "CANCEL") {
      modoScan = false;
      modoGravacao = false;
      comandoPendente = "";
      estadoAtual = ST_FINISHING;
      Serial.println("LOG:OPERACAO_CANCELADA");
    }
  }

  switch (estadoAtual) {
    case ST_IDLE:
      if (millis() - lastActionTime > COOLDOWN_MS || modoScan || modoGravacao) {
        bool cartaoEncontrado = false;
        if (mfrc522.PICC_IsNewCardPresent()) cartaoEncontrado = true;
        else if (modoScan || modoGravacao) {
          byte bufferATQA[2];
          byte bufferSize = sizeof(bufferATQA);
          if (mfrc522.PICC_WakeupA(bufferATQA, &bufferSize) == MFRC522::STATUS_OK) cartaoEncontrado = true;
        }
        if (cartaoEncontrado && mfrc522.PICC_ReadCardSerial()) estadoAtual = ST_CARD_DETECTED;
      }
      break;

    case ST_CARD_DETECTED:
      {
        MFRC522::PICC_Type piccType = mfrc522.PICC_GetType(mfrc522.uid.sak);
        Serial.print("TYPE:"); Serial.println(mfrc522.PICC_GetTypeName(piccType));
        
        // Detecção inicial baseada no tipo, mas com fallback alto para "Universal"
        if (piccType == MFRC522::PICC_TYPE_MIFARE_1K) blocoMaxScan = 63;
        else if (piccType == MFRC522::PICC_TYPE_MIFARE_4K) blocoMaxScan = 255;
        else if (piccType == MFRC522::PICC_TYPE_MIFARE_UL) blocoMaxScan = 15;
        else blocoMaxScan = 255; // Fallback alto para tags genéricas (o erro de leitura parará o loop)

        Serial.print("BLOCKS_EXPECTED:"); Serial.println(blocoMaxScan + 1);
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
        if (!executarScanBloco()) { // Se falhar um bloco, encerramos o scan aqui
           Serial.println("SCAN:FIM_PREMATURO");
           modoScan = false;
           estadoAtual = ST_FINISHING;
        } else {
           blocoAtual++;
        }
      }
      break;

    case ST_READING_BLOCKS:
      if (blocoAtual > blocoMaxScan) { 
        Serial.print("DATA:"); Serial.println(dadosLidosBuffer);
        estadoAtual = ST_FINISHING;
      } else {
        bool sucesso = true;
        if (ehBlocoUtil(blocoAtual)) sucesso = processarLeituraBloco();
        
        if (!sucesso) {
           Serial.print("DATA:"); Serial.println(dadosLidosBuffer);
           estadoAtual = ST_FINISHING;
        } else {
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
        byte limiteEscrita = (comandoPendente == "") ? blocoMaxScan : ((ultimoBlocoTexto > 10) ? ultimoBlocoTexto : 10);
        if (limiteEscrita > blocoMaxScan) limiteEscrita = blocoMaxScan;

        if (blocoAtual > limiteEscrita) {
          Serial.println("STATUS:SUCESSO");
          comandoPendente = "";
          modoGravacao = false;
          blocoAtual = BLOCO_INICIAL;
          dadosLidosBuffer = "";
          estadoAtual = ST_READING_BLOCKS; 
        } else {
          bool sucesso = true;
          if (ehBlocoUtil(blocoAtual)) sucesso = processarEscritaBloco();
          
          if (!sucesso) {
             Serial.println("STATUS:ERRO_ESCRITA");
             modoGravacao = false;
             estadoAtual = ST_FINISHING;
          } else {
             blocoAtual++;
          }
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

bool executarScanBloco() {
  if (!prepararBloco(blocoAtual)) return false;
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
    return true;
  }
  return false;
}

bool processarLeituraBloco() {
  if (!prepararBloco(blocoAtual)) return false;
  byte buffer[18]; byte size = sizeof(buffer);
  if (mfrc522.MIFARE_Read(blocoAtual, buffer, &size) == MFRC522::STATUS_OK) {
    for (byte i = 0; i < 16; i++) if (buffer[i] >= 32 && buffer[i] <= 126) dadosLidosBuffer += (char)buffer[i];
    return true;
  }
  return false;
}

bool processarEscritaBloco() {
  if (!prepararBloco(blocoAtual)) return false;
  byte dataBlock[16] = {0}; 
  int progresso = 0;
  for(int b = 1; b < blocoAtual; b++) if(ehBlocoUtil(b)) progresso += 16;
  if (progresso < (int)comandoPendente.length()) {
    for (byte i = 0; i < 16; i++) {
      if (progresso + i < (int)comandoPendente.length()) dataBlock[i] = (byte)comandoPendente[progresso + i];
    }
  }
  if (mfrc522.MIFARE_Write(blocoAtual, dataBlock, 16) == MFRC522::STATUS_OK) return true;
  return false;
}
