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

function getText(msg) {
  const m = msg?.message;
  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

function numberFromJid(jid = "") {
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

async function start() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } =
    await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,

    printQRInTerminal: false,

    browser: [
      "SSJ Anti-Spam Bot",
      "Chrome",
      "1.0.0"
    ],

    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on(
    "connection.update",
    ({
      connection,
      lastDisconnect,
      qr
    }) => {

      if (qr) {
        console.clear();

        console.log(
          "\n=== SSJ ANTI-SPAM BOT ==="
        );

        console.log(
          "Scan QR menggunakan WhatsApp Maisarah Cs:"
        );

        console.log(
          "WhatsApp > Perangkat tertaut > Tautkan perangkat\n"
        );

        qrcode.generate(qr, {
          small: true
        });
      }

      if (connection === "open") {
        console.log(
          "✅ WhatsApp terhubung."
        );

        console.log(
          "✅ SSJ Anti-Spam Bot aktif."
        );
      }

      if (connection === "close") {

        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode;

        const loggedOut =
          statusCode ===
          DisconnectReason.loggedOut;

        if (loggedOut) {
          console.log(
            "❌ WhatsApp logout."
          );

          console.log(
            "Hapus folder auth lalu login ulang."
          );

        } else {

          console.log(
            "⚠️ Koneksi terputus."
          );

          console.log(
            "Menghubungkan ulang..."
          );

          setTimeout(start, 3000);
        }
      }
    }
  );

  sock.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {

      if (type !== "notify") return;

      for (const msg of messages) {

        try {

          const groupJid =
            msg.key?.remoteJid;

          // Hanya pesan grup
          if (
            !groupJid?.endsWith("@g.us")
          ) {
            continue;
          }

          // Jangan proses pesan bot sendiri
          if (msg.key.fromMe) {
            continue;
          }

          if (!msg.message) {
            continue;
          }

          // Hindari pesan diproses dua kali
          const uniqueId =
            `${groupJid}:${msg.key.id}`;

          if (
            handled.has(uniqueId)
          ) {
            continue;
          }

          handled.add(uniqueId);

          setTimeout(
            () =>
              handled.delete(
                uniqueId
              ),
            10 * 60 * 1000
          );

          const metadata =
            await sock.groupMetadata(
              groupJid
            );

          const groupName =
            (
              metadata.subject || ""
            )
              .trim()
              .toLowerCase();

          // Batasi ke grup SSJ
          if (
            config.targetGroupName &&
            groupName !==
              config.targetGroupName
          ) {
            continue;
          }

          const senderJid =
            msg.key.participant;

          if (!senderJid) {
            continue;
          }

          const senderNumber =
            numberFromJid(
              senderJid
            );

          // Nomor whitelist
          if (
            config.whitelist.has(
              senderNumber
            )
          ) {
            continue;
          }

          // Cari status anggota
          const participant =
            metadata.participants.find(
              (p) =>
                p.id === senderJid
            );

          const senderIsAdmin =
            participant?.admin ===
              "admin" ||
            participant?.admin ===
              "superadmin";

          // Admin tidak pernah di-ban
          if (senderIsAdmin) {
            continue;
          }

          const text =
            getText(msg);

          const result =
            evaluateMessage(text);

          if (
            !result.violation
          ) {
            continue;
          }

          console.log(
            `🚫 Pelanggaran:
${senderNumber}
Alasan: ${result.reason}`
          );

          if (!config.autoKick) {
            continue;
          }

          // Keluarkan anggota
          await sock
            .groupParticipantsUpdate(
              groupJid,
              [senderJid],
              "remove"
            );

          // Kirim pemberitahuan
          if (
            config.sendNotice
          ) {

            await sock.sendMessage(
              groupJid,
              {
                text:
`⛔ *SSJ AUTO MODERATION*

Seorang anggota telah dikeluarkan otomatis.

Alasan:
${result.reason}

Mohon menjaga komunikasi dan mematuhi aturan grup.`
              }
            );
          }

        } catch (err) {

          console.error(
            "Gagal memproses pesan:",
            err?.message || err
          );
        }
      }
    }
  );
}

start().catch((err) => {

  console.error(
    "Bot gagal dijalankan:",
    err
  );

  process.exit(1);
});
