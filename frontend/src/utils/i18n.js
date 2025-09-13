export function isIpHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname || '';
  return /^[0-9.]+$/.test(h) && h !== '127.0.0.1' && h !== '0.0.0.0' && h !== '';
}

export function locale() {
  return isIpHost() ? 'tr' : 'ascii';
}

const TR = {
  title: 'Büfe Yönetim Sistemi',
  dailyRevenue: 'Günlük Ciro',
  home: 'Ana Sayfa',
  logout: 'Çıkış',
  adminLoginTitle: 'Admin Girişi',
  usernamePlaceholder: 'Kullanıcı adı',
  passwordPlaceholder: 'Şifre',
  cancel: 'İptal',
  login: 'Giriş',
  gunsonuButton: 'Günsonu Al',
  gunsonuOk: 'Günsonu alındı',
  gunsonuFail: 'Günsonu alınamadı',
  invalidCreds: 'Geçersiz kullanıcı adı veya şifre',
  menuPersonnel: 'Personel Giderleri',
  menuExpenses: 'İşletme Giderleri',
  menuStockCodes: 'Stok Kodu Listesi',
  menuStockUpdate: 'Stok Güncelleme',
  menuProductPrices: 'Ürün Fiyatları',
  menuReports: 'Ciro ve Net Kâr',
  menuClosings: 'Ciro Geçmişi',
  menuExport: 'Veri Yazdırma',
  closingsTitle: 'Ciro Geçmişi',
  closingsMonthlyTotal: 'Aylık Toplam',
  exportTitle: 'Veri Yazdırma',
  weeklySummary: 'Haftalık Özet',
  monthlySummary: 'Aylık Özet',
  exportExcel: "Excel'e Yazdır",
  sheetName: 'Özet',
};

const ASCII = {
  title: 'Bufe Yonetim Sistemi',
  dailyRevenue: 'Gunluk Ciro',
  home: 'Ana Sayfa',
  logout: 'Cikis',
  adminLoginTitle: 'Admin Girisi',
  usernamePlaceholder: 'Kullanici adi',
  passwordPlaceholder: 'Sifre',
  cancel: 'Iptal',
  login: 'Giris',
  gunsonuButton: 'Gunsonu Al',
  gunsonuOk: 'Gunsonu alindi',
  gunsonuFail: 'Gunsonu alinmadi',
  invalidCreds: 'Gecersiz Kullanici adi veya Sifre',
  menuPersonnel: 'Personel Giderleri',
  menuExpenses: 'Isletme Giderleri',
  menuStockCodes: 'Stok Kodu Listesi',
  menuStockUpdate: 'Stok Guncelleme',
  menuProductPrices: 'Urun Fiyatlari',
  menuReports: 'Ciro ve Net Kar',
  menuClosings: 'Ciro Gecmisi',
  menuExport: 'Veri Yazdirma',
  closingsTitle: 'Ciro Gecmisi',
  closingsMonthlyTotal: 'Aylik Toplam',
  exportTitle: 'Veri Yazdirma',
  weeklySummary: 'Haftalik Ozet',
  monthlySummary: 'Aylik Ozet',
  exportExcel: "Excel'e Yazdir",
  sheetName: 'Ozet',
};

export function t(key) {
  const lang = locale();
  const table = lang === 'tr' ? TR : ASCII;
  return (table[key] ?? TR[key] ?? key);
}

