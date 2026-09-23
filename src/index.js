import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import P from "pino";
import { config } from "./config.js";
import { evaluateMessage } from "./moderation.js";

const logger = P({ level: "silent" });
const handled = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function startBot() {
  console.log("==================================");
  console.log("      SSJ ANTI-SPAM BOT");
  console.log("==================================");

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const { version } =
    await fetchLatestBaileysVersion();

  console.log("Baileys version:", version.join("."));

  const sock = makeWASocket({
    version,
    logger,
    auth: state,

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
   * ==========================================
   * PAIRING CODE
   * ==========================================
   *
   * Railway Variables:
   *
   * PHONE_NUMBER=628xxxxxxxxxx
   *
   * Contoh:
   * 081234567890
   * menjadi:
   * 6281234567890
   *
   */

  if (!state.creds.registered) {
    const phoneNumber =
      normalizePhoneNumber(process.env.PHONE_NUMBER);

    if (!phoneNumber) {
      console.log("");
      console.log("❌ PHONE_NUMBER belum diisi.");
      console.log("");
      console.log(
        "Buka Railway > Variables lalu tambahkan:"
      );
      console.log("");
      console.log("PHONE_NUMBER=628xxxxxxxxxx");
      console.log("");

      return;
    }

    console.log("");
    console.log(
      "📱 Nomor WhatsApp:",
      phoneNumber
    );

    console.log(
      "⏳ Meminta pairing code..."
    );

    /*
     * Tunggu socket siap sebelum
     * meminta pairing code.
     */
    await sleep(3000);

    try {
      const code =
        await sock.requestPairingCode(
          phoneNumber
        );

      const formattedCode =
        code?.match(/.{1,4}/g)?.join("-") ||
        code;

      console.log("");
      console.log(
        "=================================="
      );

      console.log(
        "🔐 PAIRING CODE:"
      );

      console.log("");
      console.log(formattedCode);
      console.log("");

      console.log(
        "=================================="
      );

      console.log(
        "Buka WhatsApp > Perangkat tertaut"
      );

      console.log(
        "> Tautkan perangkat"
      );

      console.log(
        "> Tautkan dengan nomor telepon"
      );

      console.log(
        "> Masukkan kode di atas."
      );

      console.log(
        "=================================="
      );
      console.log("");

    } catch (error) {
      console.error(
        "❌ Gagal membuat pairing code:",
        error
      );
    }
  }

  /*
   * SIMPAN SESSION
   */

  sock.ev.on(
    "creds.update",
    saveCreds
  );

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
        console.log("");
        console.log(
          "✅ WHATSAPP TERHUBUNG"
        );
        console.log(
          "✅ SSJ Anti-Spam Bot aktif"
        );
        console.log("");
      }

      if (connection === "close") {

        const statusCode =
          lastDisconnect?.error
            ?.output
            ?.statusCode;

        const loggedOut =
          statusCode ===
          DisconnectReason.loggedOut;

        if (loggedOut) {

          console.log(
            "❌ WhatsApp logout."
          );

          console.log(
            "Hapus session auth_info lalu pairing ulang."
          );

          return;
        }

        console.log(
          "⚠️ Koneksi terputus."
        );

        console.log(
          "🔄 Menghubungkan ulang..."
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

          if (msg.key.fromMe) {
            continue;
          }

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
           * Hanya proses grup WhatsApp
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
           * Jalankan sistem moderasi
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
                "🗑️ Pesan spam dihapus"
              );

            } catch (error) {

              console.error(
                "Gagal menghapus pesan:",
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
                "Gagal mengirim peringatan:",
                error
              );
            }
          }

          /*
           * KICK MEMBER
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
                "🚫 Member spam dikeluarkan"
              );

            } catch (error) {

              console.error(
                "Gagal mengeluarkan member:",
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
 * Mencegah Railway langsung mati
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
