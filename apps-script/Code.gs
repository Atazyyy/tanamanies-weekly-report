/**
 * Tanamanies Weekly Report - otomasi laporan back-office mingguan dengan Google Apps Script.
 *
 * Brand & data fiktif untuk portofolio (Tanamanies Cafe, Bandung).
 *
 * Kegunaan:
 *  - Setiap Senin 07.00, membaca sheet "Data Penjualan" (ekspor manual/ajuan harian outlet),
 *    membersihkan data (nama outlet tidak konsisten, qty/harga teks, VOID/REFUND),
 *    lalu menulis ringkasan ke sheet "Ringkasan".
 *  - Mengirim laporan ke email pemilik sheet (default) dan ke Telegram bot (opsional,
 *    via Script Properties TELEGRAM_TOKEN & TELEGRAM_CHAT_ID).
 *  - Semua perbaikan & error dicatat ke sheet "Log" - laporan tetap terkirim dengan
 *    tanda peringatan bila data bermasalah, tidak pernah gagal diam-diam.
 *
 * Cara pakai (ringkas): lihat README.md. Fungsi utama: laporanMingguan.
 */

// ============================================================
// KONFIGURASI
// ============================================================

const SHEET_DATA = 'Data Penjualan';
const SHEET_RINGKASAN = 'Ringkasan';
const SHEET_LOG = 'Log';

const HEADER_DATA = ['tanggal', 'outlet', 'produk', 'kategori', 'qty', 'harga_satuan', 'status'];

// Nama outlet sering ditulis tidak konsisten oleh outlet -> satukan di sini.
const PETA_OUTLET = {
  'dago': 'Tanamanies Dago',
  'buah batu': 'Tanamanies Buah Batu',
  'dipatiukur': 'Tanamanies Dipatiukur',
};

// Jika data mentah di bawah jumlah ini pada periode laporan, kirim dengan peringatan.
const AMBANG_BARIS_MINIMUM = 100;

// ============================================================
// ENTRY POINT
// ============================================================

/**
 * Jalankan laporan mingguan: bersihkan data Senin-Minggu sebelumnya,
 * tulis ke sheet Ringkasan, kirim ke email (dan Telegram bila dikonfigurasi).
 * Dipasang sebagai trigger mingguan (lihat pasangTrigger), atau dijalankan manual.
 */
function laporanMingguan() {
  const t0 = new Date();
  try {
    const { awal, akhir } = rentangMingguLalu_();
    const mentah = bacaDataMentah_();
    const hasil = bersihkanDanAgregasi_(mentah, awal, akhir);

    tulisRingkasan_(hasil, awal, akhir);

    const adaPeringatan = hasil.peringatan.length > 0;
    const subjek = '[Tanamanies] Laporan Mingguan ' + formatRentang_(awal, akhir) +
      (adaPeringatan ? ' (PERIKSA DATA)' : '');
    MailApp.sendEmail({
      to: penerimaEmail_(),
      subject: subjek,
      htmlBody: susunEmail_(hasil, awal, akhir),
    });

    if (telegramAktif_()) {
      kirimTelegram_(susunTeksTelegram_(hasil, awal, akhir));
    }

    catatLog_('INFO', 'Laporan ' + formatRentang_(awal, akhir) + ' terkirim - ' +
      hasil.jumlahBarisValid + ' baris valid, ' + hasil.barisDibuang + ' dibuang, ' +
      hasil.selDiperbaiki + ' sel diperbaiki (' + berlangsung_(t0) + ').');
  } catch (err) {
    // Jangan diam-diam gagal: catat + kirim email peringatan ke penerima.
    catatLog_('ERROR', 'laporanMingguan gagal: ' + err.message);
    MailApp.sendEmail({
      to: penerimaEmail_(),
      subject: '[Tanamanies] LAPORAN MINGGUAN GAGAL',
      htmlBody: '<p>Pipeline laporan mingguan gagal berjalan:</p><pre>' + err.message + '</pre>' +
        '<p>Periksa sheet "' + SHEET_LOG + '" dan struktur sheet "' + SHEET_DATA + '".</p>',
    });
    throw err; // tetap lempar agar terlihat di dashboard eksekusi Apps Script
  }
}

// ============================================================
// PENGOLAHAN DATA
// ============================================================

/** Baca & validasi struktur sheet data mentah. */
function bacaDataMentah_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_DATA + '" tidak ditemukan. Jalankan dulu isiDataContoh().');
  }
  const nilai = sheet.getDataRange().getValues();
  if (nilai.length < 2) {
    throw new Error('Sheet "' + SHEET_DATA + '" kosong. Jalankan isiDataContoh() untuk demo.');
  }
  const header = nilai[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const hilang = HEADER_DATA.filter(function (h) { return header.indexOf(h) === -1; });
  if (hilang.length > 0) {
    throw new Error('Kolom tidak lengkap di "' + SHEET_DATA + '": ' + hilang.join(', '));
  }
  const idx = {};
  HEADER_DATA.forEach(function (h) { idx[h] = header.indexOf(h); });
  return nilai.slice(1).map(function (baris) {
    return {
      tanggal: baris[idx['tanggal']],
      outlet: baris[idx['outlet']],
      produk: baris[idx['produk']],
      kategori: baris[idx['kategori']],
      qty: baris[idx['qty']],
      harga: baris[idx['harga_satuan']],
      status: baris[idx['status']],
    };
  });
}

/**
 * Bersihkan baris lalu agregasi omzet untuk rentang [awal, akhir] dan periode pembanding.
 * Mengembalikan objek hasil berisi angka + daftar peringatan + statistik pembersihan.
 */
function bersihkanDanAgregasi_(mentah, awal, akhir) {
  const peringatan = [];
  const stat = { selDiperbaiki: 0, barisDibuang: 0, voidRefund: 0 };
  const periodeIni = { perOutlet: {}, perProduk: {} };
  const mingguLalu = { perOutlet: {}, perProduk: {} };
  let jumlahBarisValid = 0;

  mentah.forEach(function (r) {
    const tgl = tanggal_(r.tanggal);
    if (!tgl) { stat.barisDibuang++; return; } // tanggal rusak/teks aneh

    const status = String(r.status || 'OK').trim().toUpperCase();
    if (status === 'VOID' || status === 'REFUND') { stat.voidRefund++; return; } // bukan pendapatan

    const outlet = rapikanOutlet_(r.outlet);
    if (!outlet) { stat.barisDibuang++; return; } // outlet tak dikenal

    const qty = angka_(r.qty);
    const harga = angka_(r.harga);
    if (qty === null || harga === null || qty <= 0) { stat.barisDibuang++; return; }

    const produk = String(r.produk || '(tanpa nama)').trim() || '(tanpa nama)';
    const omzet = qty * harga;

    const target = dalamRentang_(tgl, awal, akhir) ? periodeIni : dalamRentang_(tgl, geserMinggu_(awal), geserMinggu_(akhir)) ? mingguLalu : null;
    if (!target) return; // di luar kedua periode pembanding

    // hitung pembersihan yang benar-benar terjadi pada baris ini
    if (String(r.outlet || '').trim() !== outlet) stat.selDiperbaiki++;
    if (typeof r.harga === 'string' && harga !== null) stat.selDiperbaiki++;

    if (target === periodeIni) jumlahBarisValid++; // ambang minimum dihitung dari periode laporan

    if (!target.perOutlet[outlet]) target.perOutlet[outlet] = { omzet: 0, trx: 0 };
    target.perOutlet[outlet].omzet += omzet;
    target.perOutlet[outlet].trx += 1;
    if (!target.perProduk[produk]) target.perProduk[produk] = 0;
    target.perProduk[produk] += omzet;
  });

  if (jumlahBarisValid < AMBANG_BARIS_MINIMUM) {
    peringatan.push('Baris valid hanya ' + jumlahBarisValid + ' (ambang ' + AMBANG_BARIS_MINIMUM +
      ') - kemungkinan data belum lengkap diimpor.');
  }

  const ringkasProduk = function (p) {
    return Object.keys(p).map(function (k) { return { produk: k, omzet: p[k] }; })
      .sort(function (a, b) { return b.omzet - a.omzet; }).slice(0, 5);
  };

  return {
    periodeIni: periodeIni,
    mingguLalu: mingguLalu,
    topProduk: ringkasProduk(periodeIni.perProduk),
    jumlahBarisValid: jumlahBarisValid,
    barisDibuang: stat.barisDibuang,
    voidRefund: stat.voidRefund,
    selDiperbaiki: stat.selDiperbaiki,
    peringatan: peringatan,
  };
}

/** 'dago' / 'DAGO ' / 'Tanamanies dago' -> 'Tanamanies Dago'; null jika tak dikenal. */
function rapikanOutlet_(v) {
  const k = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k) return null;
  for (var kunci in PETA_OUTLET) {
    if (k.indexOf(kunci) !== -1) return PETA_OUTLET[kunci];
  }
  return null;
}

/** Terima 18000, '18.000', 'Rp18.000', Date -> angka; selain itu null. */
function angka_(v) {
  if (v instanceof Date) return null;
  if (typeof v === 'number') return v;
  const s = String(v || '').trim().toLowerCase().replace('rp', '').trim();
  if (!s) return null;
  const bersih = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(/,/g, '.');
  const n = Number(bersih);
  return isNaN(n) ? null : n;
}

/** Terima Date atau '2026-10-26' / '26/10/2026' -> Date tengah hari; selain itu null. */
function tanggal_(v) {
  if (v instanceof Date) return baruTengahHari_(v);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); // dd/mm/yyyy
  return null;
}

// ============================================================
// PERIODE
// ============================================================

/** Rentang Senin-Minggu minggu lalu (relatif terhadap hari ini). */
function rentangMingguLalu_() {
  const hariIni = new Date();
  const hariKe = (hariIni.getDay() + 6) % 7; // Sen=0 .. Min=6
  const seninIni = baruTengahHari_(hariIni);
  seninIni.setDate(hariIni.getDate() - hariKe);
  const akhir = new Date(seninIni); akhir.setDate(seninIni.getDate() - 1);
  const awal = new Date(akhir); awal.setDate(akhir.getDate() - 6);
  return { awal: awal, akhir: akhir };
}

function geserMinggu_(d) {
  const x = new Date(d); x.setDate(x.getDate() - 7); return x;
}

function dalamRentang_(d, awal, akhir) {
  return d >= baruTengahHari_(awal) && d <= baruTengahHari_(akhir);
}

function baruTengahHari_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ============================================================
// OUTPUT: RINGKASAN, EMAIL, TELEGRAM
// ============================================================

/** Tulis/overwrite sheet Ringkasan dengan tabel yang siap dibaca manajemen. */
function tulisRingkasan_(hasil, awal, akhir) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RINGKASAN);
  if (!sheet) sheet = ss.insertSheet(SHEET_RINGKASAN);
  sheet.clear();

  const zona = Session.getScriptTimeZone();
  const label = Utilities.formatDate(awal, zona, 'dd MMM') + ' - ' + Utilities.formatDate(akhir, zona, 'dd MMM yyyy');

  sheet.getRange('A1').setValue('RINGKASAN MINGGUAN - TANAMANIES CAFE').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2').setValue('Periode: ' + label + '  |  dibuat otomatis ' +
    Utilities.formatDate(new Date(), zona, 'dd MMM yyyy HH:mm')).setFontColor('#666666');

  sheet.getRange('A4').setValue('Omzet per outlet').setFontWeight('bold');
  // Satu baris ekspor = satu transaksi item; jika sumber POS punya ID transaksi,
  // ganti hasil.perOutlet[o].trx dengan hitungan ID unik.
  const header = ['Outlet', 'Omzet', 'Transaksi', 'vs minggu lalu'];
  const baris = [header];
  const daftarOutlet = Object.keys(hasil.periodeIni.perOutlet).sort();
  daftarOutlet.forEach(function (o) {
    const sekarang = hasil.periodeIni.perOutlet[o].omzet;
    const dulu = (hasil.mingguLalu.perOutlet[o] || {}).omzet || 0;
    baris.push([o, sekarang, hasil.periodeIni.perOutlet[o].trx, selisih_(sekarang, dulu)]);
  });
  sheet.getRange(5, 1, baris.length, 4).setValues(baris);
  sheet.getRange(6, 2, daftarOutlet.length, 1).setNumberFormat('#,##0');
  if (baris.length > 1) {
    sheet.getRange(5, 1, 1, 4).setFontWeight('bold').setBackground('#e8f0e8');
  }

  sheet.getRange(5 + baris.length + 2, 1).setValue('Top 5 produk').setFontWeight('bold');
  const tp = [['Produk', 'Omzet']];
  hasil.topProduk.forEach(function (p) { tp.push([p.produk, p.omzet]); });
  sheet.getRange(6 + baris.length + 2, 1, tp.length, 2).setValues(tp);
  sheet.getRange(7 + baris.length + 2, 2, tp.length - 1, 1).setNumberFormat('#,##0');

  let barisCatatan = 8 + baris.length + tp.length + 2;
  sheet.getRange(barisCatatan, 1).setValue('Catatan pipeline').setFontWeight('bold');
  barisCatatan++;
  sheet.getRange(barisCatatan, 1).setValue('Baris valid: ' + hasil.jumlahBarisValid +
    ' | dibuang: ' + hasil.barisDibuang + ' | VOID/REFUND dikecualikan: ' + hasil.voidRefund);
  barisCatatan++;
  hasil.peringatan.forEach(function (p) {
    sheet.getRange(barisCatatan, 1).setValue('[!] ' + p).setFontColor('#b45309');
    barisCatatan++;
  });
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 160);
}

/** Email HTML sederhana - dibaca di ponsel manajemen. */
function susunEmail_(hasil, awal, akhir) {
  const baris = Object.keys(hasil.periodeIni.perOutlet).sort().map(function (o) {
    const sekarang = hasil.periodeIni.perOutlet[o].omzet;
    const dulu = (hasil.mingguLalu.perOutlet[o] || {}).omzet || 0;
    return '<tr><td style="padding:6px 12px">' + o + '</td><td style="padding:6px 12px;text-align:right">' +
      rupiah_(sekarang) + '</td><td style="padding:6px 12px;text-align:right">' + selisih_(sekarang, dulu) + '</td></tr>';
  }).join('');
  const top = hasil.topProduk.map(function (p, i) {
    return '<li>' + p.produk + ' - ' + rupiah_(p.omzet) + '</li>';
  }).join('');
  const warna = hasil.peringatan.length ? '#b45309' : '#2e7d32';
  const status = hasil.peringatan.length
    ? '[!] Perlu perhatian: ' + hasil.peringatan.join('; ')
    : '[OK] Data lengkap - ' + hasil.jumlahBarisValid + ' baris valid diproses.';
  return '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<h2 style="margin-bottom:4px">Tanamanies Cafe</h2>' +
    '<p style="color:#666;margin-top:0">Laporan mingguan ' + formatRentang_(awal, akhir) + '</p>' +
    '<table style="border-collapse:collapse"><tr style="background:#e8f0e8;font-weight:bold">' +
    '<td style="padding:6px 12px">Outlet</td><td style="padding:6px 12px;text-align:right">Omzet</td>' +
    '<td style="padding:6px 12px;text-align:right">vs minggu lalu</td></tr>' + baris + '</table>' +
    '<h3 style="margin-bottom:4px">Top 5 produk</h3><ol>' + top + '</ol>' +
    '<p style="color:' + warna + '">' + status + '</p>' +
    '<p style="color:#999;font-size:12px">Laporan otomatis Google Apps Script | VOID/REFUND dikecualikan | detail: sheet "' + SHEET_RINGKASAN + '"</p></div>';
}

/** Teks ringkas untuk Telegram (parse_mode HTML). */
function susunTeksTelegram_(hasil, awal, akhir) {
  const baris = Object.keys(hasil.periodeIni.perOutlet).sort().map(function (o) {
    const sekarang = hasil.periodeIni.perOutlet[o].omzet;
    const dulu = (hasil.mingguLalu.perOutlet[o] || {}).omzet || 0;
    return '- ' + o + ': <b>' + rupiah_(sekarang) + '</b> (' + selisih_(sekarang, dulu) + ')';
  }).join('\n');
  const warna = hasil.peringatan.length ? '[!]' : '[OK]';
  return '<b>Tanamanies - Laporan ' + formatRentang_(awal, akhir) + '</b>\n' + baris +
    '\n<b>Top:</b> ' + (hasil.topProduk[0] ? hasil.topProduk[0].produk : '-') +
    '\n' + warna + ' ' + (hasil.peringatan.length ? hasil.peringatan.join('; ') :
      hasil.jumlahBarisValid + ' baris valid diproses.');
}

function rupiah_(n) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

function formatRentang_(awal, akhir) {
  const zona = Session.getScriptTimeZone();
  return Utilities.formatDate(awal, zona, 'dd MMM') + '-' + Utilities.formatDate(akhir, zona, 'dd MMM');
}

/** 'x' vs pembanding 0 -> teks persen berwarna Emoji. */
function selisih_(sekarang, dulu) {
  if (!dulu) return '-';
  const pct = (sekarang / dulu - 1) * 100;
  const tanda = pct >= 0 ? '^ +' : 'v ';
  return tanda + pct.toFixed(1) + '%';
}

function berlangsung_(t0) {
  const detik = Math.round((new Date() - t0) / 100) / 10;
  return detik + ' detik';
}

// ============================================================
// TELEGRAM (OPSIONAL)
// ============================================================

/** Penerima laporan: Script Properties EMAIL_PENERIMA bila diisi,
 *  selain itu akun Google pemilik spreadsheet ini. */
function penerimaEmail_() {
  const props = PropertiesService.getScriptProperties();
  const kustom = props.getProperty('EMAIL_PENERIMA');
  return kustom || Session.getEffectiveUser().getEmail();
}

function telegramAktif_() {
  const props = PropertiesService.getScriptProperties();
  return Boolean(props.getProperty('TELEGRAM_TOKEN') && props.getProperty('TELEGRAM_CHAT_ID'));
}

function kirimTelegram_(teks) {
  const props = PropertiesService.getScriptProperties();
  const url = 'https://api.telegram.org/bot' + props.getProperty('TELEGRAM_TOKEN') + '/sendMessage';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: { chat_id: props.getProperty('TELEGRAM_CHAT_ID'), text: teks, parse_mode: 'HTML' },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    catatLog_('WARN', 'Telegram tidak terkirim: HTTP ' + res.getResponseCode() + ' ' + res.getContentText());
  }
}

// ============================================================
// PEMELIHARAAN
// ============================================================

/** Hapus trigger lama lalu pasang trigger mingguan Senin 07.00 (zona waktu Asia/Jakarta). */
function pasangTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'laporanMingguan') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('laporanMingguan')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();
  catatLog_('INFO', 'Trigger mingguan Senin 07.00 terpasang.');
}

/**
 * Hentikan otomasi: hapus semua trigger laporan mingguan.
 * Laporan berhenti terkirim otomatis, tapi semua data & sheet tetap utuh.
 * Untuk menyalakan lagi, jalankan pasangTrigger.
 */
function hentikanTrigger() {
  var jumlah = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'laporanMingguan') {
      ScriptApp.deleteTrigger(t);
      jumlah++;
    }
  });
  catatLog_('INFO', 'Trigger mingguan dihapus: ' + jumlah + ' trigger. Otomasi berhenti; jalankan pasangTrigger untuk menyalakan lagi.');
  return jumlah;
}

/** Tulis baris ke sheet Log (buat bila belum ada). */
function catatLog_(level, pesan) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOG);
    sheet.getRange('A1:C1').setValues([['waktu', 'level', 'pesan']]).setFontWeight('bold');
  }
  sheet.appendRow([new Date(), level, pesan]);
}

/**
 * Isi sheet Data Penjualan dengan 2 minggu data simulasi (dengan data kotor ringan:
 * nama outlet kasar, harga berformat teks, beberapa VOID) supaya laporanMingguan
 * bisa langsung didemokan. Mengganti seluruh isi sheet.
 */
function isiDataContoh() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) sheet = ss.insertSheet(SHEET_DATA);
  sheet.clear();
  sheet.appendRow(HEADER_DATA);

  const menu = [
    ['Kopi Susu Aren', 'Kopi Susu', 18000], ['Es Kopi Tanamanies', 'Kopi Susu', 22000],
    ['Americano', 'Kopi Hitam', 16000], ['Matcha Latte', 'Non-Kopi', 24000],
    ['Butterscotch Latte', 'Signature', 26000], ['Butter Croissant', 'Pastry', 22000],
    ['Pisang Goreng Keju', 'Snack', 20000],
  ];
  const outlet = ['Tanamanies Dago', 'dago', 'DAGO', 'Tanamanies Buah Batu', 'buah batu ', 'Tanamanies Dipatiukur'];
  const hariIni = new Date();
  const hariKe = (hariIni.getDay() + 6) % 7;
  const seninIni = new Date(hariIni.getFullYear(), hariIni.getMonth(), hariIni.getDate() - hariKe);

  // 2 minggu penuh, minggu kedua tumbuh ~15% (untuk demo angka pembanding)
  for (var m = 2; m >= 1; m--) {
    const faktor = m === 2 ? 0.87 : 1.0;
    for (var d = 0; d < 7; d++) {
      const tgl = new Date(seninIni); tgl.setDate(seninIni.getDate() - m * 7 + d);
      for (var n = 0; n < 18 * faktor; n++) {
        const pilih = menu[Math.floor(Math.random() * menu.length)];
        const namaOutlet = outlet[Math.floor(Math.random() * outlet.length)];
        const harga = Math.random() < 0.08 ? 'Rp' + pilih[2].toLocaleString('id-ID') : pilih[2];
        const voidKasus = Math.random() < 0.02;
        sheet.appendRow([
          Utilities.formatDate(tgl, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          namaOutlet, pilih[0], pilih[1],
          voidKasus ? -1 : (Math.random() < 0.9 ? 1 : 2),
          harga, voidKasus ? 'VOID' : (Math.random() < 0.7 ? 'OK' : ''),
        ]);
      }
    }
  }
  sheet.getRange('A1:G1').setFontWeight('bold');
  catatLog_('INFO', 'isiDataContoh menulis ~252 baris simulasi (2 minggu).');
}
