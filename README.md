# Kamar

Desktop Mac ini sekarang adalah satu ruangan yang digambar seperti **komik yang dicetak di kertas tua** (lihat [DESIGN.md](DESIGN.md)). Cahaya di ruangan mengikuti matahari sungguhan. Barang-barangnya ikut hidup: jam dan kalender di dinding, piringan hitam yang sedang diputar, dan si Oren yang tinggal di lantai.

## Isinya

| Bagian | Apa | Di mana |
|---|---|---|
| Wallpaper hidup | Ruangan 3D yang dirender di **Blender** dengan shading cel (5 tingkat cahaya), garis tinta Freestyle, dan grade cetak pudar. Ada ±42 gambar sepanjang hari: pagi cahaya dingin dari jendela timur, sore sinar matahari di karpet dengan debu berkilau, malam lampu belajar dan lampu tumbler. Jam dinding, kalender sobek (lengkap dengan pasaran Jawa), dan sampul lagu Spotify dicetak live di atasnya | `blender/`, `wallpaper/` |
| si Oren | Kucing oren chibi bergaya tinta, satu siluet utuh. Jalan-jalan di atas Dock, tidur kalau kamu tinggal, menepuk-nepuk saat kamu mengetik, mendengkur kalau diklik | `pet/`, `kamar-app/Sources/Pet.swift` |
| Dynamic island | Tab kertas di tengah atas: lagu yang sedang diputar (sampul pixel art dan kontrol), timer fokus, notifikasi ngecas | `kamar-app/Sources/Island.swift` |
| Menu bar | SketchyBar: tag kertas untuk logo, desktop, app aktif, cuaca, baterai, dan jam berbahasa Indonesia | `dotfiles/sketchybar/` |
| Border jendela | Garis tinta di jendela aktif, garis pudar di jendela lain (JankyBorders) | `dotfiles/borders/` |
| Tema app | VS Code (Kertas / Kertas Malam), Ghostty, Spotify (Spicetify), Chrome | `dotfiles/` |

Semua warna berasal dari satu daftar material: [`design/tokens.json`](design/tokens.json).

## Cara pakai

**Island**
- Arahkan kursor ke island untuk membukanya. Saat musik diputar, isinya kontrol lagu. Saat diam, isinya tombol *Fokus 25 / Fokus 50 / Istirahat 5*.
- Klik island saat diam (atau klik kanan kapan saja) untuk membuka menu.
- Saat ada jendela yang dimaksimalkan, island yang sedang diam turun ke belakang jendela, sama seperti bar. Island maju lagi kalau ada lagu baru, notifikasi, atau timer selesai.

**si Oren**
- Klik untuk mengelus (dia mendengkur). Seret untuk mengangkatnya, lalu lepas dan dia jatuh ke lantai.
- Saat kamu mengetik, dia menepuk-nepuk. Kalau Mac tidak disentuh 2 menit, dia tidur, lalu bangun sambil meregang.
- Menu kucing → *Panggil si Oren* membuatnya berjalan ke arah kursor.

**Menu Kamar**: klik ikon kucing di menu bar macOS (gerakkan kursor ke tepi atas) untuk timer, menyalakan atau mematikan wallpaper, si Oren, island, atau keluar.

**Dari Terminal, Raycast, atau Shortcuts**:
```sh
open -g kamar://focus/25     # fokus 25 menit
open -g kamar://rest/5       # istirahat 5 menit
open -g kamar://stop         # hentikan timer
open -g kamar://pet/come     # panggil si Oren
open -g kamar://playpause    # play / pause musik
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
- **si Oren dan ikon bar**: `pet/poses.js` dan `bar/icons.js`, lalu `node scripts/render-assets.mjs`.

## Tema yang perlu satu langkah manual

**Chrome** hanya mau memuat tema lokal secara manual. Buka `chrome://extensions`, nyalakan *Developer mode*, klik *Load unpacked*, lalu pilih `dotfiles/chrome/kertas-theme`. Tab baru akan menampilkan ruanganmu.

## Izin

- **Tidak** butuh Accessibility, Input Monitoring, atau Screen Recording. Reaksi mengetik si Oren cukup membaca "berapa detik sejak tombol terakhir ditekan".
- Spotify/Music: macOS akan bertanya sekali *"Kamar ingin mengontrol Spotify"* saat island pertama kali membaca lagu atau menekan play/pause. Pilih **OK**.

## Membatalkan semuanya

```sh
./uninstall.sh
```
Perintah ini mengembalikan menu bar, warna aksen, wallpaper lama, setelan VS Code, dan Spotify asli, mematikan bar dan border, serta menghapus app Kamar. Config lamamu disimpan di `~/.kamar/backup` selama Kamar terpasang. Paket Homebrew tetap ada; hapus dengan `brew bundle cleanup --file=Brewfile --force` kalau mau.

## Catatan teknis

- Command Line Tools di Mac ini menyimpan `usr/include/swift/module.modulemap` lama yang membuat `swiftc` gagal. `kamar-app/build.sh` menyembunyikannya lewat VFS overlay, jadi tidak perlu sudo. Perbaikan permanennya adalah memasang ulang Command Line Tools.
- Setelah Spotify update, jalankan `spicetify backup apply` sekali lagi.
- Kalau menu bar macOS masih terlihat: System Settings → Control Center → *Automatically hide and show the menu bar* → **Always**.
- Wallpaper hanya digambar ulang kalau cahayanya berubah. Di malam hari ruangan statis dan hanya jarum jam yang bergerak. Debu di sinar matahari hanya beranimasi saat sore.
