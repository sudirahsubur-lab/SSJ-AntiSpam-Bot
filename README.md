# SSJ Anti-Spam Bot V1

Bot moderasi grup WhatsApp menggunakan Baileys (WhatsApp Web, bukan API resmi Meta).

## Fitur V1
- Membaca pesan teks dan caption foto/video di grup.
- Auto-kick untuk kata kasar yang dikonfigurasi.
- Auto-kick untuk tuduhan langsung seperti "grup ini penipu", "admin scammer", "tukang tipu".
- Tidak auto-kick pertanyaan/laporan seperti "apakah ini penipuan?".
- Semua admin grup otomatis whitelist.
- Whitelist nomor tambahan melalui `.env`.
- Pesan pemberitahuan setelah tindakan.
- Sesi WhatsApp disimpan di folder `auth`.

## Penting
Baileys adalah integrasi WhatsApp Web tidak resmi. Perubahan pada WhatsApp dapat
menyebabkan bot berhenti bekerja atau sesi terputus. Gunakan nomor khusus bot.

## Persyaratan
- Node.js 20 atau lebih baru.
- Akun WhatsApp khusus bot.
- Akun bot sudah masuk dan menjadi admin grup target.
- Server/VPS/komputer yang dapat terus menjalankan Node.js.

## Instalasi
1. Ekstrak ZIP.
2. Buka terminal di folder project.
3. Jalankan:
   npm install
4. Salin `.env.example` menjadi `.env`.
5. Sesuaikan `TARGET_GROUP_NAME`.
6. Jalankan:
   npm start
7. QR akan muncul di terminal.
8. Di HP dengan akun WhatsApp bot:
   WhatsApp > Perangkat tertaut > Tautkan perangkat.
9. Scan QR.

## Uji aman
Tambahkan akun penguji NON-ADMIN ke grup. Jangan menguji dengan admin karena admin
sengaja masuk whitelist.

Contoh yang ditindak:
- "grup ini penipu"
- "admin scammer"
- "tukang tipu"
- kata kasar yang ada di `src/config.js`

Contoh yang seharusnya tidak ditindak:
- "apakah grup ini penipuan?"
- "ada scammer di grup?"
- "admin, saya mau lapor penipu"

## Mengubah daftar kata
Edit `src/config.js`, bagian `abusiveWords`, lalu restart bot.

## Catatan keamanan
Jangan unggah folder `auth` ke GitHub atau membagikannya. Folder tersebut berisi
kredensial sesi perangkat tertaut.
