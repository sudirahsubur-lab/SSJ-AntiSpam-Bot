import makeWASocket, {
  DisconnectReason,
  Browsers,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
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

function normalizePhoneNumber(value = "") {
  let phone = String(value).replace(/\D/g, "");

  if (phone.startsWith("0")) {
    phone = "62" + phone.slice(1);
  }

  return phone;
}

let restarting = false;

async function startBot() {
  console.log("==================================");
  console.log("       SSJ ANTI-SPAM BOT");
  console.log("==================================");

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    logger,
    auth: state,

    // Pairing code harus false
    printQRInTerminal: false,

    // Gunakan browser profile standar
    browser: Browsers.macOS("Google Chrome"),

    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,

    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  /*
   * Simpan session WhatsApp
   */
  sock.ev.on("creds.update", saveCreds);

  /*
   * PAIRING CODE
   */
  if (!state.creds.registered) {
    const phoneNumber =
      normalizePhoneNumber(
        process.env.PHONE_NUMBER
      );

    if (!phoneNumber) {
      console.log("");
      console.log(
        "❌ PHONE_NUMBER belum ada di Railway."
      );
      console.log(
        "Contoh: PHONE_NUMBER=6281234567890"
      );
      return;
    }

    console.log("");
    console.log(
      "📱 Nomor WhatsApp:",
      phoneNumber
    );

    console.log(
      "⏳ Menunggu koneksi WhatsApp..."
    );

    /*
     * Tunggu koneksi awal sebelum
     * meminta pairing code
     */
    await sleep(5000);

    try {
      console.log(
        "🔐 Meminta pairing code..."
      );

      const code =
        await sock.requestPairingCode(
          phoneNumber
        );

      const formatted =
        code?.match(/.{1,4}/g)?.join("-") ||
        code;

      console.log("");
      console.log(
        "=================================="
      );
      console.log(
        "       PAIRING CODE WHATSAPP"
      );
      console.log(
        "=================================="
      );
      console.log("");
      console.log(formatted);
      console.log("");
      console.log(
        "Masukkan melalui:"
      );
      console.log(
        "WhatsApp > Perangkat tertaut"
      );
      console.log(
        "> Tautkan perangkat"
      );
      console.log(
        "> Tautkan dengan nomor telepon"
      );
      console.log("");
      console.log(
        "=================================="
      );

    } catch (error) {
      console.error(
        "❌ Pairing code gagal:",
        error?.message || error
      );
    }
  }

  /*
   * STATUS KONEKSI
   */
  sock.ev.on(
    "connection.update",
    async (update) => {
      const {
        connection,
        lastDisconnect
      } = update;

      if (connection === "connecting") {
        console.log(
          "⏳ Menghubungkan WhatsApp..."
        );
      }

      if (connection === "open") {
        restarting = false;

        console.log("");
        console.log(
          "=================================="
        );
        console.log(
          "✅ WHATSAPP BERHASIL TERHUBUNG"
        );
        console.log(
          "✅ SSJ ANTI-SPAM BOT AKTIF"
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
          "⚠️ Koneksi ditutup. Status:",
          statusCode || "unknown"
        );

        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          console.log(
            "❌ Session logout. Pairing ulang diperlukan."
          );
          return;
        }

        if (!restarting) {
          restarting = true;

          console.log(
            "🔄 Menghubungkan kembali..."
          );

          await sleep(5000);

          restarting = false;

          startBot().catch(
            console.error
          );
        }
      }
    }
  );

  /*
   * PESAN MASUK
   */
  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        try {
          if (!msg?.message) continue;
          if (msg.key.fromMe) continue;

          const messageId = msg.key.id;

          if (
            messageId &&
            handled.has(messageId)
          ) {
            continue;
          }

          if (messageId) {
            handled.add(messageId);

            setTimeout(() => {
              handled.delete(messageId);
            }, 60000);
          }

          const jid =
            msg.key.remoteJid;

          // Hanya grup WhatsApp
          if (
            !jid ||
            !jid.endsWith("@g.us")
          ) {
            continue;
          }

          const text = getText(msg);

          const result =
            await evaluateMessage({
              sock,
              msg,
              text,
              jid,
              config
            });

          if (!result) continue;

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
                "❌ Gagal hapus pesan:",
                error
              );
            }
          }

          /*
           * PERINGATAN
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
                "❌ Gagal kirim peringatan:",
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
                [msg.key.participant],
                "remove"
              );

              console.log(
                "🚫 Member dikeluarkan"
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

startBot().catch(console.error);
