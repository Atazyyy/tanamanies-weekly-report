# Panduan Presentasi — Tanamanies Weekly Report (Apps Script)

Cara mendemokan project ini saat interview, khususnya untuk posisi yang meminta
**otomasi laporan back-office / Google Apps Script / JavaScript**.

---

## 1. Elevator pitch (20 detik)

> "Dashboard bagus untuk analisis, tapi laporan rutin back-office di perusahaan ini
> biasanya hidup di Google Sheet. Jadi saya buat otomasinya: setiap Senin pagi tujuh,
> Apps Script membaca sheet data mentah, membersihkannya, menulis ringkasan
> dengan pembanding minggu lalu, dan mengirimnya ke email serta Telegram manajemen —
> dengan log audit dan peringatan otomatis kalau datanya bermasalah. Nol server, nol biaya,
> dan berjalan di tool yang sudah dipakai perusahaan."

## 2. Alur demo 3 menit

| Menit | Aksi | Yang kamu katakan |
|---|---|---|
| 0:00 | Buka Google Sheet, tunjukkan **sheet "Data Penjualan"** | "Ini input mentah harian — sengaja saya buat kotor: nama outlet 'dago', 'DAGO', harga berformat teks 'Rp18.000', ada baris VOID." |
| 0:40 | Tunjukkan **sheet "Ringkasan"** | "Ini hasil script: omzet per outlet dengan pembanding minggu lalu, top 5 produk, dan catatan pipeline — berapa baris valid, berapa yang diperbaiki." |
| 1:20 | Tunjukkan **sheet "Log"** | "Setiap eksekusi tercatat. Kalau data aneh, di sini sumber kebenarannya — tidak ada kegagalan diam-diam." |
| 2:00 | Buka **Apps Script editor**, scroll `laporanMingguan` | Ceritakan alurnya, jangan baca kode: "bersihkan → agregasi dua periode → tulis ringkasan → email + Telegram → log. Kalau error fatal, email khusus GAGAL tetap terkirim." |
| 2:40 | Tutup: tunjukkan screenshot email/Telegram yang sudah terkirim | "Ini berjalan sendiri setiap Senin 07.00 via trigger — satu-satunya 'infrastruktur' yang dibutuhkan adalah Google Sheet itu sendiri." |

## 3. Poin bicara pemetaan ke jobdesk

| Yang dicari perusahaan | Jawabanmu |
|---|---|
| "Mengotomasi laporan back-office rutin, termasuk melalui Apps Script" | Persis ini: trigger Senin 07.00 → ringkasan → email + Telegram |
| "Google Workspace tingkat lanjut (Spreadsheet & Apps Script)" | `getValues/setValues`, `setNumberFormat`, formatting sheet programmatically, `Script Properties` |
| "JavaScript" | V8 JavaScript di Apps Script + harness test Node lokal |
| "Mampu mengevaluasi & memperbaiki hasil AI" | Ceritakan: fungsi `angka_()` sengaja menangani 3 format harga + edge case, lalu diuji dengan `uji-logika-lokal.js` — AI membantu menulis, kamu yang menentukan aturan & menguji |
| "Mandiri, minim supervisi, terandalkan" | Sistem ini didesain untuk berjalan tanpa penjagaan: fail-loud + log + peringatan otomatis |
| "Menguasai SQL, arsitektur data, MCP" | Tunjukkan project pendamping [tanamanies-cafe-analytics](https://github.com/Atazyyy/tanamanies-cafe-analytics) (live dashboard) — dua-duanya satu cerita: pipeline berat di Python/DuckDB, laporan harian di Sheet |

## 4. Pertanyaan yang mungkin muncul

**"Kenapa Apps Script, bukan Python/airflow?"**
Audiensnya back-office yang bekerja di Google Sheet, dan perusahaan tidak perlu mengelola server
untuk laporan mingguan. Apps Script jalan di dalam Sheet — nol biaya, nol setup. Kalau butuh
pipeline berat, itu tugas project pendampingnya (Tanamanies Cafe Analytics dengan Python + DuckDB);
dua-duanya saling melengkapi.

**"Bagaimana kalau script gagal jalan Senin pagi?"**
Tiga lapis: try/catch di dalam `laporanMingguan` mengirim email "GAGAL" + menulis Log; Apps Script
sendiri menandai eksekusi gagal di dashboardnya; dan kalau datanya tidak lengkap (baris < ambang),
laporan tetap terkirim dengan tanda ⚠ — manajemen tidak pernah mengira "tidak ada laporan = aman".

**"Kenapa Telegram, kenapa bukan Slack/WhatsApp?"**
Telegram API-nya paling sederhana (satu HTTP POST), dan saya tunjukkan polanya bisa diganti —
Slack punya webhook serupa. Yang penting dari demo ini adalah pola: sistem → notifikasi → log.

**"Dari mana datanya?"**
Generator `isiDataContoh()` — 2 minggu data simulasi dengan kotoran yang dikontrol. Brand fiktif,
jadi aman dipublikasikan dan didemokan tanpa menyentuh data perusahaan mana pun.

## 5. Persiapan sebelum interview

- [ ] Jalankan sendiri sekali: sheet demo dengan Ringkasan, Log, dan email yang sudah sampai — screenshot email + Telegram untuk cadangan kalau tidak ada akses Google saat demo.
- [ ] Latih flow 3 menit di atas 2×.
- [ ] Simpan 1 pull request kecil di repo ini untuk cerita Git (sama seperti repo analytics).
