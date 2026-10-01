import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const BAILEYS = path.join(
  ROOT,
  "node_modules",
  "@whiskeysockets",
  "baileys",
  "lib"
);

function patchFile(relativePath, transform) {
  const file = path.join(
    BAILEYS,
    relativePath
  );

  if (!fs.existsSync(file)) {
    throw new Error(
      `File Baileys tidak ditemukan: ${file}`
    );
  }

  const original = fs.readFileSync(
    file,
    "utf8"
  );

  const modified = transform(original);

  if (modified === original) {
    console.log(
      `ℹ️ Tidak ada perubahan: ${relativePath}`
    );
    return;
  }

  fs.writeFileSync(
    file,
    modified,
    "utf8"
  );

  console.log(
    `✅ Patched: ${relativePath}`
  );
}

console.log("");
console.log(
  "======================================"
);
console.log(
  "📢 SSJ BAILEYS NEWSLETTER MEDIA FIX"
);
console.log(
  "======================================"
);

/* =========================================================
   PATCH DEFAULTS
========================================================= */

patchFile(
  "Defaults/index.js",
  (code) => {

    if (
      code.includes(
        "NEWSLETTER_MEDIA_PATH_MAP"
      )
    ) {
      console.log(
        "✅ NEWSLETTER_MEDIA_PATH_MAP sudah tersedia."
      );

      return code;
    }

    const marker =
      "export const MEDIA_PATH_MAP = {";

    const start =
      code.indexOf(marker);

    if (start === -1) {
      throw new Error(
        "MEDIA_PATH_MAP tidak ditemukan."
      );
    }

    const end =
      code.indexOf(
        "\n};",
        start
      );

    if (end === -1) {
      throw new Error(
        "Akhir MEDIA_PATH_MAP tidak ditemukan."
      );
    }

    const insertAt = end + 3;

    const addition = `

/*
 * SSJ PATCH:
 * Media path khusus WhatsApp Channel.
 */
export const NEWSLETTER_MEDIA_PATH_MAP = {
  image: '/newsletter/newsletter-image',
  video: '/newsletter/newsletter-video',
  document: '/newsletter/newsletter-document',
  audio: '/newsletter/newsletter-audio',
  sticker: '/newsletter/newsletter-image',
  'thumbnail-link': '/newsletter/newsletter-image'
};
`;

    return (
      code.slice(0, insertAt) +
      addition +
      code.slice(insertAt)
    );
  }
);

/* =========================================================
   PATCH MEDIA UPLOAD
========================================================= */

patchFile(
  "Utils/messages-media.js",
  (code) => {

    if (
      !code.includes(
        "NEWSLETTER_MEDIA_PATH_MAP"
      )
    ) {
      code = code.replace(
        /import\s*\{([^}]*MEDIA_PATH_MAP[^}]*)\}\s*from\s*['"]\.\.\/Defaults\/index\.js['"];/,
        (full, imports) => {
          return (
            "import {" +
            imports +
            ", NEWSLETTER_MEDIA_PATH_MAP" +
            "} from '../Defaults/index.js';"
          );
        }
      );
    }

    const normalPath =
      "MEDIA_PATH_MAP[mediaType]";

    if (
      code.includes(normalPath) &&
      !code.includes(
        "options?.newsletter"
      )
    ) {
      code = code.replace(
        normalPath,
        "(options?.newsletter ? NEWSLETTER_MEDIA_PATH_MAP[mediaType] : MEDIA_PATH_MAP[mediaType])"
      );
    }

    if (
      !code.includes(
        "server_thumb_gen"
      )
    ) {
      code = code.replace(
        /const\s+uploadPath\s*=\s*([^;]+);/,
        (full) => {
          return `${full}

if (
  options?.newsletter &&
  uploadPath
) {
  const separator =
    uploadPath.includes("?")
      ? "&"
      : "?";

  uploadPath +=
    separator +
    "server_thumb_gen=1";
}`;
        }
      );
    }

    return code;
  }
);

console.log("");
console.log(
  "======================================"
);
console.log(
  "✅ NEWSLETTER MEDIA PATCH SELESAI"
);
console.log(
  "======================================"
);
