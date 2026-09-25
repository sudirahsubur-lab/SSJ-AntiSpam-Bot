import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import express from "express";
import QRCode from "qrcode";

import { config } from "./config.js";
import { evaluateMessage } from "./moderation.js";

const logger = P({ level: "silent" });
const handled = new Set();

const PORT = process.env.PORT || 3000;

let currentQR = null;
let qrImage = null;
let whatsappConnected = false;
let connectionStatus = "Memulai bot...";

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================
   WEB SERVER QR
========================================= */

const app = express();

app.get("/", async (req, res) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  let content = "";

  if (whatsappConnected) {
    content = `
      <div class="success-icon">✓</div>

      <h1>WhatsApp Terhubung</h1>

      <div class="success">
        SSJ Anti-Spam Bot Aktif
      </div>

      <p>
        Bot sudah berhasil terhubung ke WhatsApp.
      </p>

      <p>
        Sekarang masukkan nomor bot ke grup WhatsApp
        dan jadikan sebagai admin.
      </p>
    `;
  } else if (qrImage) {
    content = `
      <h1>SSJ Anti-Spam Bot</h1>

      <p class="subtitle">
        Scan QR berikut menggunakan WhatsApp bot
      </p>

      <div class="qr-box">
        <img
          src="${qrImage}"
          alt="WhatsApp QR"
        />
      </div>

      <div class="steps">
        <b>Cara menghubungkan:</b><br><br>

        1. Buka WhatsApp<br>
        2. Tekan menu ⋮<br>
        3. Pilih <b>Perangkat tertaut</b><br>
        4. Tekan <b>Tautkan perangkat</b><br>
        5. Scan QR di atas
      </div>

      <div class="warning">
        QR WhatsApp akan berubah secara otomatis.
        Jika gagal, tunggu QR baru muncul.
      </div>

      <p class="refresh">
        Halaman diperbarui otomatis.
      </p>
    `;
  } else {
    content = `
      <div class="loader"></div>

      <h1>SSJ Anti-Spam Bot</h1>

      <p>
        Sedang meminta QR WhatsApp...
      </p>

      <p class="status">
        ${connectionStatus}
      </p>

      <p>
        Tunggu beberapa detik.
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

<title>SSJ Anti-Spam Bot</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    linear-gradient(
      135deg,
      #071b14,
      #0b2b20
    );

  color: white;

  min-height: 100vh;

  display: flex;

  justify-content: center;

  align-items: center;
}

.container {
  width: 100%;
  max-width: 480px;

  background: #111b17;

  border-radius: 22px;

  padding: 30px 20px;

  text-align: center;

  box-shadow:
    0 20px 50px
    rgba(0,0,0,0.35);
}

.logo {
  font-size: 46px;
  margin-bottom: 10px;
}

h1 {
  margin:
    5px 0
    10px 0;

  font-size: 27px;
}

.subtitle {
  color: #b9c9c2;
  line-height: 1.5;
}

.qr-box {
  background: white;

  padding: 18px;

  margin:
    25px auto;

  width: 100%;

  max-width: 360px;

  border-radius: 15px;
}

.qr-box img {
  display: block;

  width: 100%;

  height: auto;
}

.steps {
  text-align: left;

  background: #18251f;

  padding: 20px;

  border-radius: 14px;

  line-height: 1.7;

  margin-top: 20px;
}

.warning {
  background: #352c12;

  color: #ffe79a;

  padding: 15px;

  border-radius: 12px;

  margin-top: 20px;

  line-height: 1.5;
}

.refresh {
  color: #8fa39a;

  font-size: 13px;

  margin-top: 20px;
}

.success-icon {
  width: 90px;
  height: 90px;

  border-radius: 50%;

  margin:
    10px auto
    25px auto;

  display: flex;

  align-items: center;

  justify-content: center;

  background: #25D366;

  color: white;

  font-size: 55px;

  font-weight: bold;
}

.success {
  background: #123c26;

  color: #70ef9c;

  padding: 18px;

  border-radius: 14px;

  margin:
    25px 0;

  font-weight: bold;

  font-size: 18px;
}

.status {
  color: #25D366;
}

.loader {
  width: 55px;
  height: 55px;

  margin:
    10px auto
    30px auto;

  border:
    6px solid #24342d;

  border-top:
    6px solid #25D366;

  border-radius: 50%;

  animation:
    spin 1s linear infinite;
}

@keyframes spin {

  0% {
    transform:
      rotate(0deg);
  }

  100% {
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    whatsappConnected,
    qrAvailable: Boolean(qrImage),
    status: connectionStatus
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🌐 QR Web Server aktif pada port ${PORT}`
  );
});

/* =========================================
   AMBIL TEXT PESAN
========================================= */

function getText(msg) {
  const m = msg?.message;

  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage
      ?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

/* =========================================
   WHATSAPP
========================================= */

let reconnecting = false;

async function startBot() {

  console.log("");
  console.log(
    "=================================="
  );
  console.log(
    "       SSJ ANTI-SPAM BOT"
  );
  console.log(
    "=================================="
  );

  connectionStatus =
    "Menyiapkan WhatsApp...";

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      "./auth_info"
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

      auth: state,

      printQRInTerminal: false,

      browser: [
        "SSJ AntiSpam Bot",
        "Chrome",
        "2.0.0"
      ],

      markOnlineOnConnect: false,

      syncFullHistory: false,

      generateHighQualityLinkPreview:
        false,

      connectTimeoutMs: 60000,

      keepAliveIntervalMs: 10000
    });

  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /* =====================================
     STATUS + QR
  ===================================== */

  sock.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      /* QR BARU */

      if (qr) {

        currentQR = qr;

        whatsappConnected = false;

        connectionStatus =
          "QR siap untuk discan";

        try {

          qrImage =
            await QRCode.toDataURL(
              currentQR,
              {
                errorCorrectionLevel:
                  "M",

                margin: 4,

                width: 700
              }
            );

          console.log(
            "✅ QR WhatsApp baru tersedia di halaman web."
          );

        } catch (error) {

          console.error(
            "❌ Gagal membuat gambar QR:",
            error
          );
        }
      }

      /* CONNECTING */

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

      /* BERHASIL */

      if (
        connection ===
        "open"
      ) {

        reconnecting = false;

        whatsappConnected = true;

        currentQR = null;

        qrImage = null;

        connectionStatus =
          "WhatsApp terhubung";

        console.log("");
        console.log(
          "=================================="
        );
        console.log(
          "✅ WHATSAPP TERHUBUNG"
        );
        console.log(
          "✅ SSJ ANTI-SPAM BOT AKTIF"
        );
        console.log(
          "=================================="
        );
        console.log("");
      }

      /* PUTUS */

      if (
        connection ===
        "close"
      ) {

        whatsappConnected = false;

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          "⚠️ Koneksi WhatsApp terputus."
        );

        console.log(
          "Status:",
          statusCode || "unknown"
        );

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          currentQR = null;

          qrImage = null;

          connectionStatus =
            "WhatsApp logout. Restart diperlukan.";

          console.log(
            "❌ Session WhatsApp logout."
          );

          return;
        }

        if (!reconnecting) {

          reconnecting = true;

          connectionStatus =
            "Menghubungkan ulang...";

          await sleep(5000);

          reconnecting = false;

          startBot().catch(
            console.error
          );
        }
      }
    }
  );

  /* =====================================
     MODERASI PESAN
  ===================================== */

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {

      if (
        type !== "notify"
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

          if (
            msg.key.fromMe
          ) {
            continue;
          }

          const messageId =
            msg.key.id;

          if (
            messageId &&
            handled.has(
              messageId
            )
          ) {
            continue;
          }

          if (messageId) {

            handled.add(
              messageId
            );

            setTimeout(
              () => {

                handled.delete(
                  messageId
                );

              },
              60000
            );
          }

          const jid =
            msg.key.remoteJid;

          /*
           * HANYA GRUP
           */

          if (
            !jid ||
            !jid.endsWith(
              "@g.us"
            )
          ) {
            continue;
          }

          const text =
            getText(msg);

          const result =
            await evaluateMessage({
              sock,
              msg,
              text,
              jid,
              config
            });

          if (!result) {
            continue;
          }

          /* HAPUS PESAN */

          if (
            result.delete
          ) {

            try {

              await sock.sendMessage(
                jid,
                {
                  delete:
                    msg.key
                }
              );

              console.log(
                "🗑️ Pesan pelanggaran dihapus"
              );

            } catch (error) {

              console.error(
                "❌ Gagal menghapus pesan:",
                error?.message ||
                error
              );
            }
          }

          /* PERINGATAN */

          if (
            result.reply
          ) {

            try {

              await sock.sendMessage(
                jid,
                {
                  text:
                    result.reply
                },
                {
                  quoted:
                    msg
                }
              );

            } catch (error) {

              console.error(
                "❌ Gagal mengirim peringatan:",
                error?.message ||
                error
              );
            }
          }

          /* KELUARKAN MEMBER */

          if (
            result.kick &&
            msg.key.participant
          ) {

            try {

              await sock
                .groupParticipantsUpdate(
                  jid,
                  [
                    msg.key
                      .participant
                  ],
                  "remove"
                );

              console.log(
                "🚫 Member pelanggar dikeluarkan"
              );

            } catch (error) {

              console.error(
                "❌ Gagal mengeluarkan member:",
                error?.message ||
                error
              );
            }
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

/* =========================================
   ERROR HANDLER
========================================= */

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

/* MULAI */

startBot().catch(
  (error) => {

    console.error(
      "❌ Bot gagal dijalankan:",
      error
    );
  }
);
