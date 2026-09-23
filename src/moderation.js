import {
  abusiveWords,
  scamAccusationPatterns,
  protectedQuestionPatterns
} from "./config.js";

function normalize(text = "") {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWholeWord(text, word) {
  const escaped = word.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  return new RegExp(
    `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
    "i"
  ).test(text);
}

export function evaluateMessage(rawText) {
  const text = normalize(rawText);

  if (!text) {
    return { violation: false };
  }

  // Kata kasar tetap langsung dianggap pelanggaran
  const abusive = abusiveWords.find(
    word => containsWholeWord(text, word)
  );

  if (abusive) {
    return {
      violation: true,
      reason: "kata-kata kasar",
      matched: abusive
    };
  }

  // Lindungi pertanyaan/laporan tentang scam
  // Contoh: "apakah ini penipuan?"
  const protectedContext =
    protectedQuestionPatterns.some(
      pattern => pattern.test(text)
    );

  if (protectedContext) {
    return {
      violation: false,
      protectedContext: true
    };
  }

  // Tuduhan langsung
  // Contoh: "grup ini penipu"
  const scamPattern =
    scamAccusationPatterns.find(
      pattern => pattern.test(text)
    );

  if (scamPattern) {
    return {
      violation: true,
      reason:
        "tuduhan penipuan/scam terhadap grup, admin, atau toko",
      matched: text
    };
  }

  return {
    violation: false
  };
}
