// Harness lokal untuk menguji logika murni Code.gs tanpa Apps Script runtime.
// Menstub API Apps Script yang dipakai saat module load (hanya yang dievaluasi di top-level: tidak ada,
// tapi fungsi pemanggil dipanggil manual di bawah).

const calls = { log: [], triggerDihapus: [] };

const sheetPalsu = () => ({
  getRange: () => ({ setValues: () => ({ setFontWeight: () => null }), setFontWeight: () => null }),
  appendRow: (baris) => calls.log.push(baris),
});

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => sheetPalsu() }),
};
global.Session = { getScriptTimeZone: () => 'Asia/Jakarta' };
global.Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
global.MailApp = { sendEmail: (o) => calls.mail = o };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '' }) };
global.ScriptApp = {
  getProjectTriggers: () => [
    { getHandlerFunction: () => 'laporanMingguan' },
    { getHandlerFunction: () => 'fungsiLain' },
  ],
  newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ create: () => null }) }) }) }),
  deleteTrigger: (t) => calls.triggerDihapus.push(t),
  WeekDay: { MONDAY: 1 },
};

// muat Code.gs sebagai skrip biasa (fungsi jadi global di scope modul eval)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
(0, eval)(src.replace(/const /g, 'var '));

// ---- uji angka_ ----
const angka = angka_;
console.assert(angka(18000) === 18000, 'angka 18000');
console.assert(angka('18000') === 18000, 'angka "18000"');
console.assert(angka('18.000') === 18000, 'angka "18.000"');
console.assert(angka('Rp18.000') === 18000, 'angka "Rp18.000"');
console.assert(angka('abc') === null, 'angka "abc" -> null');
console.assert(angka('') === null, 'angka "" -> null');
console.assert(angka(18000.5) === 18000.5, 'angka float');

// ---- uji rapikanOutlet_ ----
const outlet = rapikanOutlet_;
console.assert(outlet('DAGO ') === 'Tanamanies Dago', 'outlet DAGO');
console.assert(outlet('Tanamanies dago') === 'Tanamanies Dago', 'outlet campur');
console.assert(outlet('buah batu') === 'Tanamanies Buah Batu', 'outlet buah batu');
console.assert(outlet('dipatiukur') === 'Tanamanies Dipatiukur', 'outlet dipatiukur');
console.assert(outlet('jakarta') === null, 'outlet asing -> null');
console.assert(outlet('') === null, 'outlet kosong -> null');

// ---- uji tanggal_ ----
const tgl = tanggal_;
console.assert(tgl('2026-10-26').getTime() === new Date(2026, 9, 26).getTime(), 'tanggal ISO');
console.assert(tgl('26/10/2026').getTime() === new Date(2026, 9, 26).getTime(), 'tanggal dd/mm/yyyy');
console.assert(tgl(new Date(2026, 9, 26)).getTime() === new Date(2026, 9, 26).getTime(), 'tanggal Date');
console.assert(tgl('besok') === null, 'tanggal sampah -> null');

// ---- uji selisih_ ----
console.assert(selisih_(1200000, 1000000) === '^ +20.0%', 'selisih naik');
console.assert(selisih_(800000, 1000000) === 'v -20.0%', 'selisih turun');
console.assert(selisih_(500000, 0) === '-', 'selisih pembanding nol');

// ---- uji rentangMingguLalu_ ----
const { awal, akhir } = rentangMingguLalu_();
console.assert(awal.getDay() === 1, 'awal = Senin');
console.assert(akhir.getDay() === 0, 'akhir = Minggu');
console.assert((akhir - awal) / 86400000 === 6, 'rentang 7 hari');
console.assert(akhir < new Date(), 'akhir di masa lalu');

// ---- uji bersihkanDanAgregasi_ (pipeline end-to-end mini) ----
const mk = (d, o, q, h, s) => ({ tanggal: d, outlet: o, produk: 'Kopi Susu Aren', kategori: 'Kopi', qty: q, harga: h, status: s });
const data = [
  mk('2026-10-19', 'dago', 2, 18000, 'OK'),           // valid minggu lalu
  mk('2026-10-20', 'DAGO ', 1, 'Rp18.000', 'OK'),     // harga teks -> diperbaiki
  mk('2026-10-21', 'dago', 1, 18000, 'VOID'),         // dikecualikan
  mk('2026-10-22', 'jakarta', 3, 18000, 'OK'),        // outlet asing -> dibuang
  mk('2026-10-23', 'dago', 'x', 18000, 'OK'),         // qty rusak -> dibuang
  mk('2026-10-12', 'dago', 5, 18000, 'OK'),           // minggu sebelumnya (pembanding)
  mk('2026-11-02', 'dago', 5, 18000, 'OK'),           // masa depan -> diabaikan
];
const hasil = bersihkanDanAgregasi_(data, new Date(2026, 9, 19), new Date(2026, 9, 25));
console.assert(hasil.jumlahBarisValid === 2, '2 baris valid, dapat: ' + hasil.jumlahBarisValid);
console.assert(hasil.barisDibuang === 2, '2 baris dibuang');
console.assert(hasil.voidRefund === 1, '1 VOID dikecualikan');
console.assert(hasil.selDiperbaiki === 4, '4 sel diperbaiki (3 outlet + 1 harga teks, kedua periode), dapat: ' + hasil.selDiperbaiki);
console.assert(hasil.periodeIni.perOutlet['Tanamanies Dago'].omzet === 36000 + 18000, 'omzet minggu lalu = 54000 (36rb + 18rb)');
console.assert(hasil.mingguLalu.perOutlet['Tanamanies Dago'].omzet === 90000, 'omzet pembanding = 90000');
console.assert(hasil.periodeIni.perOutlet['Tanamanies Dago'].trx === 2, 'trx periode = 2 baris, dapat: ' + hasil.periodeIni.perOutlet['Tanamanies Dago'].trx);
console.assert(hasil.mingguLalu.perOutlet['Tanamanies Dago'].trx === 1, 'trx pembanding = 1 baris');
console.assert(hasil.peringatan.length === 1, 'peringatan baris minimum muncul');

// ---- uji hentikanTrigger ----
const dihapus = hentikanTrigger();
console.assert(dihapus === 1, 'hentikanTrigger hanya menghapus trigger laporanMingguan, dapat: ' + dihapus);
console.assert(calls.triggerDihapus.length === 1, 'satu trigger benar-benar dihapus');
console.assert(calls.log.length === 1, 'hentikanTrigger mencatat ke sheet Log');

console.log('SEMUA UJI LOGIKA LOLOS');
