import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import express from "express";
import QRCode from "qrcode";
import fs from "fs";

import { evaluateMessage } from "./moderation.js";

/* =========================================================
   CONFIG
========================================================= */

const logger = P({ level: "silent" });

const PORT = process.env.PORT || 8080;
const AUTH_FOLDER = "./auth_info";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "";

/* =========================================================
   STATUS WHATSAPP
========================================================= */

let qrImage = null;
let whatsappConnected = false;
let connectionStatus = "Memulai bot...";
let reconnectTimer = null;
let currentSock = null;

/* =========================================================
   STATUS TELEGRAM
========================================================= */

let telegramOffset = 0;
let telegramPollingStarted = false;

let detectedTelegramChatId = null;
let detectedWhatsAppGroupJid = null;

/* =========================================================
   ANTI DUPLIKAT
========================================================= */

const handled = new Set();

/* =========================================================
   HELPER
========================================================= */

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

/* =========================================================
   WEB SERVER
========================================================= */

const app = express();

app.get("/", (req, res) => {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  let content = "";

  if (whatsappConnected) {

    content = `
      <div class="success-icon">✓</div>

      <h1>WhatsApp Terhubung</h1>

      <div class="success">
        SSJ Anti-Spam Bot AKTIF
      </div>

      <p>
        Bot sudah terhubung ke WhatsApp.
      </p>

      <p>
        Pastikan nomor bot menjadi
        <b>Admin Grup</b>.
      </p>

      <div class="info">
        🛡️ Anti-Spam Aktif
      </div>

      <div class="info">
        ${
          TELEGRAM_BOT_TOKEN
            ? "🤖 Telegram Bridge Aktif"
            : "⚠️ Telegram Token Belum Diatur"
        }
      </div>
    `;

  } else if (qrImage) {

    content = `
      <h1>SSJ Anti-Spam Bot</h1>

      <p class="subtitle">
        Scan QR berikut menggunakan nomor WhatsApp bot.
      </p>

      <div class="qr-box">
        <img
          src="${qrImage}"
          alt="QR WhatsApp"
        >
      </div>

      <div class="steps">

        <b>Cara menghubungkan:</b>

        <br><br>

        1. Buka WhatsApp nomor bot<br>

        2. Tekan menu <b>⋮</b><br>

        3. Pilih
        <b>Perangkat tertaut</b><br>

        4. Tekan
        <b>Tautkan perangkat</b><br>

        5. Scan QR di atas

      </div>

      <div class="warning">

        QR berubah secara otomatis.

        Jika QR kedaluwarsa,
        tunggu QR baru.

      </div>
    `;

  } else {

    content = `
      <div class="loader"></div>

      <h1>
        SSJ Anti-Spam Bot
      </h1>

      <p>
        Sedang menyiapkan koneksi WhatsApp...
      </p>

      <p class="status">
        ${connectionStatus}
      </p>
    `;
  }


  res.send(`
<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
/>

<meta
  http-equiv="refresh"
  content="5"
/>

<title>
SSJ Anti-Spam Bot
</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;
  padding: 20px;

  min-height: 100vh;

  display: flex;

  align-items: center;

  justify-content: center;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    linear-gradient(
      135deg,
      #061a13,
      #0a3022
    );

  color: white;
}

.container {

  width: 100%;

  max-width: 480px;

  background:
    #101d17;

  padding:
    30px 20px;

  border-radius:
    24px;

  text-align:
    center;

  box-shadow:
    0 20px 50px
    rgba(0,0,0,0.4);
}

.logo {

  font-size:
    55px;

  margin-bottom:
    15px;
}

h1 {

  font-size:
    28px;

  margin-bottom:
    15px;
}

.subtitle {

  color:
    #b8c8c0;

  line-height:
    1.6;
}

.qr-box {

  width:
    100%;

  max-width:
    360px;

  margin:
    25px auto;

  padding:
    18px;

  background:
    white;

  border-radius:
    16px;
}

.qr-box img {

  width:
    100%;

  height:
    auto;

  display:
    block;
}

.steps {

  text-align:
    left;

  padding:
    20px;

  margin-top:
    20px;

  background:
    #182820;

  border-radius:
    15px;

  line-height:
    1.8;
}

.warning {

  margin-top:
    20px;

  padding:
    15px;

  background:
    #392f13;

  color:
    #ffe694;

  border-radius:
    12px;

  line-height:
    1.5;
}

.success-icon {

  width:
    90px;

  height:
    90px;

  margin:
    10px auto 25px;

  border-radius:
    50%;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  background:
    #25D366;

  font-size:
    55px;

  font-weight:
    bold;
}

.success {

  margin:
    25px 0;

  padding:
    18px;

  background:
    #123d26;

  color:
    #78efa0;

  border-radius:
    14px;

  font-size:
    18px;

  font-weight:
    bold;
}

.info {

  margin-top:
    12px;

  padding:
    15px;

  background:
    #182820;

  border-radius:
    12px;

  color:
    #b9d7c7;
}

.status {

  color:
    #25D366;
}

.loader {

  width:
    60px;

  height:
    60px;

  margin:
    15px auto 30px;

  border:
    7px solid #263a30;

  border-top:
    7px solid #25D366;

  border-radius:
    50%;

  animation:
    spin 1s linear infinite;
}

@keyframes spin {

  from {
    transform:
      rotate(0deg);
  }

  to {
    transform:
      rotate(360deg);
  }
}

</style>

</head>

<body>

<div class="container">

  <div class="logo">
    🛡️
  </div>

  ${content}

</div>

</body>

</html>
  `);
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      whatsappConnected,

      qrAvailable:
        Boolean(qrImage),

      telegramConfigured:
        Boolean(
          TELEGRAM_BOT_TOKEN
        ),

      telegramChatId:
        detectedTelegramChatId,

      whatsappGroupJid:
        detectedWhatsAppGroupJid,

      status:
        connectionStatus
    });
  }
);

/* =========================================================
   START WEB SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 Web Server aktif pada port ${PORT}`
    );
  }
);

/* =========================================================
   AMBIL TEXT PESAN WHATSAPP
========================================================= */

function unwrapMessage(message) {

  if (!message) {
    return null;
  }

  if (
    message.ephemeralMessage
  ) {

    return unwrapMessage(
      message
        .ephemeralMessage
        .message
    );
  }

  if (
    message.viewOnceMessage
  ) {

    return unwrapMessage(
      message
        .viewOnceMessage
        .message
    );
  }

  if (
    message.viewOnceMessageV2
  ) {

    return unwrapMessage(
      message
        .viewOnceMessageV2
        .message
    );
  }

  if (
    message
      .documentWithCaptionMessage
  ) {

    return unwrapMessage(
      message
        .documentWithCaptionMessage
        .message
    );
  }

  return message;
}

/* =========================================================
   GET TEXT
========================================================= */

function getText(msg) {

  const m =
    unwrapMessage(
      msg?.message
    );

  if (!m) {
    return "";
  }

  return (

    m.conversation ||

    m.extendedTextMessage
      ?.text ||

    m.imageMessage
      ?.caption ||

    m.videoMessage
      ?.caption ||

    m.documentMessage
      ?.caption ||

    m.buttonsResponseMessage
      ?.selectedDisplayText ||

    m.buttonsResponseMessage
      ?.selectedButtonId ||

    m.listResponseMessage
      ?.title ||

    m.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId ||

    ""
  );
}

/* =========================================================
   GET PARTICIPANT
========================================================= */

function getParticipant(msg) {

  return (

    msg?.key
      ?.participant ||

    msg?.participant ||

    null
  );
}

/* =========================================================
   RESET SESSION
========================================================= */

function resetAuthFolder() {

  try {

    if (
      fs.existsSync(
        AUTH_FOLDER
      )
    ) {

      fs.rmSync(
        AUTH_FOLDER,
        {
          recursive: true,
          force: true
        }
      );

      console.log(
        "🧹 Session WhatsApp lama dihapus."
      );
    }

  } catch (error) {

    console.error(
      "❌ Gagal menghapus session:",
      error?.message ||
      error
    );
  }
}

/* =========================================================
   RECONNECT
========================================================= */

function scheduleReconnect(
  delay = 5000
) {

  if (reconnectTimer) {
    return;
  }

  console.log(
    `🔄 Reconnect dalam ${delay / 1000} detik...`
  );

  reconnectTimer =
    setTimeout(
      () => {

        reconnectTimer =
          null;

        startBot().catch(
          (error) => {

            console.error(
              "❌ Reconnect gagal:",
              error
            );

            scheduleReconnect(
              10000
            );
          }
        );

      },
      delay
    );
}

/* =========================================================
   TELEGRAM BOT
========================================================= */

async function startTelegramPolling() {

  if (
    telegramPollingStarted
  ) {

    return;
  }

  if (
    !TELEGRAM_BOT_TOKEN
  ) {

    console.log(
      "⚠️ TELEGRAM_BOT_TOKEN belum tersedia."
    );

    return;
  }

  telegramPollingStarted =
    true;

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "🤖 TELEGRAM BOT AKTIF"
  );

  console.log(
    "Menunggu posting baru..."
  );

  console.log(
    "======================================"
  );

  console.log("");


  while (true) {

    try {

      const url =
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=30&offset=${telegramOffset}&allowed_updates=["channel_post","message"]`;


      const response =
        await fetch(url);


      if (!response.ok) {

        console.error(
          "❌ Telegram HTTP:",
          response.status
        );

        await sleep(5000);

        continue;
      }


      const data =
        await response.json();


      if (!data.ok) {

        console.error(
          "❌ Telegram API:",
          data.description ||
          "Unknown error"
        );

        await sleep(5000);

        continue;
      }


      for (
        const update
        of data.result
      ) {

        telegramOffset =
          update.update_id + 1;


        const post =
          update.channel_post ||
          update.message;


        if (!post) {
          continue;
        }


        const chatId =
          String(
            post.chat?.id ||
            ""
          );


        if (!chatId) {
          continue;
        }


        detectedTelegramChatId =
          chatId;


        const title =
          post.chat?.title ||
          post.chat?.username ||
          post.chat?.first_name ||
          "-";


        const text =
          post.text ||
          post.caption ||
          "";


        let mediaType =
          "TEXT";


        if (
          post.photo
        ) {

          mediaType =
            "FOTO";
        }

        else if (
          post.video
        ) {

          mediaType =
            "VIDEO";
        }

        else if (
          post.document
        ) {

          mediaType =
            "DOKUMEN";
        }


        console.log("");
        console.log(
          "======================================"
        );

        console.log(
          "📨 POSTING TELEGRAM TERDETEKSI"
        );

        console.log(
          "Channel:",
          title
        );

        console.log(
          "TELEGRAM CHAT ID:",
          chatId
        );

        console.log(
          "Jenis:",
          mediaType
        );

        console.log(
          "Pesan:",
          text ||
          "[MEDIA TANPA CAPTION]"
        );

        console.log(
          "======================================"
        );

        console.log("");
      }

    } catch (error) {

      console.error(
        "❌ Telegram polling error:",
        error?.message ||
        error
      );

      await sleep(
        5000
      );
    }
  }
}

/* =========================================================
   WHATSAPP BOT
========================================================= */

async function startBot() {

  console.log("");

  console.log(
    "======================================"
  );

  console.log(
    "          SSJ ANTI-SPAM BOT"
  );

  console.log(
    "======================================"
  );


  connectionStatus =
    "Menyiapkan WhatsApp...";


  whatsappConnected =
    false;


  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      AUTH_FOLDER
    );


  const {
    version
  } =
    await fetchLatestBaileysVersion();


  console.log(
    "Baileys version:",
    version.join(".")
  );


  const sock =
    makeWASocket({

      version,

      logger,

      auth:
        state,

      printQRInTerminal:
        false,

      browser: [
        "SSJ AntiSpam Bot",
        "Chrome",
        "2.0.0"
      ],

      markOnlineOnConnect:
        false,

      syncFullHistory:
        false,

      generateHighQualityLinkPreview:
        false,

      connectTimeoutMs:
        60000,

      keepAliveIntervalMs:
        15000
    });


  currentSock =
    sock;


  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /* =====================================================
     CONNECTION UPDATE
  ===================================================== */

  sock.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect,
        qr
      } =
        update;


      /* =================================================
         QR
      ================================================= */

      if (qr) {

        whatsappConnected =
          false;

        connectionStatus =
          "QR siap untuk dipindai";


        try {

          qrImage =
            await QRCode.toDataURL(
              qr,
              {

                errorCorrectionLevel:
                  "M",

                margin:
                  3,

                width:
                  700
              }
            );


          console.log(
            "📱 QR WhatsApp tersedia."
          );

        } catch (error) {

          console.error(
            "❌ Gagal membuat QR:",
            error?.message ||
            error
          );
        }
      }


      /* =================================================
         CONNECTING
      ================================================= */

      if (
        connection ===
        "connecting"
      ) {

        connectionStatus =
          "Menghubungkan WhatsApp...";

        console.log(
          "⏳ Menghubungkan WhatsApp..."
        );
      }


      /* =================================================
         OPEN
      ================================================= */

      if (
        connection ===
        "open"
      ) {

        qrImage =
          null;

        whatsappConnected =
          true;

        connectionStatus =
          "WhatsApp terhubung";


        console.log("");

        console.log(
          "======================================"
        );

        console.log(
          "✅ WHATSAPP TERHUBUNG"
        );

        console.log(
          "✅ SSJ ANTI-SPAM BOT AKTIF"
        );

        console.log(
          "======================================"
        );

        console.log("");
      }


      /* =================================================
         CLOSE
      ================================================= */

      if (
        connection ===
        "close"
      ) {

        whatsappConnected =
          false;


        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;


        console.log(
          "⚠️ WhatsApp terputus."
        );


        console.log(
          "Status:",
          statusCode ||
          "unknown"
        );


        /* ===============================================
           LOGGED OUT
        =============================================== */

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          console.log(
            "🚪 WhatsApp logout."
          );


          connectionStatus =
            "Session logout. Membuat QR baru...";


          qrImage =
            null;


          resetAuthFolder();


          scheduleReconnect(
            3000
          );


          return;
        }


        /* ===============================================
           RESTART REQUIRED
        =============================================== */

        if (
          statusCode ===
            DisconnectReason.restartRequired ||
          statusCode ===
            515
        ) {

          connectionStatus =
            "Restart koneksi WhatsApp...";


          console.log(
            "🔄 WhatsApp meminta restart koneksi."
          );


          scheduleReconnect(
            2000
          );


          return;
        }


        /* ===============================================
           RECONNECT BIASA
        =============================================== */

        connectionStatus =
          "Menghubungkan ulang...";


        scheduleReconnect(
          5000
        );
      }
    }
  );

  /* =====================================================
     PESAN WHATSAPP
  ===================================================== */

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {


      /*
       * Hanya pesan baru.
       */

      if (
        type !==
        "notify"
      ) {

        return;
      }


      for (
        const msg
        of messages
      ) {

        try {

          if (
            !msg?.message
          ) {

            continue;
          }


          /*
           * Abaikan pesan
           * dari bot sendiri.
           */

          if (
            msg.key?.fromMe
          ) {

            continue;
          }


          const jid =
            msg.key
              ?.remoteJid;


          /*
           * Hanya grup WhatsApp.
           */

          if (
            !jid ||
            !jid.endsWith(
              "@g.us"
            )
          ) {

            continue;
          }


          /* =================================================
             DETEKSI GROUP JID
          ================================================= */

          detectedWhatsAppGroupJid =
            jid;


          console.log("");
          console.log(
            "🎯 WHATSAPP GROUP JID:",
            detectedWhatsAppGroupJid
          );


          /*
           * Anti proses pesan
           * dua kali.
           */

          const messageId =
            msg.key?.id;


          if (
            messageId &&
            handled.has(
              messageId
            )
          ) {

            continue;
          }


          if (
            messageId
          ) {

            handled.add(
              messageId
            );


            setTimeout(
              () => {

                handled.delete(
                  messageId
                );

              },
              120000
            );
          }


          const text =
            getText(
              msg
            );


          if (
            typeof text !==
            "string"
          ) {

            continue;
          }


          const cleanText =
            text.trim();


          if (
            !cleanText
          ) {

            continue;
          }


          const participant =
            getParticipant(
              msg
            );


          console.log("");

          console.log(
            "📩 PESAN GRUP"
          );


          console.log(
            "Pengirim:",
            participant ||
            "unknown"
          );


          console.log(
            "Pesan:",
            cleanText
          );


          /* =================================================
             MODERASI

             PENTING:
             evaluateMessage menerima STRING.
          ================================================= */

          const result =
            evaluateMessage(
              cleanText
            );


          console.log(
            "Hasil moderasi:",
            result
          );


          /* =================================================
             BUKAN PELANGGARAN
          ================================================= */

          if (
            !result?.violation
          ) {


            if (
              result
                ?.protectedContext
            ) {

              console.log(
                "🟢 Pertanyaan scam dilindungi."
              );
            }


            continue;
          }


          /* =================================================
             PELANGGARAN
          ================================================= */

          console.log(
            "🚨 PELANGGARAN:",
            result.reason
          );


          /* =================================================
             HAPUS PESAN
          ================================================= */

          try {

            await sock.sendMessage(
              jid,
              {
                delete:
                  msg.key
              }
            );


            console.log(
              "🗑️ Pesan pelanggaran dihapus."
            );


          } catch (error) {


            console.error(
              "❌ Gagal menghapus pesan:",
              error?.message ||
              error
            );
          }


          /* =================================================
             PARTICIPANT TIDAK DITEMUKAN
          ================================================= */

          if (
            !participant
          ) {

            console.log(
              "⚠️ JID member tidak ditemukan."
            );


            continue;
          }


          /* =================================================
             KELUARKAN MEMBER
          ================================================= */

          try {

            await sock
              .groupParticipantsUpdate(
                jid,
                [
                  participant
                ],
                "remove"
              );


            console.log(
              "🚫 MEMBER DIKELUARKAN:",
              participant
            );


          } catch (error) {


            console.error(
              "❌ Gagal mengeluarkan member:",
              error?.message ||
              error
            );
          }


        } catch (error) {


          console.error(
            "❌ Error memproses pesan:",
            error?.message ||
            error
          );
        }
      }
    }
  );


  return sock;
}

/* =========================================================
   ERROR HANDLER
========================================================= */

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "❌ Uncaught Exception:",
      error
    );
  }
);


process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

/* =========================================================
   MULAI TELEGRAM
========================================================= */

startTelegramPolling()
  .catch(
    (error) => {

      console.error(
        "❌ Telegram Bot gagal:",
        error
      );
    }
  );

/* =========================================================
   MULAI WHATSAPP
========================================================= */

startBot()
  .catch(
    (error) => {

      console.error(
        "❌ Bot WhatsApp gagal dijalankan:",
        error
      );


      scheduleReconnect(
        10000
      );
    }
  );
