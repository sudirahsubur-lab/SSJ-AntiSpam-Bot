import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import express from "express";
import QRCode from "qrcode";
import fs from "fs";

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

/*
 * SALURAN WHATSAPP
 */
const WHATSAPP_CHANNEL_INVITE =
  "0029Vb9G1dx1CYoWEAPbRN2G";

let WHATSAPP_TARGET_CHANNEL = null;

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

const telegramAlbums = new Map();

/* =========================================================
   HELPER
========================================================= */

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

function errorMessage(error) {
  return (
    error?.message ||
    String(error)
  );
}

/* =========================================================
   WHATSAPP CHANNEL
========================================================= */

async function resolveWhatsAppChannel() {

  if (!currentSock) {
    return null;
  }

  try {

    console.log("");
    console.log(
      "🔎 Mencari Saluran WhatsApp..."
    );

    const metadata =
      await currentSock.newsletterMetadata(
        "invite",
        WHATSAPP_CHANNEL_INVITE
      );

    if (!metadata?.id) {

      throw new Error(
        "JID Saluran WhatsApp tidak ditemukan."
      );
    }

    WHATSAPP_TARGET_CHANNEL =
      metadata.id;

    console.log(
      "======================================"
    );

    console.log(
      "📢 SALURAN WHATSAPP DITEMUKAN"
    );

    console.log(
      "Nama:",
      metadata.name || "-"
    );

    console.log(
      "JID:",
      WHATSAPP_TARGET_CHANNEL
    );

    console.log(
      "======================================"
    );

    return WHATSAPP_TARGET_CHANNEL;

  } catch (error) {

    WHATSAPP_TARGET_CHANNEL =
      null;

    console.error(
      "❌ Gagal membaca Saluran WhatsApp:",
      errorMessage(error)
    );

    return null;
  }
}

/* =========================================================
   WEB SERVER
========================================================= */

const app = express();

app.get("/", (req, res) => {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  let content = "";

  if (whatsappConnected) {

    content = `
      <div class="success-icon">✓</div>

      <h1>SSJ Posting Bot</h1>

      <div class="success">
        WhatsApp Terhubung
      </div>

      <div class="info">
        ${
          TELEGRAM_BOT_TOKEN
            ? "🤖 Telegram → WhatsApp Aktif"
            : "⚠️ Telegram Token Belum Diatur"
        }
      </div>

      <div class="info">
        📱 Grup WhatsApp Siap
      </div>

      <div class="info">
        ${
          WHATSAPP_TARGET_CHANNEL
            ? "📢 Saluran WhatsApp Terdeteksi"
            : "⚠️ Saluran WhatsApp Belum Terdeteksi"
        }
      </div>

      <div class="info">
        <a href="/test-channel">
          Test Saluran WhatsApp
        </a>
      </div>

      <p>
        Bot khusus meneruskan posting Telegram
        ke WhatsApp.
      </p>
    `;

  } else if (qrImage) {

    content = `
      <h1>SSJ Posting Bot</h1>

      <p>
        Scan QR menggunakan WhatsApp bot.
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

        1. Buka WhatsApp<br>
        2. Tekan menu <b>⋮</b><br>
        3. Pilih <b>Perangkat tertaut</b><br>
        4. Tekan <b>Tautkan perangkat</b><br>
        5. Scan QR di atas
      </div>
    `;

  } else {

    content = `
      <div class="loader"></div>

      <h1>SSJ Posting Bot</h1>

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
>

<meta
  http-equiv="refresh"
  content="5"
>

<title>SSJ Posting Bot</title>

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

.info a {
  color: #78efa0;
}

.status {
  color: #25D366;
}

.loader {
  width: 60px;
  height: 60px;

  margin: 15px auto 30px;

  border: 7px solid #263a30;
  border-top: 7px solid #25D366;

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
    📦
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
      Boolean(
        TELEGRAM_BOT_TOKEN
      ),

    telegramSource:
      TELEGRAM_SOURCE_CHAT_ID,

    whatsappGroup:
      WHATSAPP_TARGET_GROUP,

    whatsappChannel:
      WHATSAPP_TARGET_CHANNEL,

    whatsappChannelDetected:
      Boolean(
        WHATSAPP_TARGET_CHANNEL
      ),

    status:
      connectionStatus
  });
});

/* =========================================================
   TEST CHANNEL
========================================================= */

app.get(
  "/test-channel",
  async (req, res) => {

    try {

      if (
        !currentSock ||
        !whatsappConnected
      ) {

        return res
          .status(503)
          .json({
            ok: false,
            error:
              "WhatsApp belum terhubung"
          });
      }

      if (
        !WHATSAPP_TARGET_CHANNEL
      ) {

        await resolveWhatsAppChannel();
      }

      if (
        !WHATSAPP_TARGET_CHANNEL
      ) {

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "Saluran WhatsApp belum ditemukan"
          });
      }

      const result =
        await currentSock.sendMessage(
          WHATSAPP_TARGET_CHANNEL,
          {
            text:
              "TEST SSJ POSTING BOT"
          }
        );

      console.log(
        "📢 Hasil test Channel:"
      );

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      res.json({
        ok: true,
        channel:
          WHATSAPP_TARGET_CHANNEL,
        result
      });

    } catch (error) {

      console.error(
        "❌ Test Channel gagal:",
        errorMessage(error)
      );

      res
        .status(500)
        .json({
          ok: false,
          error:
            errorMessage(error)
        });
    }
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
      errorMessage(error)
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

        startBot()
          .catch(
            (error) => {

              console.error(
                "❌ Reconnect gagal:",
                errorMessage(error)
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

  if (!TELEGRAM_BOT_TOKEN) {

    throw new Error(
      "TELEGRAM_BOT_TOKEN belum tersedia."
    );
  }

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
          JSON.stringify(
            params
          )
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
   DOWNLOAD TELEGRAM MEDIA
========================================================= */

async function downloadTelegramFile(
  fileId,
  retry = 3
) {

  if (!fileId) {

    throw new Error(
      "Telegram file_id kosong."
    );
  }

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= retry;
    attempt++
  ) {

    try {

      console.log(
        `⬇️ Telegram getFile percobaan ${attempt}/${retry}`
      );

      const file =
        await telegramApi(
          "getFile",
          {
            file_id:
              fileId
          }
        );

      if (
        !file?.file_path
      ) {

        throw new Error(
          "Telegram file_path tidak ditemukan."
        );
      }

      const url =
        `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const response =
        await fetch(
          url,
          {
            cache:
              "no-store"
          }
        );

      if (!response.ok) {

        throw new Error(
          `Download Telegram gagal HTTP ${response.status}`
        );
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const buffer =
        Buffer.from(
          arrayBuffer
        );

      if (!buffer.length) {

        throw new Error(
          "File Telegram kosong."
        );
      }

      console.log(
        `✅ Media Telegram berhasil diunduh: ${buffer.length} bytes`
      );

      return buffer;

    } catch (error) {

      lastError =
        error;

      console.error(
        `⚠️ Download Telegram percobaan ${attempt} gagal:`,
        errorMessage(error)
      );

      if (
        attempt < retry
      ) {

        await sleep(
          1500 * attempt
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "Download Telegram gagal."
    );
}

/* =========================================================
   FOTO TELEGRAM
========================================================= */

function getBestTelegramPhoto(
  post
) {

  if (
    !Array.isArray(
      post?.photo
    ) ||
    !post.photo.length
  ) {

    return null;
  }

  /*
   * Telegram biasanya mengurutkan
   * PhotoSize dari kecil ke besar.
   *
   * Kita tetap mencari berdasarkan
   * ukuran agar lebih aman.
   */

  return [
    ...post.photo
  ].sort(
    (a, b) => {

      const sizeA =
        a.file_size ||
        (
          (a.width || 0) *
          (a.height || 0)
        );

      const sizeB =
        b.file_size ||
        (
          (b.width || 0) *
          (b.height || 0)
        );

      return (
        sizeB -
        sizeA
      );
    }
  )[0];
}

/* =========================================================
   PASTIKAN CHANNEL
========================================================= */

async function ensureWhatsAppChannel() {

  if (
    WHATSAPP_TARGET_CHANNEL
  ) {

    return true;
  }

  await resolveWhatsAppChannel();

  return Boolean(
    WHATSAPP_TARGET_CHANNEL
  );
}

/* =========================================================
   KIRIM TEKS
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

  const cleanText =
    String(
      text || ""
    ).trim();

  if (!cleanText) {
    return;
  }

  /*
   * GRUP
   */

  try {

    await currentSock.sendMessage(
      WHATSAPP_TARGET_GROUP,
      {
        text:
          cleanText
      }
    );

    console.log(
      "✅ Teks → Grup WhatsApp"
    );

  } catch (error) {

    console.error(
      "❌ Teks → Grup gagal:",
      errorMessage(error)
    );
  }

  /*
   * CHANNEL
   */

  await ensureWhatsAppChannel();

  if (
    WHATSAPP_TARGET_CHANNEL
  ) {

    try {

      const result =
        await currentSock.sendMessage(
          WHATSAPP_TARGET_CHANNEL,
          {
            text:
              cleanText
          }
        );

      console.log(
        "📢 Teks → Saluran WhatsApp"
      );

      console.log(
        "Status:",
        result?.status || "-"
      );

    } catch (error) {

      console.error(
        "❌ Teks → Saluran gagal:",
        errorMessage(error)
      );
    }
  }
}

/* =========================================================
   KIRIM FOTO
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

  const photo =
    getBestTelegramPhoto(
      post
    );

  if (
    !photo?.file_id
  ) {

    throw new Error(
      "file_id foto Telegram tidak ditemukan."
    );
  }

  console.log(
    "🖼️ Foto Telegram ditemukan."
  );

  console.log(
    "Ukuran:",
    `${photo.width || "?"}x${photo.height || "?"}`
  );

  console.log(
    "File size:",
    photo.file_size || "-"
  );

  const buffer =
    await downloadTelegramFile(
      photo.file_id
    );

  /*
   * GRUP
   */

  try {

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
      "✅ Foto → Grup WhatsApp"
    );

  } catch (error) {

    console.error(
      "❌ Foto → Grup gagal:",
      errorMessage(error)
    );
  }

  /*
   * CHANNEL
   */

  await ensureWhatsAppChannel();

  if (
    WHATSAPP_TARGET_CHANNEL
  ) {

    try {

      const result =
        await currentSock.sendMessage(
          WHATSAPP_TARGET_CHANNEL,
          {
            image:
              buffer,

            caption:
              caption || ""
          }
        );

      console.log(
        "📢 Foto → Saluran WhatsApp"
      );

      console.log(
        "Status:",
        result?.status || "-"
      );

      console.log(
        "Message ID:",
        result?.key?.id || "-"
      );

    } catch (error) {

      console.error(
        "❌ Foto → Saluran gagal:",
        errorMessage(error)
      );
    }
  }
}

/* =========================================================
   KIRIM VIDEO
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
    post?.video;

  if (
    !video?.file_id
  ) {

    throw new Error(
      "file_id video Telegram tidak ditemukan."
    );
  }

  console.log(
    "🎥 Video Telegram ditemukan."
  );

  const buffer =
    await downloadTelegramFile(
      video.file_id
    );

  const message = {

    video:
      buffer,

    caption:
      caption || "",

    mimetype:
      video.mime_type ||
      "video/mp4"
  };

  /*
   * GRUP
   */

  try {

    await currentSock.sendMessage(
      WHATSAPP_TARGET_GROUP,
      message
    );

    console.log(
      "✅ Video → Grup WhatsApp"
    );

  } catch (error) {

    console.error(
      "❌ Video → Grup gagal:",
      errorMessage(error)
    );
  }

  /*
   * CHANNEL
   */

  await ensureWhatsAppChannel();

  if (
    WHATSAPP_TARGET_CHANNEL
  ) {

    try {

      const result =
        await currentSock.sendMessage(
          WHATSAPP_TARGET_CHANNEL,
          message
        );

      console.log(
        "📢 Video → Saluran WhatsApp"
      );

      console.log(
        "Status:",
        result?.status || "-"
      );

    } catch (error) {

      console.error(
        "❌ Video → Saluran gagal:",
        errorMessage(error)
      );
    }
  }
}

/* =========================================================
   ALBUM TELEGRAM
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
   * Tunggu semua bagian album masuk.
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

          console.log("");
          console.log(
            "======================================"
          );

          console.log(
            `🖼️ ALBUM TELEGRAM: ${posts.length} item`
          );

          console.log(
            "======================================"
          );

          let captionUsed =
            false;

          for (
            const item
            of posts
          ) {

            if (
              item.photo?.length
            ) {

              await sendPhotoToWhatsApp(
                item,
                captionUsed
                  ? ""
                  : caption
              );

              captionUsed =
                true;

              await sleep(
                800
              );

              continue;
            }

            if (
              item.video
            ) {

              await sendVideoToWhatsApp(
                item,
                captionUsed
                  ? ""
                  : caption
              );

              captionUsed =
                true;

              await sleep(
                800
              );
            }
          }

          console.log(
            "✅ Album selesai."
          );

        } catch (error) {

          console.error(
            "❌ Album gagal:",
            errorMessage(error)
          );
        }

      },
      2200
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

  if (
    chatId !==
    TELEGRAM_SOURCE_CHAT_ID
  ) {

    console.log(
      "⏭️ Channel Telegram lain diabaikan:",
      chatId
    );

    return;
  }

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📨 POST TELEGRAM DITERIMA"
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
    "Message ID:",
    post.message_id || "-"
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
   * ALBUM
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
   * FOTO
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
   * VIDEO
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
   * TEKS
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
    "ℹ️ Jenis posting belum didukung."
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
    "🤖 TELEGRAM POSTING BOT AKTIF"
  );

  console.log(
    "Telegram:",
    TELEGRAM_SOURCE_CHAT_ID
  );

  console.log(
    "Grup WA:",
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
            timeout: 30,

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

        /*
         * Offset langsung dimajukan
         * agar update tidak diproses
         * berulang.
         */

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
            errorMessage(error)
          );
        }
      }

    } catch (error) {

      console.error(
        "❌ Telegram polling error:",
        errorMessage(error)
      );

      await sleep(
        5000
      );
    }
  }
}

/* =========================================================
   WHATSAPP
========================================================= */

async function startBot() {

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "          SSJ POSTING BOT"
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
    "Baileys protocol version:",
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
        "SSJ Posting Bot",
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

  sock.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect,
        qr
      } =
        update;

      /*
       * QR
       */

      if (qr) {

        whatsappConnected =
          false;

        connectionStatus =
          "QR siap dipindai";

        try {

          qrImage =
            await QRCode.toDataURL(
              qr,
              {
                errorCorrectionLevel:
                  "M",

                margin: 3,

                width: 700
              }
            );

          console.log(
            "📱 QR WhatsApp tersedia."
          );

        } catch (error) {

          console.error(
            "❌ QR gagal:",
            errorMessage(error)
          );
        }
      }

      /*
       * CONNECTING
       */

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

      /*
       * OPEN
       */

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

        await resolveWhatsAppChannel();

        console.log("");
        console.log(
          "======================================"
        );

        console.log(
          "✅ WHATSAPP TERHUBUNG"
        );

        console.log(
          "✅ SSJ POSTING BOT AKTIF"
        );

        console.log(
          "✅ TELEGRAM → GRUP WA SIAP"
        );

        if (
          WHATSAPP_TARGET_CHANNEL
        ) {

          console.log(
            "📢 TELEGRAM → SALURAN WA SIAP"
          );

        } else {

          console.log(
            "⚠️ SALURAN WA BELUM TERDETEKSI"
          );
        }

        console.log(
          "======================================"
        );
      }

      /*
       * CLOSE
       */

      if (
        connection ===
        "close"
      ) {

        whatsappConnected =
          false;

        WHATSAPP_TARGET_CHANNEL =
          null;

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

        /*
         * LOGOUT
         */

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          console.log(
            "🚪 Session logout."
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

        /*
         * RESTART REQUIRED
         */

        if (
          statusCode ===
            DisconnectReason.restartRequired ||
          statusCode ===
            515
        ) {

          connectionStatus =
            "Restart koneksi WhatsApp...";

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
   START
========================================================= */

startTelegramPolling()
  .catch(
    (error) => {

      console.error(
        "❌ Telegram gagal:",
        errorMessage(error)
      );
    }
  );

startBot()
  .catch(
    (error) => {

      console.error(
        "❌ WhatsApp gagal:",
        errorMessage(error)
      );

      scheduleReconnect(
        10000
      );
    }
  );
