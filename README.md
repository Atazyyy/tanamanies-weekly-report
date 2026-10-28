# 📄 Tanamanies Weekly Report — Otomasi Laporan Back-office (Google Apps Script)

Laporan penjualan mingguan kedai kopi yang **terkirim otomatis ke email & Telegram setiap Senin pagi** — dibangun penuh di dalam Google Sheet dengan Apps Script (JavaScript), tanpa server dan tanpa biaya.

**Untuk siapa & untuk apa:** pemilik/manager multi-outlet F&B yang data hariannya sudah masuk Google Sheet tapi laporan mingguannya masih diolah manual. Sistem ini menggantikan pekerjaan itu: menghitung omzet per outlet, membandingkan dengan minggu lalu, menyusun top produk, lalu mengirimkannya sebelum outlet buka — tanpa ada yang perlu membuka file.

> Tanamanies Cafe adalah **brand fiktif** kedai kopi di Bandung. Seluruh data & alamat email pada project ini adalah simulasi untuk portofolio — bukan data bisnis nyata.
>
> Project pendamping: [Tanamanies Cafe Analytics](https://github.com/Atazyyy/tanamanies-cafe-analytics) (pipeline data + dashboard + MCP).

## Kenapa project ini ada

Di bisnis F&B multi-outlet, laporan back-office (penjualan mingguan, dsb.) umumnya hidup di **Google Spreadsheet** — bukan di dashboard. Masalahnya: mengumpulkan, merapikan, dan mengirim laporan manual itu lambat dan rawan salah. Project ini mengotomasinya end-to-end:

```
Sheet "Data Penjualan" (input mentah harian, sering kotor)
        │  setiap Senin 07.00 (time-driven trigger)
        ▼
Apps Script: bersihkan & validasi (nama outlet, harga teks, VOID/REFUND)
        │
        ├─► Sheet "Ringkasan"     — tabel siap baca + pembanding minggu lalu
        ├─► Email manajemen       — HTML rapi, terbaca di ponsel
        ├─► Telegram bot (opsional) — ringkasan singkat
        └─► Sheet "Log"           — jejak audit setiap eksekusi
```

## Kegunaan / yang didemonstrasikan

| Kemampuan | Wujudnya |
|---|---|
| **Google Apps Script + Spreadsheet** | Fungsi JavaScript membaca, membersihkan, dan menulis sheet — trigger terjadwal otomatis |
| **JavaScript** | ~460 baris Apps Script (V8): validasi header, parsing tanggal 2 format, harga `"Rp18.000"` → angka |
| **Otomasi laporan rutin** | Satu kali pasang trigger — laporan jalan sendiri setiap Senin 07.00 WIB tanpa ada yang membuka file |
| **Integritas angka** | VOID/REFUND dikecualikan dari omzet; pembanding minggu lalu otomatis (`^ +20%` / `v -20%`) |
| **Keandalan** | Data bermasalah → laporan tetap terkirim dengan tanda ⚠ + peringatan; error fatal → email "GAGAL" + log; tidak pernah gagal diam-diam |
| **Keamanan kredensial** | Token Telegram disimpan di **Script Properties** (bukan di kode), tidak ikut ke-Git |

## Cara memasang (±10 menit)

1. Buat Google Sheet baru di [sheets.new](https://sheets.new) → beri nama `Tanamanies Weekly Report`.
2. Menu **Extensions → Apps Script** → hapus isi `Code.gs`, tempel seluruh isi [`apps-script/Code.gs`](apps-script/Code.gs).
3. (Opsional) Sesuaikan pengaturan di bagian atas file: nama sheet, ambang baris minimum.
4. Simpan, lalu di dropdown fungsi pilih **`isiDataContoh`** → **Run** → **Authorize** (izin sekali di awal). Sheet "Data Penjualan" terisi ±252 baris simulasi 2 minggu.
5. Pilih **`laporanMingguan`** → **Run**. Sheet **Ringkasan** & **Log** langsung terbentuk, dan laporan terkirim ke email akun Google-mu.
6. Pilih **`pasangTrigger`** → **Run** → selesai. Mulai sekarang laporan terkirim otomatis tiap Senin 07.00.

### Opsional: kirim juga ke Telegram

1. Buat bot via [@BotFather](https://t.me/BotFather) (`/newbot`) → salin token.
2. Kirim 1 pesan ke bot-mu, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates` untuk melihat `chat_id`.
3. Di Apps Script: **Project Settings → Script Properties** → tambah `TELEGRAM_TOKEN` dan `TELEGRAM_CHAT_ID`.
4. Jalankan `laporanMingguan` lagi — ringkasan muncul di Telegram-mu.

## Pemakaian sehari-hari

| Siapa | Yang dilakukan |
|---|---|
| Kasir / admin outlet | Mengisi sheet **Data Penjualan** setiap hari (satu baris = satu item terjual) |
| Sistem (otomatis) | Setiap Senin 07.00: bersihkan data, tulis **Ringkasan**, kirim email + Telegram, catat **Log** |
| Manager | Membaca email Ringkasan; kalau ada tanda peringatan, buka sheet **Log** untuk detail |
| Kamu (pemilik sistem) | Tidak ada tugas rutin. Cek **Log** sesekali; kalau laporan tidak masuk, lihat halaman *Executions* |

## Cara menghentikan (dan menyalakan lagi)

Semua penghentian aman: data dan sheet tidak ikut terhapus.

| Yang ingin dihentikan | Caranya |
|---|---|
| **Laporan otomatis Senin 07.00** | Di editor Apps Script pilih fungsi **`hentikanTrigger`** → **Run**. Trigger dihapus, sheet & data tetap utuh. |
| **Satu eksekusi yang sedang berjalan** | Klik tombol **Stop** di panel *Execution log*. |
| **Kiriman ke Telegram** | **Project Settings → Script Properties** → hapus `TELEGRAM_TOKEN` dan `TELEGRAM_CHAT_ID`. Laporan tetap jalan, hanya tanpa Telegram. |
| **Kiriman ke email tertentu** | Hapus properti `EMAIL_PENERIMA`. Laporan kembali dikirim ke email pemilik spreadsheet. |
| **Seluruh project** | **Extensions → Apps Script → ⋮ (menu project) → Delete project**. Sheet boleh dibiarkan; cukup jangan jalankan fungsi apa pun lagi. |

**Menyalakan lagi:** jalankan **`pasangTrigger`**. Fungsi ini idempoten — trigger lama dihapus lebih dulu, jadi tidak akan ada laporan dobel.

**Menguji tanpa menunggu Senin:** jalankan **`laporanMingguan`** kapan saja; hasilnya sama dengan yang akan dikirim trigger.

## Struktur repo

```
├── apps-script/
│   ├── Code.gs            # seluruh kode (tempel ke Apps Script editor)
│   └── appsscript.json    # manifest: zona waktu Asia/Jakarta, runtime V8
├── uji-logika-lokal.js    # harness Node: menguji logika murni tanpa Apps Script runtime
└── docs/PANDUAN-PRESENTASI.md
```

## Keputusan desain yang penting

- **Laporan tidak pernah gagal diam-diam.** Data kurang/anomali → email tetap terkirim dengan penanda ⚠ "PERIKSA DATA" + rincian di sheet Log. Error fatal → email khusus "GAGAL" dengan pesan errornya. (Jobdesk nyata: "memperbaikinya dengan cepat saat terjadi kegagalan".)
- **Pembersihan terpusat & terukur** — setiap run mencatat berapa sel diperbaiki, baris dibuang, dan VOID/REFUND dikecualikan, sama seperti filosofi proyek analytics pendampingnya.
- **Kredensial di Script Properties**, bukan hardcode — dan karena tidak di-commit, repo aman publik.
- **Pembanding minggu lalu dihitung otomatis** dari periode yang sama panjang, jadi angka pertumbuhan tidak bisa "dibaca salah".
- **Definisi metrik eksplisit.** `Omzet` = qty x harga satuan setelah VOID/REFUND dikeluarkan. `Transaksi` = jumlah baris ekspor yang valid per outlet (satu baris = satu item terjual); jika sumber POS punya ID transaksi, ganti dengan hitungan ID unik — komentarnya ada di kode.
- **Code.gs dijaga ASCII murni.** Emoji/em dash dihapus dari kode karena clipboard Windows bisa merusak encoding saat menempel ke editor Apps Script (gejala: `ÔÇö` di sheet). Label tetap jelas tanpa karakter non-ASCII.

## Menguji logika tanpa Google

Logika murni (parsing harga/tanggal, pemetaan outlet, agregasi, pembanding) diuji lokal dengan Node — stub Apps Script API dipasang lalu pipeline dijalankan end-to-end pada data kotor sintetis:

```bash
node uji-logika-lokal.js apps-script/Code.gs
# → SEMUA UJI LOGIKA LOLOS
```

---

Dibuat oleh [Agni Miftah Fauzi](https://github.com/Atazyyy) — AI Specialist / AI Systems.
Dikembangkan bersama AI coding assistant (ZCode) — arsitektur, keputusan desain, pengujian, dan verifikasi hasil dilakukan sendiri. Portfolio: [atapdigital.id](https://atapdigital.id)
