import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { evaluateMessage } from "./moderation.js";

const logger = P({ level: "silent" });
const handled = new Set();

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getText(msg) {
  const m = msg?.message;

  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

let reconnecting = false;

async function startBot() {
  console.log("");
  console.log("==================================");
  console.log("       SSJ ANTI-SPAM BOT");
  console.log("==================================");
  console.log("");

  /*
   * SESSION WHATSAPP
   */
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  /*
   * AMBIL VERSI BAILEYS
   */
  const { version } =
    await fetchLatestBaileysVersion();

  console.log(
    "Baileys version:",
    version.join(".")
  );

  /*
   * BUAT KONEKSI WHATSAPP
   */
  const sock = makeWASocket({
    version,

    logger,

    auth: state,

    /*
     * QR ditampilkan manual
     */
    printQRInTerminal: false,

    browser: [
      "SSJ AntiSpam Bot",
      "Chrome",
      "1.0.0"
    ],

    markOnlineOnConnect: false,

    syncFullHistory: false,

    generateHighQualityLinkPreview: false,

    connectTimeoutMs: 60000,

    keepAliveIntervalMs: 10000
  });

  /*
   * SIMPAN SESSION
   */
  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /*
   * =====================================
   * QR + STATUS KONEKSI
   * =====================================
   */
  sock.ev.on(
    "connection.update",
    async (update) => {

      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      /*
       * QR BARU
       */
      if (qr) {
        console.log("");
        console.log(
          "=================================="
        );
        console.log(
          "📱 SCAN QR WHATSAPP DI BAWAH INI"
        );
        console.log(
          "=================================="
        );
        console.log("");

        qrcode.generate(
          qr,
          {
            small: true
          }
        );

        console.log("");
        console.log(
          "Buka WhatsApp"
        );
        console.log(
          "> Perangkat tertaut"
        );
        console.log(
          "> Tautkan perangkat"
        );
        console.log(
          "> Scan QR terbaru"
        );
        console.log("");

        console.log(
          "⚠️ Jika QR berubah, gunakan QR paling baru."
        );
        console.log("");
      }

      /*
       * SEDANG CONNECT
       */
      if (connection === "connecting") {
        console.log(
          "⏳ Menghubungkan WhatsApp..."
        );
      }

      /*
       * BERHASIL
       */
      if (connection === "open") {

        reconnecting = false;

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

      /*
       * KONEKSI PUTUS
       */
      if (connection === "close") {

        const statusCode =
          lastDisconnect?.error
            ?.output
            ?.statusCode;

        console.log("");
        console.log(
          "⚠️ Koneksi WhatsApp terputus"
        );

        console.log(
          "Status:",
          statusCode || "unknown"
        );

        /*
         * SESSION LOGOUT
         */
        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          console.log(
            "❌ WhatsApp logout."
          );

          console.log(
            "QR baru diperlukan."
          );

          return;
        }

        /*
         * RECONNECT
         */
        if (!reconnecting) {

          reconnecting = true;

          console.log(
            "🔄 Menghubungkan ulang..."
          );

          await sleep(5000);

          reconnecting = false;

          startBot().catch(
            console.error
          );
        }
      }
    }
  );

  /*
   * =====================================
   * PESAN MASUK
   * =====================================
   */
  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {

      if (type !== "notify") {
        return;
      }

      for (const msg of messages) {

        try {

          /*
           * TIDAK ADA PESAN
           */
          if (!msg?.message) {
            continue;
          }

          /*
           * ABAIKAN PESAN BOT SENDIRI
           */
          if (msg.key.fromMe) {
            continue;
          }

          /*
           * CEGAH PESAN DIPROSES 2X
           */
          const messageId =
            msg.key.id;

          if (
            messageId &&
            handled.has(messageId)
          ) {
            continue;
          }

          if (messageId) {

            handled.add(messageId);

            setTimeout(() => {

              handled.delete(
                messageId
              );

            }, 60000);
          }

          /*
           * AMBIL ID CHAT
           */
          const jid =
            msg.key.remoteJid;

          /*
           * HANYA GRUP
           */
          if (
            !jid ||
            !jid.endsWith("@g.us")
          ) {
            continue;
          }

          /*
           * AMBIL TEKS PESAN
           */
          const text =
            getText(msg);

          /*
           * JALANKAN MODERASI
           */
          const result =
            await evaluateMessage({
              sock,
              msg,
              text,
              jid,
              config
            });

          /*
           * TIDAK ADA PELANGGARAN
           */
          if (!result) {
            continue;
          }

          /*
           * =================================
           * HAPUS PESAN
           * =================================
           */
          if (result.delete) {

            try {

              await sock.sendMessage(
                jid,
                {
                  delete: msg.key
                }
              );

              console.log(
                "🗑️ Pesan pelanggaran dihapus"
              );

            } catch (error) {

              console.error(
                "❌ Gagal menghapus pesan:",
                error?.message || error
              );
            }
          }

          /*
           * =================================
           * KIRIM PERINGATAN
           * =================================
           */
          if (result.reply) {

            try {

              await sock.sendMessage(
                jid,
                {
                  text: result.reply
                },
                {
                  quoted: msg
                }
              );

            } catch (error) {

              console.error(
                "❌ Gagal mengirim peringatan:",
                error?.message || error
              );
            }
          }

          /*
           * =================================
           * KELUARKAN MEMBER
           * =================================
           */
          if (
            result.kick &&
            msg.key.participant
          ) {

            try {

              await sock.groupParticipantsUpdate(
                jid,
                [
                  msg.key.participant
                ],
                "remove"
              );

              console.log(
                "🚫 Member pelanggar dikeluarkan"
              );

            } catch (error) {

              console.error(
                "❌ Gagal mengeluarkan member:",
                error?.message || error
              );
            }
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

/*
 * =====================================
 * ERROR HANDLER
 * =====================================
 */

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

/*
 * MULAI BOT
 */
startBot().catch((error) => {

  console.error(
    "❌ Bot gagal dijalankan:",
    error
  );
});
