# Guardia

Desktop Mac ini sekarang adalah satu ruangan yang digambar seperti **komik yang dicetak di kertas tua** (lihat [DESIGN.md](DESIGN.md)). Cahaya di ruangan mengikuti matahari dan cuaca sungguhan di tempatmu. Kamarnya kecil dan dilihat dari dekat, supaya yang penting terbaca dari seberang layar. Barang-barangnya ikut hidup: catatanmu dan kotak-kotak hijau GitHub di papan tulis, kalender sobek, sesi Claude di layar komputer, jarum baterai, lampu lalu lintas yang menunjukkan seberapa sibuk Mac, foto-fotomu di rak, piringan hitam yang sedang diputar, dan Maestro, kucing oren yang tinggal di lantai.

## Isinya

| Bagian | Apa | Di mana |
|---|---|---|
| Wallpaper hidup | Ruangan 3D yang dirender di **Blender** dengan shading cel (5 tingkat cahaya), garis tinta Freestyle yang dicetak paling akhir (tidak tertutup kabut berkas cahaya), dan grade cetak pudar. Ada 42 gambar sepanjang hari: pagi cahaya dingin dari jendela timur, sore berkas sinar matahari masuk lewat jendela sampai ke karpet dengan debu berkilau di dalamnya, malam lampu belajar yang berpendar dan lampu tumblr. Ditambah 6 gambar mendung untuk hari berawan atau hujan: tanpa berkas cahaya, ruangan sejuk. Kalender sobek (lengkap dengan pasaran Jawa), sampul lagu Spotify, foto-foto di rak, dan widget-widget kamar dicetak live di atasnya (lihat **Kamar** di bawah) | `blender/`, `wallpaper/` |
| Maestro | Kucing oren chibi bergaya tinta, satu siluet utuh. Jalan-jalan di lantai di setiap desktop (disembunyikan saat ada app layar penuh di depan), tidur kalau kamu tinggal, menepuk-nepuk saat kamu mengetik, mendengkur kalau diklik. Saat mode fokus, dia menjaga Chrome | `pet/`, `guardia-app/Sources/Pet.swift` |
| Dynamic island | Tab kertas di tengah atas: jam, dengan lagu atau timer di sampingnya; baterai hanya muncul saat tinggal ≤20% dan tidak dicas. Klik untuk membuka menu dan pencarian: Claude Code, Catatan, Rak foto, VS Code, Spotify, Timer, Alarm, Mode fokus | `guardia-app/Sources/Island.swift`, `Launcher.swift` |
| Border jendela | Garis tinta di jendela aktif, garis pudar di jendela lain (JankyBorders) | `dotfiles/borders/` |
| Tema app | VS Code (Kertas / Kertas Malam), Ghostty, Spotify (Spicetify), Chrome | `dotfiles/` |
| Ikon app | 29 app (WhatsApp, LINE, Telegram, Discord, Office, VS Code, Chrome, Unity, Blender, Spotify, Roblox, dan lainnya) digambar ulang sebagai kartu kertas bertinta; Dock dikelompokkan: sistem · sosial · kerja · hiburan | `icons/`, `scripts/app-icons.sh` |

Semua warna berasal dari satu daftar material: [`design/tokens.json`](design/tokens.json).

## Cara pakai

**Island**
- Dalam keadaan kecil, island menampilkan jam. Lagu yang diputar atau timer yang berjalan muncul di sampingnya. Baterai Mac baru ikut tampil saat tinggal 20% atau kurang dan tidak sedang dicas (selebihnya baterai ada di jarum di kamar).
- Arahkan kursor ke island saat lagu diputar untuk kontrol lagu, atau saat timer berjalan untuk tombol berhenti.
- **⌃Space** (Control + Spasi) dari mana saja, termasuk dari aplikasi layar penuh, membuka menu island; tekan lagi atau Esc untuk menutup.
- Saat island tertutup jendela atau kamu di layar penuh, **dorong kursor ke tepi atas tengah layar**: island maju ke depan selama kursor di sana.
- **Klik island** untuk membuka menu. Pilih dengan ↑↓ lalu Enter, atau langsung ketik untuk mencari. Esc untuk kembali atau menutup. Setiap menu menanyakan satu hal saja:
  - **Claude Code** → pilih folder di `~/Koding` (atau Home). Terminal Ghostty baru terbuka dan langsung menjalankan `claude`.
  - **Catatan** → halaman bergaris untuk menulis catatan. Satu baris satu poin. Awali dengan `- ` untuk butir, `x ` untuk yang sudah selesai (dicoret), `# ` untuk judul. Esc untuk selesai. Isinya langsung tertulis dengan kapur di papan tulis kamar, dan disimpan di `~/.guardia/notes.txt`.
  - **Rak foto** → pilih bingkai (1–5), Enter untuk memilih foto, ⌘↵ untuk mengembalikan gambar bawaannya. Bisa juga menyeret file foto langsung ke island: foto masuk ke bingkai yang kosong, atau ke bingkai di bawah kursor kalau daftar Rak foto sedang terbuka. Foto dipotong pas bingkai dan sedikit dipudarkan supaya menyatu dengan kamar; salinannya disimpan di `~/.guardia/photos`.
  - **VS Code** → pilih folder di `~/Koding`, lalu folder itu terbuka di VS Code. ⌘↵ membuka Claude Code di folder itu. Baris paling atas, **Folder baru**, meminta nama, membuat foldernya di `~/Koding` (lengkap dengan ikon kertasnya), lalu membukanya di VS Code (⌘↵: di Claude Code).
  - **Spotify**: *Putar / Jeda*, *Lagu berikutnya*, dan judul lagu apa saja untuk dicari di Spotify. Tempel link playlist Spotify untuk menyimpannya sebagai favorit; berikutnya cukup ketik namanya.
  - **Timer** → ketik jumlah menit, boleh dengan label (`10`, `25 masak`), atau pilih 5–60 menit.
  - **Alarm** → ketik jamnya, boleh dengan label (`6.30`, `7.30 bangun`). Alarm yang sudah dipasang bisa dihapus dari sini.
  - **Mode fokus** → ketik jumlah menit atau pilih 25, 50, 90 (lihat Maestro di bawah).
  - Saat timer atau alarm berbunyi, island membesar dengan tombol tunda atau matikan.
  - Mengetik nama project langsung dari menu utama juga bisa: Enter membuka VS Code, ⌘↵ membuka Claude Code.
- Klik kanan island untuk menu.
- Saat ada jendela yang dimaksimalkan atau aplikasi layar penuh, island yang sedang diam turun ke belakang supaya tidak menutupi judul jendela. Island maju lagi kalau ada lagu baru, notifikasi, alarm, atau timer selesai, atau saat kamu memanggilnya (⌃Space, tepi atas).

**Maestro**
- Klik untuk mengelus (dia mendengkur). Seret untuk mengangkatnya, lalu lepas dan dia jatuh ke lantai.
- Saat kamu mengetik, dia menepuk-nepuk. Kalau Mac tidak disentuh 2 menit, dia tidur, lalu bangun sambil meregang.
- Menu kucing → *Panggil Maestro* membuatnya berjalan ke arah kursor.
- **Mode fokus:** begitu tab Chrome yang sedang kamu lihat adalah Instagram, TikTok, YouTube, atau X, Maestro melompat ke tab itu dan langsung mencakarnya sampai tertutup, kira-kira sedetik. Island memberi tahu situs apa yang ditutup. Kalau Maestro sedang tidak terlihat (dimatikan, atau Chrome dalam layar penuh), tabnya langsung ditutup tanpa lompatan.

**Kamar** (widget di wallpaper)
- **Papan tulis** besar di atas meja, ditulis dengan kapur:
  - kiri: catatan dari island (kalau kosong, ada gambar Maestro tidur);
  - kanan, di balik garis kapur: kotak-kotak hijau GitHub 13 minggu terakhir, sama seperti grafik kontribusi di github.com tapi berdiri. Satu baris satu minggu (terlama di atas), satu kolom satu hari (Minggu dulu), nama bulan di kiri, hari ini dilingkari. Makin hijau terang, makin banyak kontribusinya; tingkatnya diambil langsung dari GitHub (akun yang login di `gh`). Diperbarui tiap 30 menit.
  - Commit ke **repo privat** hanya terhitung kalau di GitHub kamu menyalakan Settings → Public profile → **Include private contributions on my profile**. Tanpa itu, grafik publik dan papan ini tidak melihatnya, walaupun github.com menampilkannya untukmu saat kamu login.
- **Kalender sobek** di samping papan: tanggal, hari, dan pasaran.
- **Layar komputer**: sesi Claude Code yang Remote Control-nya menyala. Titik **hijau** berarti sedang bekerja, **merah** berarti diam atau menunggu kamu. Kalau tidak ada sesi Remote Control, layar menampilkan kode seperti biasa.
- **Panel jarum** di dinding ujung kanan meja: baterai MAC, IPHONE, AIRPODS, dan satu lagi (iPad, Magic Mouse, Keyboard, atau Trackpad). Perangkat yang tidak tersambung jarumnya diam di bawah nol. Petir kecil berarti sedang dicas; angka merah berarti ≤20%.
  - AirPods dan aksesori Bluetooth terbaca saat tersambung ke Mac.
  - iPhone/iPad terbaca lewat kabel, atau lewat Wi-Fi setelah disiapkan sekali: colok iPhone ke Mac, pilih **Trust**, lalu di Finder pilih iPhone-nya dan centang **Show this iPhone when on Wi-Fi**. Setelah itu cukup satu jaringan Wi-Fi.
- **Rak foto** di kanan: lima bingkai berisi foto pilihanmu (lihat *Rak foto* di island), di antara sirih gading, buku, kucing keramik, dan lilin. Sebelum kamu memilih, bingkainya berisi gambar.
- **Lemari piringan hitam** di bawah rak foto: sampul lagu Spotify yang sedang diputar berdiri di atasnya, di samping pemutar piringan hitam.
- **Lampu lalu lintas** di rak paling atas: seberapa sibuk Mac. Hijau = santai, kuning = sibuk (prosesor di atas 60%, memori mulai sesak, atau mulai panas), merah = berat (prosesor di atas 85%, memori kritis, atau panas).
- **Jendela**: cuaca sungguhan di lokasi Mac (dari Open-Meteo). Cerah, berawan sebagian (awan lewat), mendung (ruangan sejuk tanpa berkas cahaya), hujan (hujan turun dan tetesan di kaca), badai (sesekali kilat), kabut. Malam yang cerah ada bintang.

**Menu Guardia**: klik ikon kucing di menu bar macOS (gerakkan kursor ke tepi atas) untuk mode fokus, menyalakan atau mematikan Maestro dan island, atau keluar. *Wallpaper hidup* yang dimatikan tidak mengembalikan wallpaper lama: ruangan dibekukan menjadi gambar diam dari saat itu (di semua Space, dan juga jadi gambar layar kunci), dan memori untuk halaman hidupnya dilepas.

**Dari Terminal, Raycast, atau Shortcuts**:
```sh
open -g guardia://search          # buka menu island
open -g guardia://focus/25        # mode fokus 25 menit
open -g guardia://rest/5          # istirahat 5 menit
open -g guardia://stop            # hentikan timer dan mode fokus
open -g guardia://pet/come        # panggil Maestro (pet/on, pet/off)
open -g guardia://wallpaper/off   # bekukan wallpaper jadi gambar diam (wallpaper/on untuk hidup lagi)
open -g guardia://playpause       # play / pause musik
open -g guardia://status          # tulis keadaan app ke ~/.guardia/status.json
open -g guardia://weather/rain    # coba cuaca di jendela (clear, partly, cloudy, rain, storm, fog) sampai laporan cuaca berikutnya
```

## Mengubah sesuatu

- **Warna dan font**: edit `design/tokens.json`, lalu jalankan `node scripts/build-themes.mjs && ./install.sh`.
- **Lokasi** (matahari dan cuaca): diambil dari lokasi Mac lewat Location Services. Kalau izinnya ditolak, dipakai `location` di `design/tokens.json` (bawaan: Jakarta). Ke layanan cuaca hanya dikirim posisi yang dibulatkan (±10 km).
- **Ruangan**: dibangun lewat script di `blender/kamar/` (`room.py`, `props.py`, `lights.py`). File `blender/kamar.blend` bisa dibuka langsung di Blender untuk dilihat atau diutak-atik. Setelah mengubah script:
  ```sh
  blender -b --factory-startup --python blender/build.py -- --scale 0.5 --phase 1.53 --out build/blender/coba.png   # uji satu gambar
  blender -b --factory-startup --python blender/render.py -- --scale 1.0 --save                                       # render ulang sehari penuh, cerah dan mendung (±1,5 jam)
  blender -b --factory-startup --python blender/masks.py                                                             # mask widget dan jendela (setelah benda dipindah)
  node scripts/preview.mjs --times 07:30,16:30,21:00                                                                  # lihat hasil akhirnya di build/preview/
  node scripts/preview.mjs --times 21:00 --query "demo=1&weather=rain"                                                # dengan widget contoh dan hujan
  ```
- **Maestro**: `pet/poses.js`, lalu `node scripts/render-assets.mjs`.

## Ikon app

```sh
./scripts/app-icons.sh apply     # gambar dan pasang ikon, rapikan Dock per kelompok
./scripts/app-icons.sh restore   # ikon asli dan urutan Dock lama kembali
```
- Jalankan dari Ghostty. App milik sistem (dari App Store: WhatsApp, LINE, Telegram, Office, CapCut, Jump Desktop, plus Tailscale dan Zoom) meminta password Mac sekali.
- Kalau macOS bilang Ghostty *"was prevented from modifying apps"*, nyalakan Ghostty di System Settings → Privacy & Security → App Management (jendelanya dibuka otomatis), lalu jalankan lagi.
- App yang update sendiri bisa kembali ke ikon aslinya. Guardia memberi tahu lewat island, dan baris *Pasang ulang ikon app* di pencarian island menjalankan perintah ini lagi.
- Folder ikut berganti jadi map kertas manila:
  - folder bawaan (Desktop, Documents, Downloads, Pictures, Movies, Music, Public, Applications, bin, Koding) diberi cap tinta;
  - folder lain di Koding, di Desktop, dan di folder rumah diberi stiker warna berisi inisialnya.

  Ikon folder tersimpan sebagai file tersembunyi `Icon\r` di dalam folder. File itu sudah dimasukkan ke gitignore global, jadi tidak muncul di `git status`. Folder baru di Koding, Desktop, dan folder rumah langsung mendapat ikonnya sendiri (Guardia mengawasinya), termasuk saat namanya diganti. Untuk Desktop, Guardia perlu izin sekali: *Guardia ingin mengakses folder Desktop* → **Izinkan**.
- Gambarnya ada di `icons/emblems.js` (satu fungsi per app) dan `icons/folders.js`. Ubah, lalu jalankan `apply` lagi.

## Tema yang perlu satu langkah manual

**Chrome** hanya mau memuat tema lokal secara manual. Buka `chrome://extensions`, nyalakan *Developer mode*, klik *Load unpacked*, lalu pilih `dotfiles/chrome/kertas-theme`. Tab baru akan menampilkan ruanganmu.

## Izin

- **Tidak** butuh Accessibility, Input Monitoring, atau Screen Recording. Reaksi mengetik Maestro cukup membaca "berapa detik sejak tombol terakhir ditekan".
- macOS akan bertanya sekali untuk tiap app yang dikendalikan island. Pilih **OK**:
  - *"Guardia ingin mengontrol Spotify"*: saat island pertama kali membaca lagu atau menekan play/pause.
  - *"Guardia ingin mengontrol Ghostty"*: saat pertama kali membuka Claude Code.
  - *"Guardia ingin mengontrol Google Chrome"*: saat pertama kali mode fokus melihat tab Chrome. Chrome hanya dibaca selama mode fokus dan saat Chrome ada di depan.
- Untuk widget kamar, macOS bertanya sekali:
  - *"Guardia ingin menggunakan lokasi Anda"*: untuk cuaca dan posisi matahari. Kalau ditolak, dipakai Jakarta.
  - *"Guardia ingin menggunakan Bluetooth"*: untuk baterai AirPods dan aksesori.

## Membatalkan semuanya

```sh
./uninstall.sh
```
Perintah ini mengembalikan menu bar, warna aksen, wallpaper lama, setelan VS Code, dan Spotify asli, mematikan border, serta menghapus app Guardia. Config lamamu disimpan di `~/.guardia/backup` selama Guardia terpasang. Paket Homebrew tetap ada; hapus dengan `brew bundle cleanup --file=Brewfile --force` kalau mau.

## Catatan teknis

- Command Line Tools di Mac ini menyimpan `usr/include/swift/module.modulemap` lama yang membuat `swiftc` gagal. `guardia-app/build.sh` menyembunyikannya lewat VFS overlay, jadi tidak perlu sudo. Perbaikan permanennya adalah memasang ulang Command Line Tools.
- Setelah Spotify update, jalankan `spicetify backup apply` sekali lagi.
- Kalau menu bar macOS masih terlihat: System Settings → Control Center → *Automatically hide and show the menu bar* → **Always**.
- Wallpaper digambar ulang sekali semenit, dan saat sebuah widget berubah. Gambar tiap widget disimpan, jadi yang tidak berubah tidak digambar lagi. Debu di sinar matahari hanya beranimasi saat sore; hujan di jendela adalah kanvas kecil yang hanya bergerak saat hujan (diam saat Mac pakai baterai, dan berhenti sendiri saat desktop tertutup jendela).
- Garis-garis halus yang dulu kadang muncul di wallpaper (ronde 6) ternyata dari butiran film: rumus acaknya kehabisan presisi setelah wallpaper menyala beberapa menit. Rumusnya sudah diganti.
- Saat *Wallpaper hidup* dimatikan, ruangan beku menjadi gambar diam, termasuk widget-widgetnya. Nyalakan lagi supaya catatan, baterai, dan lainnya ikut berubah.
- Daftar sesi Claude dibaca dari `~/.claude/sessions/`, catatan internal Claude Code, bukan format yang dijanjikan. Kalau versi Claude Code berikutnya mengubahnya, layar kembali menampilkan kode saja.
