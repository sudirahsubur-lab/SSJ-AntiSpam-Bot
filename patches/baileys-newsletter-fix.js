/**
 * SSJ - Baileys Newsletter Media Fix
 *
 * Target:
 * @whiskeysockets/baileys 7.0.0-rc11
 *
 * Memperbaiki upload foto/video ke WhatsApp Channel.
 */

import {
  readFileSync,
  writeFileSync
} from "fs";

import {
  join,
  dirname
} from "path";

import {
  fileURLToPath
} from "url";

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  dirname(
    __filename
  );

const BAILEYS_LIB =
  join(
    __dirname,
    "..",
    "node_modules",
    "@whiskeysockets",
    "baileys",
    "lib"
  );

let patched = 0;
let skipped = 0;
let failed = 0;

/* =========================================================
   PATCH HELPER
========================================================= */

function patchFile(
  relativePath,
  description,
  checkStr,
  originalStr,
  replacementStr
) {

  const filePath =
    join(
      BAILEYS_LIB,
      relativePath
    );

  let content;

  try {

    content =
      readFileSync(
        filePath,
        "utf8"
      );

  } catch (error) {

    console.error(
      `[NewsletterFix] ERROR membaca ${relativePath}:`,
      error.message
    );

    failed++;

    return;
  }

  /*
   * SUDAH DIPATCH
   */

  if (
    content.includes(
      checkStr
    )
  ) {

    console.log(
      `[NewsletterFix] SKIP: ${description}`
    );

    skipped++;

    return;
  }

  /*
   * PATTERN TIDAK DITEMUKAN
   */

  if (
    !content.includes(
      originalStr
    )
  ) {

    console.error(
      `[NewsletterFix] ERROR: Pattern tidak ditemukan`
    );

    console.error(
      `[NewsletterFix] File: ${relativePath}`
    );

    console.error(
      `[NewsletterFix] Patch: ${description}`
    );

    failed++;

    return;
  }

  /*
   * PATCH
   */

  content =
    content.replace(
      originalStr,
      replacementStr
    );

  writeFileSync(
    filePath,
    content,
    "utf8"
  );

  console.log(
    `[NewsletterFix] ✅ ${description}`
  );

  patched++;
}

/* =========================================================
   START
========================================================= */

console.log("");
console.log(
  "============================================"
);
console.log(
  "📢 SSJ WHATSAPP CHANNEL MEDIA FIX"
);
console.log(
  "============================================"
);

/* =========================================================
   PATCH 1
   NEWSLETTER MEDIA PATH
========================================================= */

patchFile(

  "Defaults/index.js",

  "Tambah NEWSLETTER_MEDIA_PATH_MAP",

  "NEWSLETTER_MEDIA_PATH_MAP",

  `export const MEDIA_PATH_MAP = {
    image: '/mms/image',
    video: '/mms/video',
    document: '/mms/document',
    audio: '/mms/audio',
    sticker: '/mms/image',
    'thumbnail-link': '/mms/image',
    'product-catalog-image': '/product/image',
    'md-app-state': '',
    'md-msg-hist': '/mms/md-app-state',
    'biz-cover-photo': '/pps/biz-cover-photo'
};`,

  `export const MEDIA_PATH_MAP = {
    image: '/mms/image',
    video: '/mms/video',
    document: '/mms/document',
    audio: '/mms/audio',
    sticker: '/mms/image',
    'thumbnail-link': '/mms/image',
    'product-catalog-image': '/product/image',
    'md-app-state': '',
    'md-msg-hist': '/mms/md-app-state',
    'biz-cover-photo': '/pps/biz-cover-photo'
};

export const NEWSLETTER_MEDIA_PATH_MAP = {
    image: '/newsletter/newsletter-image',
    video: '/newsletter/newsletter-video',
    document: '/newsletter/newsletter-document',
    audio: '/newsletter/newsletter-audio',
    sticker: '/newsletter/newsletter-image',
    'thumbnail-link': '/newsletter/newsletter-image'
};`
);

/* =========================================================
   PATCH 2A
   IMPORT NEWSLETTER PATH
========================================================= */

patchFile(

  "Utils/messages-media.js",

  "Import NEWSLETTER_MEDIA_PATH_MAP",

  "NEWSLETTER_MEDIA_PATH_MAP } from",

  `import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP } from '../Defaults/index.js';`,

  `import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';`
);

/* =========================================================
   BERSIHKAN IMPORT LAMA
========================================================= */

try {

  const file =
    join(
      BAILEYS_LIB,
      "Utils/messages-media.js"
    );

  let content =
    readFileSync(
      file,
      "utf8"
    );

  const oldImport =
    "import { NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';";

  if (
    content.includes(
      oldImport
    ) &&
    content.indexOf(
      oldImport
    ) > 500
  ) {

    content =
      content.replace(
        oldImport + "\n",
        ""
      );

    writeFileSync(
      file,
      content,
      "utf8"
    );

    console.log(
      "[NewsletterFix] ✅ Import patch lama dibersihkan"
    );
  }

} catch (error) {

  console.log(
    "[NewsletterFix] Tidak ada import lama."
  );
}

/* =========================================================
   PATCH 2B
   TAMBAH NEWSLETTER FLAG KE UPLOAD
========================================================= */

patchFile(

  "Utils/messages-media.js",

  "Tambahkan newsletter flag ke uploader",

  "newsletter ? NEWSLETTER_MEDIA_PATH_MAP",

  `export const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {`,

  `export const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {`
);

/* =========================================================
   PATCH 2C
   NEWSLETTER UPLOAD URL
========================================================= */

patchFile(

  "Utils/messages-media.js",

  "Gunakan upload path khusus Newsletter",

  "newsletter ? NEWSLETTER_MEDIA_PATH_MAP",

  `const url = \`https://\${hostname}\${MEDIA_PATH_MAP[mediaType]}/\${fileEncSha256B64}?auth=\${auth}&token=\${fileEncSha256B64}\`;`,

  `const mediaPath =
                    newsletter
                        ? NEWSLETTER_MEDIA_PATH_MAP[mediaType]
                        : MEDIA_PATH_MAP[mediaType];

                const url =
                    \`https://\${hostname}\${mediaPath}/\${fileEncSha256B64}?auth=\${auth}&token=\${fileEncSha256B64}\${newsletter ? '&server_thumb_gen=1' : ''}\`;`
);

/* =========================================================
   PATCH 2D
   THUMBNAIL INFO
========================================================= */

patchFile(

  "Utils/messages-media.js",

  "Ambil thumbnail Newsletter dari server",

  "thumbnail_direct_path",

  `if (result?.url || result?.direct_path) {
                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,
                        fbid: result.fbid,
                        ts: result.ts
                    };`,

  `if (result?.url || result?.direct_path) {
                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,
                        fbid: result.fbid,
                        ts: result.ts
                    };

                    if (
                        newsletter &&
                        result.thumbnail_info
                    ) {
                        urls.thumbnailDirectPath =
                            result.thumbnail_info.thumbnail_direct_path;

                        urls.thumbnailSha256 =
                            result.thumbnail_info.thumbnail_sha256;
                    }`
);

/* =========================================================
   PATCH 3A
   PREPARE WA MESSAGE
========================================================= */

patchFile(

  "Utils/messages.js",

  "Kirim newsletter=true saat upload",

  "newsletter: true",

  `const { mediaUrl, directPath } = await options.upload(filePath, {
                fileEncSha256B64: fileSha256B64,
                mediaType: mediaType,
                timeoutMs: options.mediaUploadTimeoutMs
            });`,

  `const uploadResult =
                await options.upload(
                    filePath,
                    {
                        fileEncSha256B64:
                            fileSha256B64,

                        mediaType:
                            mediaType,

                        timeoutMs:
                            options.mediaUploadTimeoutMs,

                        newsletter:
                            true
                    }
                );

            const mediaUrl =
                uploadResult.mediaUrl;

            const directPath =
                uploadResult.directPath;

            const thumbnailDirectPath =
                uploadResult.thumbnailDirectPath;

            const thumbnailSha256 =
                uploadResult.thumbnailSha256;`
);

/* =========================================================
   PATCH 3B
   PROTO MEDIA NEWSLETTER
========================================================= */

patchFile(

  "Utils/messages.js",

  "Perbaiki proto media Newsletter",

  "url: null,",

  `const obj = WAProto.Message.fromObject({
                // todo: add more support here
                [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject({
                    url: mediaUrl,
                    directPath,
                    fileSha256,
                    fileLength,
                    ...uploadData,
                    media: undefined
                })
            });`,

  `const obj = WAProto.Message.fromObject({
                // todo: add more support here
                [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject({
                    url: null,
                    directPath,
                    fileSha256,
                    fileEncSha256: fileSha256,
                    fileLength,

                    ...(thumbnailDirectPath && {
                        thumbnailDirectPath
                    }),

                    ...(thumbnailSha256 && {
                        thumbnailSha256
                    }),

                    ...uploadData,
                    media: undefined
                })
            });`
);

/* =========================================================
   PATCH 4
   MEDIATYPE NEWSLETTER STANZA
========================================================= */

patchFile(

  "Socket/messages-send.js",

  "Tambahkan mediatype ke Newsletter stanza",

  "mediatype: mediaType",

  `binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: {},
                    content: bytes
                });`,

  `binaryNodeContent.push({
                    tag: 'plaintext',

                    attrs:
                        mediaType
                            ? {
                                mediatype:
                                    mediaType
                            }
                            : {},

                    content:
                        bytes
                });`
);

/* =========================================================
   HASIL
========================================================= */

console.log("");
console.log(
  "============================================"
);

console.log(
  "📢 NEWSLETTER MEDIA FIX SELESAI"
);

console.log(
  `✅ Patched : ${patched}`
);

console.log(
  `ℹ️ Skipped : ${skipped}`
);

console.log(
  `❌ Failed  : ${failed}`
);

console.log(
  "============================================"
);
console.log("");

if (
  failed > 0
) {

  console.error(
    "❌ Ada patch yang gagal. Build dihentikan agar bot tidak memakai patch setengah jadi."
  );

  process.exit(1);
}

console.log(
  "✅ Semua patch Newsletter berhasil diterapkan."
);
