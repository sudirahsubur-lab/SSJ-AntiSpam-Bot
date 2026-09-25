import {
  abusiveWords,
  scamAccusationPatterns,
  protectedQuestionPatterns
} from "./config.js";

/*
 * ==========================================
 * NORMALISASI TEKS
 * ==========================================
 */

function normalize(value = "") {
  /*
   * Mendukung pemanggilan:
   *
   * evaluateMessage("teks")
   *
   * maupun:
   *
   * evaluateMessage({
   *   text: "teks"
   * })
   */

  let text = value;

  if (
    value &&
    typeof value === "object"
  ) {
    text = value.text ?? "";
  }

  if (
    typeof text !== "string"
  ) {
    text = String(
      text ?? ""
    );
  }

  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

/*
 * ==========================================
 * CEK KATA UTUH
 * ==========================================
 */

function containsWholeWord(
  text,
  word
) {

  if (
    !text ||
    !word
  ) {
    return false;
  }

  const escaped =
    String(word).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  return new RegExp(
    `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
    "i"
  ).test(text);
}

/*
 * ==========================================
 * HASIL AMAN
 * ==========================================
 */

function safeResult(
  extra = {}
) {
  return {
    violation: false,
    delete: false,
    kick: false,
    reply: null,
    ...extra
  };
}

/*
 * ==========================================
 * HASIL PELANGGARAN
 * ==========================================
 */

function violationResult(
  reason,
  matched
) {
  return {
    violation: true,

    /*
     * Hapus pesan
     */
    delete: true,

    /*
     * Keluarkan member
     */
    kick: true,

    /*
     * Tidak ada pemberitahuan
     * di grup.
     */
    reply: null,

    reason,
    matched
  };
}

/*
 * ==========================================
 * MODERASI
 * ==========================================
 */

export function evaluateMessage(
  input
) {

  const text =
    normalize(input);

  /*
   * PESAN KOSONG
   */
  if (!text) {
    return safeResult();
  }

  /*
   * ========================================
   * 1. KATA KASAR
   * ========================================
   *
   * Contoh:
   *
   * anjing
   * babi
   * bangsat
   * kontol
   * dll sesuai config.js
   *
   * LANGSUNG:
   *
   * - hapus pesan
   * - keluarkan member
   */

  const abusive =
    abusiveWords.find(
      (word) =>
        containsWholeWord(
          text,
          word
        )
    );

  if (abusive) {

    console.log(
      `🚨 Kata kasar terdeteksi: ${abusive}`
    );

    return violationResult(
      "kata-kata kasar",
      abusive
    );
  }

  /*
   * ========================================
   * 2. PERTANYAAN TENTANG PENIPUAN
   * ========================================
   *
   * Ini diperiksa SEBELUM tuduhan scam.
   *
   * Contoh yang boleh:
   *
   * apakah ini penipuan?
   * apakah ini scam?
   * ini penipuan bukan?
   * apakah aman?
   *
   * Tidak dikeluarkan.
   */

  const protectedContext =
    protectedQuestionPatterns.some(
      (pattern) => {

        try {

          /*
           * Reset lastIndex jika
           * regex menggunakan flag g.
           */

          pattern.lastIndex = 0;

          return pattern.test(
            text
          );

        } catch {
          return false;
        }
      }
    );

  if (protectedContext) {

    console.log(
      "ℹ️ Pertanyaan scam diperbolehkan:",
      text
    );

    return safeResult({
      protectedContext: true
    });
  }

  /*
   * ========================================
   * 3. TUDUHAN PENIPUAN
   * ========================================
   *
   * Contoh:
   *
   * grup ini penipu
   * admin penipu
   * toko ini scam
   * kalian scammer
   *
   * LANGSUNG:
   *
   * - hapus
   * - keluarkan member
   */

  const scamPattern =
    scamAccusationPatterns.find(
      (pattern) => {

        try {

          pattern.lastIndex = 0;

          return pattern.test(
            text
          );

        } catch {
          return false;
        }
      }
    );

  if (scamPattern) {

    console.log(
      "🚨 Tuduhan scam terdeteksi:",
      text
    );

    return violationResult(
      "tuduhan penipuan/scam",
      text
    );
  }

  /*
   * ========================================
   * 4. TIDAK ADA PELANGGARAN
   * ========================================
   */

  return safeResult();
}
