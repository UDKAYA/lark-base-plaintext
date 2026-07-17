# Düz Metin Görüntüleyici — Lark Base Eklentisi

Bir Lark Base tablosunda **tablo → görünüm/filtre → seçili alan(lar)** akışıyla veriyi
**ölçeklenebilir düz metin** olarak gösterir. Metnin boyutu, kalınlığı, satır yüksekliği,
harf aralığı, hizalaması, yazı tipi ve rengi kaydırıcılarla ayarlanır.

Teknoloji: **React + TypeScript + Vite** ve resmi **`@lark-base-open/js-sdk`**.

- **Repo:** https://github.com/UDKAYA/lark-base-plaintext
- **Canlı (Lark'a yüklenebilir) URL:** https://udkaya.github.io/lark-base-plaintext/

> Canlı URL'yi düz tarayıcıda açarsan "Bu eklenti Lark Base içinde çalışır" ekranını
> görürsün — bu normaldir. Veri yalnızca eklenti Lark'ın içinden yüklendiğinde gelir.

---

## Özellikler

- **Tablo seçimi** — Base içindeki tüm tablolar (varsayılan: aktif tablo).
- **Görünüm seçimi** — Bir görünüm seçersen o görünümün **Lark'ta tanımlı filtre/sıralaması** uygulanır.
- **Eklenti içi filtre** — Alan + operatör (`içerir`, `eşittir`, `boş`, `>`, `<` …) + değer;
  birden çok koşul **VE / VEYA** ile birleşir.
- **Gösterilecek alanlar** — Bir veya birden çok alan seç.
- **Çıktı** — Kayıt/alan ayracı, alan adını göster, boşları gizle, tekrarları kaldır.
- **Metin görünümü** — Boyut, kalınlık, satır yüksekliği, harf aralığı, hizalama, yazı tipi, renk.
- **Panoya kopyala**.

---

## Geliştirme (yerel)

Gereksinim: Node 18+ (bu proje Node 26 ile geliştirildi).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ üretir
npm run preview  # üretim derlemesini yerelde önizle
```

---

## Lark Base'e yükleme

Eklenti, **açtığın base'in içinde** çalışır — hangi base'i istiyorsan eklentiyi orada aç.

Lark sürümüne göre yükleme **iki yoldan** biriyle olur. Base'inde **Uzantılar / Extensions
(🧩)** panelini aç ve hangisinin geçerli olduğuna bak:

### Yol 1 — URL ile ekleme (klasik "sidebar plugin")

Panelde **özel/geliştirme eklentisi ekleme (URL girme)** seçeneği varsa:

1. Şu HTTPS URL'yi gir: `https://udkaya.github.io/lark-base-plaintext/`
   (ya da yerelde `npm run dev` ardından `http://localhost:5173`)
2. Eklenti sağ panelde açılır; tablo / görünüm / filtre / alan seç.

### Yol 2 — Geliştirici konsolu + resmi CLI çerçevesi (güncel resmi akış)

Panelde yalnızca mağaza eklentileri varsa ve **URL girme seçeneği yoksa**, güncel resmi
çerçeve gereklidir:

1. [open.larksuite.com](https://open.larksuite.com/) → bir **Base Extension** kaydı aç →
   **App ID** + **BlockTypeID** al.
2. Proje `app.json` (appId), `block.json` (blockTypeID + url) ve `debug.json` ile yapılandırılır.
3. `npm run start` Base'i `debugPort` ile açar; tabloda **"yeni görünüm → daha fazla eklenti
   ekle"** ile yerel bileşeni (`blk_...`) eklersin.

> Bu akış gerekiyorsa buradaki React arayüzü (`src/`) **aynen** taşınır; yalnızca iskelet
> dosyaları (`app.json` / `block.json`) eklenir. Resmi kılavuz:
> <https://open.larksuite.com/document/uAjLw4CM/uYjL24iN/base-extensions/>

---

## Lark ana sayfasında gösterme — Base App'e özel eklenti olarak ekleme

Bu eklentiyi Lark'ın ana ekranında **paylaşılabilir bir uygulama** olarak sunmanın yolu,
onu bir **Base App** (no-code uygulama) içine **özel eklenti bloğu (Extension block)**
olarak eklemektir. Ayrı bir backend ya da uygulama kaydı gerekmez — barındırılan URL yeterli.

1. Base'ini bir **Base workspace** içine koy (Base App'ler workspace ister).
2. **Base App oluştur:** Base ana sayfasında **New App**, ya da base içinde sol alttaki
   **App** düğmesiyle mevcut veriden hızlı uygulama.
3. Bir **sayfa** ekle → **Add Block → Extensions → More** → sol altta **Add Custom** →
   servis URL'sini gir: `https://udkaya.github.io/lark-base-plaintext/` → **Confirm**.
4. Eklentiyi yapılandır (tablo / görünüm / filtre / **Current User** / alanlar / metin stili).
5. **App permissions** ile rolleri ayarla; **Share** ile bağlantı/QR ver ve kurum kapsamını
   seç. Uygulama artık ana sayfada / mobilde (Lark 7.59+) açılabilir.

**Kime hangi veri görünür?**
- Eklentinin **Current User** filtresi, her kullanıcıya kendi kayıtlarını gösterir.
- ⚠️ Bu filtre **istemci tarafındadır** (görüntü kolaylığı için); tek başına bir **güvenlik
  sınırı değildir**. Kullanıcıların birbirinin satırını hiç çekememesi gerekiyorsa, veri
  izolasyonunu **Base App rol izinleri** veya base **gelişmiş (satır bazlı) izinleri** ile kur.

---

## Otomatik dağıtım (GitHub Pages)

`.github/workflows/deploy.yml` her `main` push'unda projeyi build alıp GitHub Pages'e
yayınlar. Kod değişince canlı URL kendiliğinden güncellenir.

Alternatif barındırma: **Vercel** (repoyu içe aktar → framework "Vite" → deploy) —
gizli repolar için de çalışır. `vite.config.ts` içindeki `base: './'` ayarı alt yolda
barındırmayı (Pages proje sitesi) destekler.

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
├── .github/workflows/deploy.yml   # Pages otomatik deploy
└── .claude/launch.json   # yerel önizleme yapılandırması (opsiyonel)
```

Genişletme fikirleri: ayarları `bitable.bridge` deposunda saklayıp yeniden açılışta geri
yükleme, veri değişince otomatik yenileme (`table.onRecordModify`), sayı/tarih için özel
biçimlendirme.
