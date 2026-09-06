# 🐺 Werewolf Moderator

Alat bantu berbasis web untuk moderator permainan **Werewolf** (Ultimate Werewolf) — dilengkapi narasi AI dan game engine otomatis.

## ✨ Fitur

- **🎭 Setup Permainan** — Pilih role, tentukan jumlah pemain, masukkan nama langsung per role
- **🌙 Night Dashboard** — Semua aksi malam tampil sekaligus (tidak wizard step-by-step)
- **☀️ Day Dashboard** — Narasi otomatis, voting eliminasi, ungkap role
- **? Tooltips** — Setiap role punya tombol `?` dengan deskripsi lengkap (EN)
- **⚡ Game Engine** — Resolusi malam otomatis (kill, protect, investigate)
- **🏹 Triggered Actions** — Hunter, Doppelganger, Wolf Cub ditangani dengan modal
- **📋 82 Role** — Database lengkap dari Werewolf: Ultimate Edition

## 🚀 Deploy

Aplikasi ini di-deploy di [Vercel](https://vercel.com). Setelah push ke GitHub, sambungkan repo ke Vercel.

## 🛠 Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **Zustand** (state management)

## 📦 Instalasi Lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## 🎮 Cara Main

1. **Setup** — Masukkan nama game, pilih tema & gaya narasi, pilih role + jumlah
2. **Nama Pemain** — Input nama untuk setiap role yang dipilih
3. **Malam** — Selesaikan semua aksi malam, klik "Selesaikan Malam"
4. **Siang** — Baca narasi, lakukan voting eliminasi, mulai malam berikutnya
5. **Game Over** — Kondisi menang otomatis terdeteksi

## 📁 Struktur Proyek

```
src/
  app/           # Next.js App Router
  components/
    setup/       # GameSetupScreen, PlayerNameInput
    game/        # NightDashboard, DayDashboard, dll.
    ui/          # RoleCard, Tooltip
  data/
    roles.json   # 82 role database
  lib/
    gameEngine.ts # Game logic
  store/
    gameStore.ts  # Zustand state
  types/
    game.ts       # TypeScript types
```
