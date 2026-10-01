import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const BAILEYS_LIB = path.join(
  ROOT,
  "node_modules",
  "@whiskeysockets",
  "baileys",
  "lib"
);

const MESSAGES_FILE = path.join(
  BAILEYS_LIB,
  "Utils",
  "messages.js"
);

console.log("");
console.log("==========================================");
console.log("🔎 SSJ BAILEYS NEWSLETTER DIAGNOSTIC");
console.log("==========================================");
console.log("");

if (!fs.existsSync(MESSAGES_FILE)) {
  console.error("❌ Utils/messages.js tidak ditemukan:");
  console.error(MESSAGES_FILE);
  process.exit(1);
}

const code = fs.readFileSync(
  MESSAGES_FILE,
  "utf8"
);

console.log(
  "✅ Utils/messages.js ditemukan."
);

console.log(
  "📄 Panjang file:",
  code.length,
  "karakter"
);

/* =========================================================
   HELPER
========================================================= */

function printAround(
  title,
  search,
  before = 1800,
  after = 3500
) {
  console.log("");
  console.log("==========================================");
  console.log(`🔎 ${title}`);
  console.log("==========================================");

  const index = code.indexOf(search);

  if (index === -1) {
    console.log(
      `❌ Tidak ditemukan: ${search}`
    );
    return false;
  }

  console.log(
    `✅ Ditemukan pada index ${index}`
  );

  const start = Math.max(
    0,
    index - before
  );

  const end = Math.min(
    code.length,
    index + search.length + after
  );

  console.log("");
  console.log(
    code.slice(
      start,
      end
    )
  );

  console.log("");
  console.log(
    "------------- END SECTION -------------"
  );

  return true;
}

/* =========================================================
   CARI prepareWAMessageMedia
========================================================= */

printAround(
  "SECTION prepareWAMessageMedia",
  "prepareWAMessageMedia",
  1000,
  7000
);

/* =========================================================
   CARI options.upload
========================================================= */

printAround(
  "SECTION options.upload",
  "options.upload",
  2500,
  5000
);

/* =========================================================
   CARI upload(
========================================================= */

printAround(
  "SECTION upload(",
  "upload(",
  2500,
  5000
);

/* =========================================================
   CARI mediaUrl
========================================================= */

printAround(
  "SECTION mediaUrl",
  "mediaUrl",
  2500,
  5000
);

/* =========================================================
   CARI directPath
========================================================= */

printAround(
  "SECTION directPath",
  "directPath",
  2500,
  5000
);

/* =========================================================
   CARI MessageTypeProto
========================================================= */

printAround(
  "SECTION MessageTypeProto",
  "MessageTypeProto",
  2500,
  6000
);

/* =========================================================
   CARI fromObject
========================================================= */

printAround(
  "SECTION fromObject",
  "fromObject",
  2500,
  6000
);

/* =========================================================
   CARI fileSha256
========================================================= */

printAround(
  "SECTION fileSha256",
  "fileSha256",
  2500,
  6000
);

/* =========================================================
   CARI mediaType
========================================================= */

printAround(
  "SECTION mediaType",
  "mediaType",
  2500,
  6000
);

/* =========================================================
   SELESAI
========================================================= */

console.log("");
console.log("==========================================");
console.log("✅ DIAGNOSTIC SELESAI");
console.log("==========================================");
console.log("");
console.log(
  "Salin bagian Build Logs mulai dari:"
);
console.log(
  "🔎 SECTION prepareWAMessageMedia"
);
console.log(
  "sampai:"
);
console.log(
  "✅ DIAGNOSTIC SELESAI"
);
console.log("");

/*
 * PENTING:
 *
 * Script diagnostic sengaja exit 0.
 * Jadi npm install tidak dianggap gagal
 * hanya karena kita sedang membaca source.
 */

process.exit(0);
