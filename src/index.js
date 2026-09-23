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

async function startBot() {
  console.log("==================================");
  console.log("       SSJ ANTI-SPAM BOT");
  console.log("==================================");

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const { version } =
    await fetchLatestBaileysVersion();

  console.log(
    "Baileys version:",
    version.join(".")
  );

  const sock = makeWASocket({
    version,
    logger,
    auth: state,

    /*
     * QR akan kita tampilkan sendiri
     * melalui connection.update
     */
    printQRInTerminal: false,

    browser: [
      "SSJ AntiSpam Bot",
      "Chrome",
      "1.0.0"
    ],

    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false
  });

  /*
   * SIMPAN SESSION
   */
  sock.ev.on(
    "creds.update",
    saveCreds
  );

  /*
   * STATUS KONEKSI + QR
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
       * QR BARU DARI WHATSAPP
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
          "Buka WhatsApp:"
        );
        console.log(
          "Perangkat tertaut"
        );
        console.log(
          "> Tautkan perangkat"
        );
        console.log(
          "> Scan QR di atas"
        );
        console.log("");
      }

      if (connection === "connecting") {
        console.log(
          "⏳ Menghubungkan WhatsApp..."
        );
      }

      if (connection === "open") {
        console.log("");
        console.log(
          "=================================="
        );
        console.log(
          "✅ WHATSAPP TERHUBUNG"
        );
        console.log(
          "✅ SSJ Anti-Spam Bot AKTIF"
        );
        console.log(
          "=================================="
        );
        console.log("");
      }

      if (connection === "close") {

        const statusCode =
          lastDisconnect?.error
            ?.output
            ?.statusCode;

        console.log(
          "⚠️ Koneksi WhatsApp terputus."
        );

        console.log(
          "Status:",
          statusCode || "unknown"
        );

        const loggedOut =
          statusCode ===
          DisconnectReason.loggedOut;

        if (loggedOut) {
          console.log("");
          console.log(
            "❌ SESSION WHATSAPP LOGOUT"
          );
          console.log(
            "Bot harus ditautkan ulang."
          );
          console.log("");
          return;
        }

        console.log(
          "🔄 Mencoba menghubungkan kembali..."
        );

        await sleep(3000);

        startBot().catch(
          console.error
        );
      }
    }
  );

  /*
   * ==========================================
   * PESAN MASUK
   * ==========================================
   */
  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {

      if (type !== "notify") {
        return;
      }

      for (const msg of messages) {

        try {

          if (!msg?.message) {
            continue;
          }

          /*
           * Abaikan pesan dari bot sendiri
           */
          if (msg.key.fromMe) {
            continue;
          }

          /*
           * Cegah pesan diproses dua kali
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

          const jid =
            msg.key.remoteJid;

          /*
           * Hanya moderasi grup
           */
          if (
            !jid ||
            !jid.endsWith("@g.us")
          ) {
            continue;
          }

          const text =
            getText(msg);

          /*
           * CEK MODERASI
           */
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

          /*
           * HAPUS PESAN
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
                error
              );
            }
          }

          /*
           * KIRIM PERINGATAN
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
                error
              );
            }
          }

          /*
           * KELUARKAN MEMBER
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
                error
              );
            }
          }

        } catch (error) {

          console.error(
            "❌ Error memproses pesan:",
            error
          );
        }
      }
    }
  );

  return sock;
}

/*
 * JAGA PROSES BOT
 */
process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

startBot().catch((error) => {
  console.error(
    "❌ Bot gagal dijalankan:",
    error
  );
});
