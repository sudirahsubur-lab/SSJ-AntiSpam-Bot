import "dotenv/config";

export const config = {
  targetGroupName: (
    process.env.TARGET_GROUP_NAME ||
    "SUDIRAH SUBUR GROSIR"
  ).trim().toLowerCase(),

  autoKick:
    (process.env.AUTO_KICK || "true")
      .toLowerCase() === "true",

  sendNotice:
    (process.env.SEND_NOTICE || "true")
      .toLowerCase() === "true",

  whitelist: new Set(
    (process.env.WHITELIST_NUMBERS || "")
      .split(",")
      .map(v => v.replace(/\D/g, ""))
      .filter(Boolean)
  )
};


// ========================================
// KATA KASAR = LANGSUNG KELUARKAN
// ========================================

export const abusiveWords = [
  "babi",
  "anjing",
  "bangsat",
  "kontol",
  "memek",
  "goblok",
  "tolol",
  "brengsek"
];


// ========================================
// TUDUHAN PENIPUAN = LANGSUNG KELUARKAN
// ========================================

export const scamAccusationPatterns = [

  /\bgrup\s+(ini\s+)?penipu\b/i,

  /\bgrup\s+(ini\s+)?penipuan\b/i,

  /\bgrup\s+(ini\s+)?scam(?:mer)?\b/i,

  /\badmin\s+(ini\s+)?penipu\b/i,

  /\badmin\s+(ini\s+)?penipuan\b/i,

  /\badmin\s+(ini\s+)?scam(?:mer)?\b/i,

  /\btoko\s+(ini\s+)?penipu\b/i,

  /\btoko\s+(ini\s+)?penipuan\b/i,

  /\btoko\s+(ini\s+)?scam(?:mer)?\b/i,

  /\btukang\s+tipu\b/i
];


// ========================================
// PERTANYAAN / LAPORAN = JANGAN DI-BAN
// ========================================

export const protectedQuestionPatterns = [

  /\b(apakah|apa|ini|emang|memang)\b.{0,35}\b(penipu|penipuan|scam|scammer)\b.*\?/i,

  /\b(penipu|penipuan|scam|scammer)\b.{0,20}\b(bukan|kah)\b.*\?/i,

  /\bada\b.{0,25}\b(penipu|scammer)\b.{0,25}\b(di|dalam)\s+grup\b/i,

  /\b(hati[- ]?hati|lapor|melaporkan)\b.{0,40}\b(penipu|penipuan|scam|scammer)\b/i
];
