# LasBoard

LasBoard, macOS için Electron + React + TypeScript ile geliştirilmiş basit bir clipboard manager uygulamasıdır. Kopyaladığın metinleri, linkleri, dosya referanslarını ve clipboard'a alınan ekran görüntülerini lokal geçmişte tutar. Bir kayda tıklayınca ya da kopyalama butonuna basınca içerik tekrar clipboard'a yazılır.

## Özellikler

- Metin, link, dosya, image ve screenshot geçmişi
- `All`, `Text`, `Link`, `File`, `Image`, `Screenshots` tab filtreleri
- Arama
- Tekrar kopyalama
- Kopyalanınca `Kopyalandı` toast bildirimi
- Pinleme, silme ve geçmiş temizleme
- Arka planda çalışmaya devam etme
- Global kısayol: `Cmd + Shift + V`
- Lokal SQLite veritabanı

## Gereksinimler

- macOS
- Node.js
- npm

Projeyi geliştirmek için önerilen Node sürümü güncel LTS sürümdür. Native SQLite paketi Electron için yeniden derlendiği için `npm install` sonrası `postinstall` otomatik çalışır.

## Kurulum

Repoyu klonla:

```bash
git clone <repo-url>
cd mac-copy-paste
```

Bağımlılıkları kur:

```bash
npm install
```

Uygulamayı geliştirme modunda çalıştır:

```bash
npm run dev
```

Electron geliştirme modunda Vite renderer server'ı başlatır. Terminalde `localhost` adresi görmen normaldir; uygulamayı tarayıcıdan değil, açılan LasBoard masaüstü penceresinden kullanmalısın.

## Kullanım

LasBoard açıkken metin, link veya dosya kopyala. Kayıtlar listeye otomatik düşer. Bir kaydı yeniden clipboard'a almak için satıra tıkla ya da satırdaki kopyalama butonuna bas.

Tablar:

- `All`: tüm kayıtlar
- `Text`: sadece metinler
- `Link`: URL kayıtları
- `File`: kopyalanan dosya referansları
- `Image`: clipboard image kayıtları
- `Screenshots`: clipboard'a alınan ekran görüntüleri

Screenshot yakalama:

```text
Cmd + Shift + 3
Cmd + Shift + 4
```

macOS bu kısayollarla screenshot'ı genelde masaüstüne dosya olarak kaydeder. LasBoard masaüstünü izler, yeni screenshot dosyasını yakalar, `Screenshots` tabına ekler ve tekrar clipboard'a yazar.

Doğrudan clipboard'a screenshot almak istersen:

```text
Cmd + Ctrl + Shift + 3
Cmd + Ctrl + Shift + 4
```

## Arka Planda Çalışma

Pencereyi kırmızı kapatma butonuyla kapattığında LasBoard tamamen kapanmaz, sadece gizlenir. Clipboard watcher arka planda çalışmaya devam eder.

Tekrar açmak için:

- menubar'daki LasBoard ikonuna tıkla
- veya `Cmd + Shift + V` kısayolunu kullan

Tamamen kapatmak için menubar menüsünden `Quit LasBoard` seç.

## Komutlar

Testleri çalıştır:

```bash
npm run test
```

Lint kontrolü:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

Native Electron modüllerini yeniden derle:

```bash
npm run postinstall
```

## Veri Saklama

LasBoard verileri lokal olarak macOS application support klasöründe saklanır:

```text
~/Library/Application Support/LasBoard/
```

SQLite veritabanı:

```text
~/Library/Application Support/LasBoard/clipboard.sqlite
```

Image/screenshot dosyaları:

```text
~/Library/Application Support/LasBoard/images/
```

## Notlar

- Dosya içerikleri kopyalanmaz; sadece dosya referansları saklanır.
- Sync, hesap sistemi ve iCloud desteği bu MVP kapsamına dahil değildir.
- Uygulama şu an macOS hedeflidir.
