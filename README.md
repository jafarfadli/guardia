# Guardia

Desktop Mac ini sekarang adalah satu ruangan yang digambar seperti **komik yang dicetak di kertas tua** (lihat [DESIGN.md](DESIGN.md)). Cahaya di ruangan mengikuti matahari sungguhan. Barang-barangnya ikut hidup: jam dan kalender di dinding, piringan hitam yang sedang diputar, dan Maestro, kucing oren yang tinggal di lantai.

## Isinya

| Bagian | Apa | Di mana |
|---|---|---|
| Wallpaper hidup | Ruangan 3D yang dirender di **Blender** dengan shading cel (5 tingkat cahaya), garis tinta Freestyle, dan grade cetak pudar. Ada 42 gambar sepanjang hari: pagi cahaya dingin dari jendela timur, sore berkas sinar matahari masuk lewat jendela sampai ke karpet dengan debu berkilau di dalamnya, malam lampu belajar yang berpendar dan lampu tumblr. Jam dinding, kalender sobek (lengkap dengan pasaran Jawa), dan sampul lagu Spotify dicetak live di atasnya | `blender/`, `wallpaper/` |
| Maestro | Kucing oren chibi bergaya tinta, satu siluet utuh. Jalan-jalan di atas Dock di setiap desktop (tidak ikut ke app layar penuh), tidur kalau kamu tinggal, menepuk-nepuk saat kamu mengetik, mendengkur kalau diklik. Saat mode fokus, dia menjaga Chrome | `pet/`, `guardia-app/Sources/Pet.swift` |
| Dynamic island | Tab kertas di tengah atas: jam dan baterai, dengan lagu atau timer di tengahnya. Klik untuk membuka menu dan pencarian: Claude Code, VS Code, Spotify, Timer, Alarm, Mode fokus | `guardia-app/Sources/Island.swift`, `Launcher.swift` |
| Border jendela | Garis tinta di jendela aktif, garis pudar di jendela lain (JankyBorders) | `dotfiles/borders/` |
| Tema app | VS Code (Kertas / Kertas Malam), Ghostty, Spotify (Spicetify), Chrome | `dotfiles/` |

Semua warna berasal dari satu daftar material: [`design/tokens.json`](design/tokens.json).

## Cara pakai

**Island**
- Dalam keadaan kecil, island menampilkan jam dan baterai. Lagu yang diputar atau timer yang berjalan muncul di antaranya.
- Arahkan kursor ke island saat lagu diputar untuk kontrol lagu, atau saat timer berjalan untuk tombol berhenti.
- **Klik island** untuk membuka menu. Pilih dengan ↑↓ lalu Enter, atau langsung ketik untuk mencari. Esc untuk kembali atau menutup. Setiap menu menanyakan satu hal saja:
  - **Claude Code** → pilih folder di `~/Koding` (atau Home). Terminal Ghostty baru terbuka dan langsung menjalankan `claude`.
  - **VS Code** → pilih folder di `~/Koding`, lalu folder itu terbuka di VS Code. ⌘↵ membuka Claude Code di folder itu.
  - **Spotify**: *Putar / Jeda*, *Lagu berikutnya*, dan judul lagu apa saja untuk dicari di Spotify. Tempel link playlist Spotify untuk menyimpannya sebagai favorit; berikutnya cukup ketik namanya.
  - **Timer** → ketik jumlah menit, boleh dengan label (`10`, `25 masak`), atau pilih 5–60 menit.
  - **Alarm** → ketik jamnya, boleh dengan label (`6.30`, `7.30 bangun`). Alarm yang sudah dipasang bisa dihapus dari sini.
  - **Mode fokus** → ketik jumlah menit atau pilih 25, 50, 90 (lihat Maestro di bawah).
  - Saat timer atau alarm berbunyi, island membesar dengan tombol tunda atau matikan.
  - Mengetik nama project langsung dari menu utama juga bisa: Enter membuka VS Code, ⌘↵ membuka Claude Code.
- Klik kanan island untuk menu.
- Saat ada jendela yang dimaksimalkan, island yang sedang diam turun ke belakang jendela. Island maju lagi kalau ada lagu baru, notifikasi, alarm, atau timer selesai.

**Maestro**
- Klik untuk mengelus (dia mendengkur). Seret untuk mengangkatnya, lalu lepas dan dia jatuh ke lantai.
- Saat kamu mengetik, dia menepuk-nepuk. Kalau Mac tidak disentuh 2 menit, dia tidur, lalu bangun sambil meregang.
- Menu kucing → *Panggil Maestro* membuatnya berjalan ke arah kursor.
- **Mode fokus:** kalau tab Chrome yang sedang kamu lihat adalah Instagram, TikTok, YouTube, atau X, Maestro berlari ke sana, melompat ke tab itu, dan menunggu 5 detik. Klik *biarin* di island untuk mengizinkan situs itu 10 menit (atau tarik Maestro dari tab-nya). Kalau tidak, tab itu dia cakar sampai tertutup.

**Menu Guardia**: klik ikon kucing di menu bar macOS (gerakkan kursor ke tepi atas) untuk mode fokus, menyalakan atau mematikan wallpaper, Maestro, island, atau keluar.

**Dari Terminal, Raycast, atau Shortcuts**:
```sh
open -g guardia://search          # buka menu island
open -g guardia://focus/25        # mode fokus 25 menit
open -g guardia://rest/5          # istirahat 5 menit
open -g guardia://stop            # hentikan timer dan mode fokus
open -g guardia://pet/come        # panggil Maestro (pet/on, pet/off)
open -g guardia://wallpaper/off   # matikan wallpaper (wallpaper/on)
open -g guardia://playpause       # play / pause musik
open -g guardia://status          # tulis keadaan app ke ~/.guardia/status.json
```

## Mengubah sesuatu

- **Warna dan font**: edit `design/tokens.json`, lalu jalankan `node scripts/build-themes.mjs && ./install.sh`.
- **Lokasi matahari**: `location` di `design/tokens.json` (bawaan: Jakarta).
- **Ruangan**: dibangun lewat script di `blender/kamar/` (`room.py`, `props.py`, `lights.py`). File `blender/kamar.blend` bisa dibuka langsung di Blender untuk dilihat atau diutak-atik. Setelah mengubah script:
  ```sh
  blender -b --factory-startup --python blender/build.py -- --scale 0.5 --phase 1.53 --out build/blender/coba.png   # uji satu gambar
  blender -b --factory-startup --python blender/render.py -- --scale 1.0 --save                                       # render ulang sehari penuh (±20 menit)
  node scripts/preview.mjs --times 07:30,16:30,21:00                                                                  # lihat hasil akhirnya di build/preview/
  ```
- **Maestro**: `pet/poses.js`, lalu `node scripts/render-assets.mjs`.

## Tema yang perlu satu langkah manual

**Chrome** hanya mau memuat tema lokal secara manual. Buka `chrome://extensions`, nyalakan *Developer mode*, klik *Load unpacked*, lalu pilih `dotfiles/chrome/kertas-theme`. Tab baru akan menampilkan ruanganmu.

## Izin

- **Tidak** butuh Accessibility, Input Monitoring, atau Screen Recording. Reaksi mengetik Maestro cukup membaca "berapa detik sejak tombol terakhir ditekan".
- macOS akan bertanya sekali untuk tiap app yang dikendalikan island. Pilih **OK**:
  - *"Guardia ingin mengontrol Spotify"*: saat island pertama kali membaca lagu atau menekan play/pause.
  - *"Guardia ingin mengontrol Ghostty"*: saat pertama kali membuka Claude Code.
  - *"Guardia ingin mengontrol Google Chrome"*: saat pertama kali mode fokus melihat tab Chrome. Chrome hanya dibaca selama mode fokus dan saat Chrome ada di depan.

## Membatalkan semuanya

```sh
./uninstall.sh
```
Perintah ini mengembalikan menu bar, warna aksen, wallpaper lama, setelan VS Code, dan Spotify asli, mematikan border, serta menghapus app Guardia. Config lamamu disimpan di `~/.guardia/backup` selama Guardia terpasang. Paket Homebrew tetap ada; hapus dengan `brew bundle cleanup --file=Brewfile --force` kalau mau.

## Catatan teknis

- Command Line Tools di Mac ini menyimpan `usr/include/swift/module.modulemap` lama yang membuat `swiftc` gagal. `guardia-app/build.sh` menyembunyikannya lewat VFS overlay, jadi tidak perlu sudo. Perbaikan permanennya adalah memasang ulang Command Line Tools.
- Setelah Spotify update, jalankan `spicetify backup apply` sekali lagi.
- Kalau menu bar macOS masih terlihat: System Settings → Control Center → *Automatically hide and show the menu bar* → **Always**.
- Wallpaper hanya digambar ulang kalau cahayanya berubah. Di malam hari ruangan statis dan hanya jarum jam yang bergerak. Debu di sinar matahari hanya beranimasi saat sore.
