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

/*
 * CHANNEL TELEGRAM SUMBER
 */
const TELEGRAM_SOURCE_CHAT_ID =
  "-1003805596350";

/*
 * GRUP WHATSAPP TUJUAN
 */
const WHATSAPP_TARGET_GROUP =
  "120363412428233121@g.us";

/* =========================================================
   STATUS
========================================================= */

let qrImage = null;
let whatsappConnected = false;
let connectionStatus = "Memulai bot...";
let reconnectTimer = null;
let currentSock = null;

let telegramOffset = 0;
let telegramPollingStarted = false;

const handled = new Set();

/*
 * Album Telegram.
 *
 * Telegram mengirim setiap foto album sebagai update terpisah
 * dengan media_group_id yang sama.
 */
const telegramAlbums = new Map();

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

      <div class="info">
        🛡️ Anti-Spam Aktif
      </div>

      <div class="info">
        ${
          TELEGRAM_BOT_TOKEN
            ? "🤖 Telegram → WhatsApp Aktif"
            : "⚠️ Telegram Token Belum Diatur"
        }
      </div>

      <p>
        Bot sedang memantau grup dan
        posting Telegram.
      </p>
    `;

  } else if (qrImage) {

    content = `
      <h1>SSJ Anti-Spam Bot</h1>

      <p class="subtitle">
        Scan QR menggunakan nomor WhatsApp bot.
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
        3. Pilih <b>Perangkat tertaut</b><br>
        4. Tekan <b>Tautkan perangkat</b><br>
        5. Scan QR di atas
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

  background: #101d17;

  padding: 30px 20px;

  border-radius: 24px;

  text-align: center;

  box-shadow:
    0 20px 50px
    rgba(0,0,0,0.4);
}

.logo {
  font-size: 55px;
  margin-bottom: 15px;
}

h1 {
  font-size: 28px;
  margin-bottom: 15px;
}

.subtitle {
  color: #b8c8c0;
  line-height: 1.6;
}

.qr-box {
  width: 100%;
  max-width: 360px;

  margin: 25px auto;
  padding: 18px;

  background: white;
  border-radius: 16px;
}

.qr-box img {
  width: 100%;
  height: auto;
  display: block;
}

.steps {
  text-align: left;

  padding: 20px;
  margin-top: 20px;

  background: #182820;

  border-radius: 15px;

  line-height: 1.8;
}

.success-icon {
  width: 90px;
  height: 90px;

  margin: 10px auto 25px;

  border-radius: 50%;

  display: flex;
  align-items: center;
  justify-content: center;

  background: #25D366;

  font-size: 55px;
  font-weight: bold;
}

.success {
  margin: 25px 0;
  padding: 18px;

  background: #123d26;
  color: #78efa0;

  border-radius: 14px;

  font-size: 18px;
  font-weight: bold;
}

.info {
  margin-top: 12px;
  padding: 15px;

  background: #182820;

  border-radius: 12px;

  color: #b9d7c7;
}

.status {
  color: #25D366;
}

.loader {
  width: 60px;
  height: 60px;

  margin: 15px auto 30px;

  border:
    7px solid #263a30;

  border-top:
    7px solid #25D366;

  border-radius: 50%;

  animation:
    spin 1s linear infinite;
}

@keyframes spin {

  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
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
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

  res.json({

    ok: true,

    whatsappConnected,

    telegramConfigured:
      Boolean(TELEGRAM_BOT_TOKEN),

    telegramSource:
      TELEGRAM_SOURCE_CHAT_ID,

    whatsappTarget:
      WHATSAPP_TARGET_GROUP,

    status:
      connectionStatus
  });
});

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
   WHATSAPP MESSAGE HELPER
========================================================= */

function unwrapMessage(message) {

  if (!message) {
    return null;
  }

  if (message.ephemeralMessage) {

    return unwrapMessage(
      message.ephemeralMessage.message
    );
  }

  if (message.viewOnceMessage) {

    return unwrapMessage(
      message.viewOnceMessage.message
    );
  }

  if (message.viewOnceMessageV2) {

    return unwrapMessage(
      message.viewOnceMessageV2.message
    );
  }

  if (message.documentWithCaptionMessage) {

    return unwrapMessage(
      message
        .documentWithCaptionMessage
        .message
    );
  }

  return message;
}

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

function getParticipant(msg) {

  return (
    msg?.key?.participant ||
    msg?.participant ||
    null
  );
}

/* =========================================================
   RESET AUTH
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
      error?.message || error
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

        reconnectTimer = null;

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
   TELEGRAM API
========================================================= */

async function telegramApi(
  method,
  params = {}
) {

  const response =
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(params)
      }
    );

  const data =
    await response.json();

  if (!data.ok) {

    throw new Error(
      data.description ||
      `Telegram ${method} gagal`
    );
  }

  return data.result;
}

/* =========================================================
   DOWNLOAD FILE TELEGRAM
========================================================= */

async function downloadTelegramFile(
  fileId
) {

  const file =
    await telegramApi(
      "getFile",
      {
        file_id:
          fileId
      }
    );

  if (!file?.file_path) {

    throw new Error(
      "Telegram file_path tidak ditemukan."
    );
  }

  const url =
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      `Download Telegram gagal: ${response.status}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  return Buffer.from(
    arrayBuffer
  );
}

/* =========================================================
   KIRIM TEXT KE WHATSAPP
========================================================= */

async function sendTextToWhatsApp(
  text
) {

  if (
    !currentSock ||
    !whatsappConnected
  ) {

    throw new Error(
      "WhatsApp belum terhubung."
    );
  }

  if (!text?.trim()) {
    return;
  }

  await currentSock.sendMessage(
    WHATSAPP_TARGET_GROUP,
    {
      text:
        text.trim()
    }
  );

  console.log(
    "✅ Teks Telegram dikirim ke WhatsApp."
  );
}

/* =========================================================
   KIRIM FOTO KE WHATSAPP
========================================================= */

async function sendPhotoToWhatsApp(
  post,
  caption = ""
) {

  if (
    !currentSock ||
    !whatsappConnected
  ) {

    throw new Error(
      "WhatsApp belum terhubung."
    );
  }

  if (
    !post.photo ||
    !post.photo.length
  ) {

    return;
  }

  /*
   * Telegram memberi beberapa ukuran foto.
   * Elemen terakhir biasanya resolusi terbesar.
   */

  const photo =
    post.photo[
      post.photo.length - 1
    ];

  const buffer =
    await downloadTelegramFile(
      photo.file_id
    );

  await currentSock.sendMessage(
    WHATSAPP_TARGET_GROUP,
    {
      image:
        buffer,

      caption:
        caption || ""
    }
  );

  console.log(
    "✅ Foto Telegram dikirim ke WhatsApp."
  );
}

/* =========================================================
   KIRIM VIDEO KE WHATSAPP
========================================================= */

async function sendVideoToWhatsApp(
  post,
  caption = ""
) {

  if (
    !currentSock ||
    !whatsappConnected
  ) {

    throw new Error(
      "WhatsApp belum terhubung."
    );
  }

  const video =
    post.video;

  if (!video?.file_id) {
    return;
  }

  const buffer =
    await downloadTelegramFile(
      video.file_id
    );

  await currentSock.sendMessage(
    WHATSAPP_TARGET_GROUP,
    {
      video:
        buffer,

      caption:
        caption || "",

      mimetype:
        video.mime_type ||
        "video/mp4"
    }
  );

  console.log(
    "✅ Video Telegram dikirim ke WhatsApp."
  );
}

/* =========================================================
   PROSES ALBUM
========================================================= */

function queueTelegramAlbum(
  post
) {

  const groupId =
    post.media_group_id;

  if (!groupId) {
    return;
  }

  let album =
    telegramAlbums.get(
      groupId
    );

  if (!album) {

    album = {
      posts: [],
      timer: null
    };

    telegramAlbums.set(
      groupId,
      album
    );
  }

  album.posts.push(
    post
  );

  if (album.timer) {

    clearTimeout(
      album.timer
    );
  }

  /*
   * Tunggu sebentar agar seluruh
   * item album terkumpul.
   */

  album.timer =
    setTimeout(
      async () => {

        const current =
          telegramAlbums.get(
            groupId
          );

        telegramAlbums.delete(
          groupId
        );

        if (!current) {
          return;
        }

        try {

          const posts =
            current.posts.sort(
              (a, b) =>
                (a.message_id || 0) -
                (b.message_id || 0)
            );

          /*
           * Biasanya caption album hanya
           * ada pada salah satu foto.
           */

          const caption =
            posts
              .map(
                (item) =>
                  item.caption || ""
              )
              .find(
                (value) =>
                  value.trim()
              ) ||
            "";

          console.log(
            `🖼️ Memproses album Telegram: ${posts.length} item`
          );

          let captionUsed =
            false;

          for (
            const item
            of posts
          ) {

            if (item.photo) {

              await sendPhotoToWhatsApp(
                item,
                captionUsed
                  ? ""
                  : caption
              );

              captionUsed =
                true;

              await sleep(
                700
              );

              continue;
            }

            if (item.video) {

              await sendVideoToWhatsApp(
                item,
                captionUsed
                  ? ""
                  : caption
              );

              captionUsed =
                true;

              await sleep(
                700
              );
            }
          }

          console.log(
            "✅ Album Telegram selesai dikirim."
          );

        } catch (error) {

          console.error(
            "❌ Gagal mengirim album:",
            error?.message || error
          );
        }

      },
      1800
    );
}

/* =========================================================
   PROSES POST TELEGRAM
========================================================= */

async function processTelegramPost(
  post
) {

  const chatId =
    String(
      post?.chat?.id || ""
    );

  /*
   * HANYA channel yang sudah kita tentukan.
   */

  if (
    chatId !==
    TELEGRAM_SOURCE_CHAT_ID
  ) {

    console.log(
      "⏭️ Post Telegram dari chat lain diabaikan:",
      chatId
    );

    return;
  }

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📨 POST PRODUK TELEGRAM"
  );

  console.log(
    "Channel:",
    post.chat?.title || "-"
  );

  console.log(
    "Chat ID:",
    chatId
  );

  console.log(
    "Caption:",
    post.caption ||
    post.text ||
    "-"
  );

  console.log(
    "======================================"
  );

  /*
   * Album
   */

  if (
    post.media_group_id
  ) {

    queueTelegramAlbum(
      post
    );

    return;
  }

  /*
   * Foto tunggal
   */

  if (
    post.photo?.length
  ) {

    await sendPhotoToWhatsApp(
      post,
      post.caption || ""
    );

    return;
  }

  /*
   * Video
   */

  if (
    post.video
  ) {

    await sendVideoToWhatsApp(
      post,
      post.caption || ""
    );

    return;
  }

  /*
   * Text
   */

  if (
    post.text
  ) {

    await sendTextToWhatsApp(
      post.text
    );

    return;
  }

  console.log(
    "ℹ️ Jenis posting Telegram belum didukung."
  );
}

/* =========================================================
   TELEGRAM POLLING
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
    "🤖 TELEGRAM → WHATSAPP AKTIF"
  );

  console.log(
    "Telegram:",
    TELEGRAM_SOURCE_CHAT_ID
  );

  console.log(
    "WhatsApp:",
    WHATSAPP_TARGET_GROUP
  );

  console.log(
    "======================================"
  );

  while (true) {

    try {

      const updates =
        await telegramApi(
          "getUpdates",
          {
            timeout:
              30,

            offset:
              telegramOffset,

            allowed_updates: [
              "channel_post"
            ]
          }
        );

      for (
        const update
        of updates
      ) {

        telegramOffset =
          update.update_id + 1;

        const post =
          update.channel_post;

        if (!post) {
          continue;
        }

        try {

          await processTelegramPost(
            post
          );

        } catch (error) {

          console.error(
            "❌ Gagal memproses post Telegram:",
            error?.message || error
          );
        }
      }

    } catch (error) {

      console.error(
        "❌ Telegram polling error:",
        error?.message || error
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
     CONNECTION
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
            error?.message || error
          );
        }
      }

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
          "✅ TELEGRAM → WHATSAPP SIAP"
        );

        console.log(
          "======================================"
        );
      }

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
          statusCode || "unknown"
        );

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

        connectionStatus =
          "Menghubungkan ulang...";

        scheduleReconnect(
          5000
        );
      }
    }
  );

  /* =====================================================
     MODERASI WHATSAPP
  ===================================================== */

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {

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
           * Pesan yang dikirim bot sendiri
           * tidak dimoderasi.
           */

          if (
            msg.key?.fromMe
          ) {

            continue;
          }

          const jid =
            msg.key
              ?.remoteJid;

          if (
            !jid ||
            !jid.endsWith(
              "@g.us"
            )
          ) {

            continue;
          }

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

          const result =
            evaluateMessage(
              cleanText
            );

          console.log(
            "Hasil moderasi:",
            result
          );

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

          console.log(
            "🚨 PELANGGARAN:",
            result.reason
          );

          /*
           * Hapus pesan
           */

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
              error?.message || error
            );
          }

          if (
            !participant
          ) {

            console.log(
              "⚠️ JID member tidak ditemukan."
            );

            continue;
          }

          /*
           * Keluarkan member
           */

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
              error?.message || error
            );
          }

        } catch (error) {

          console.error(
            "❌ Error memproses pesan:",
            error?.message || error
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
   START TELEGRAM
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
   START WHATSAPP
========================================================= */

startBot()
  .catch(
    (error) => {

      console.error(
        "❌ Bot WhatsApp gagal:",
        error
      );

      scheduleReconnect(
        10000
      );
    }
  );
