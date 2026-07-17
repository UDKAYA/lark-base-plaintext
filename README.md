# Düz Metin Görüntüleyici — Lark Base Eklentisi

Bir Lark Base tablosunda **tablo → görünüm/filtre → seçili alan(lar)** akışıyla veriyi
**ölçeklenebilir düz metin** olarak gösterir. Metnin boyutu, kalınlığı, satır yüksekliği,
harf aralığı, hizalaması, yazı tipi ve rengi kaydırıcılarla ayarlanır.

Teknoloji: **React + TypeScript + Vite** ve resmi **`@lark-base-open/js-sdk`**.

---

## Özellikler

- **Tablo seçimi** — Base içindeki tüm tablolar arasından seç (varsayılan: aktif tablo).
- **Görünüm seçimi** — Bir görünüm seçersen o görünümün **Lark'ta tanımlı filtre/sıralaması** uygulanır.
- **Eklenti içi filtre** — Alan + operatör (`içerir`, `eşittir`, `boş`, `>`, `<` …) + değer;
  birden çok koşul **VE / VEYA** ile birleşir.
- **Gösterilecek alanlar** — Bir veya birden çok alan seç.
- **Çıktı** — Kayıt/alan ayracı, alan adını göster, boşları gizle, tekrarları kaldır.
- **Metin görünümü** — Boyut, kalınlık, satır yüksekliği, harf aralığı, hizalama, yazı tipi, renk.
- **Panoya kopyala**.

---

## Geliştirme (yerel)

Gereksinim: Node 18+ (bu proje Node 26 ile test edildi).

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` sunucusu açıkken bu URL'yi aşağıdaki gibi Lark Base'e eklenti olarak yükle.

> Not: Sayfayı düz tarayıcıda açarsan "Bu eklenti Lark Base içinde çalışır" ekranını görürsün —
> bu normaldir. Veri yalnızca Lark'ın içinden geldiğinde görünür.

### Derleme

```bash
npm run build    # dist/ klasörünü üretir
npm run preview  # üretim derlemesini yerelde önizle
```

---

## Lark Base'e yükleme

Eklenti, **açtığın base'in içinde** çalışır (eklentiden başka bir base'e geçilmez —
hangi base'i istiyorsan eklentiyi orada aç).

### A) Geliştirme sırasında hızlı test (localhost)

1. `npm run dev` çalışır durumda olsun (`http://localhost:5173`).
2. Lark Base'te bir tablo aç.
3. Sağ üstteki **Eklentiler / Uzantılar** (puzzle 🧩 simgesi) panelini aç.
4. **Eklenti ekle → Geliştirme / Özel eklenti** (Add extension → Develop) seçeneğine gir.
5. Geliştirme URL'si olarak **`http://localhost:5173`** gir ve ekle.
6. Eklenti sağ panelde açılır; tablo/filtre/alan seç.

> Menü etiketleri Lark sürümüne göre "Extensions", "Plugins", "扩展" veya "Widgets"
> şeklinde olabilir; aradığın şey **özel/geliştirme eklentisi ekleme (URL girme)** adımıdır.
> Bu adımı bulamazsan resmi kılavuz: <https://lark-base-team.github.io/js-sdk-docs/>

### B) Yayınlanmış URL ile (GitHub Pages / Vercel)

Ekibinle paylaşmak için `dist/`'i statik olarak barındır ve o HTTPS URL'sini yukarıdaki
5. adımda gir:

- **Vercel:** repoyu içe aktar → framework "Vite" → deploy. Verilen `https://…vercel.app` URL'sini kullan.
- **GitHub Pages:** `npm run build` sonrası `dist/` içeriğini `gh-pages` dalına koy
  (ya da bir GitHub Actions workflow'u ile). Proje sitesi alt yolda barındığı için
  `vite.config.ts` içinde `base: './'` ayarı bunun için hazırdır.

### C) Kalıcı / kurumsal yayın

Workspace'e ya da mağazaya yayınlamak için Lark Açık Platform (open.larksuite.com)
geliştirici konsolundan bir **Base Extension** oluşturup `dist/`'i yükleyerek onay
akışını izlemen gerekir.

---

## Proje yapısı

```
├── index.html
├── vite.config.ts        # base: './', dev portu 5173
├── tsconfig.json
├── src/
│   ├── main.tsx          # React giriş noktası
│   ├── App.tsx           # tüm arayüz + filtre/çıktı mantığı
│   ├── lark.ts           # @lark-base-open/js-sdk sarmalayıcıları + hücre→metin
│   └── styles.css        # açık/koyu tema stilleri
└── .claude/launch.json   # yerel önizleme yapılandırması (opsiyonel)
```

Genişletme fikirleri: ayarları `bitable.bridge` deposunda saklayıp yeniden açılışta geri
yükleme, veri değişince otomatik yenileme (`table.onRecordModify`), sayı/tarih için özel
biçimlendirme.
