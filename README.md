# 🐺 ASPIRE: WEREWOLF
### *One Village. Many Lies. One Wolf.*

Platform web permainan **Werewolf** online multipemain tanpa login. Permainan dipandu secara otomatis oleh **AI Moderator** (lengkap dengan suara Text-to-Speech bahasa Indonesia) dan **Game Engine**.

---

## ✨ Fitur Utama

- **🚪 Sistem Room Tanpa Login**
  - Pemain cukup memasukkan nama tampilan (display name) tanpa perlu mendaftar atau login akun.
  - Tautan undangan instan (`/?room=CODE`) dan kode room 5 karakter (misal `WOLF-ABCD1`).
- **👑 Kontrol Pemilik Room (Host)**
  - Menentukan komposisi peran (role) dan kuota pemain.
  - Jumlah pemain target dihitung otomatis berdasarkan total kartu peran yang dipilih.
  - Tombol **START GAME** terkunci hingga room **FULL** (semua kursi pemain terisi).
- **🎴 Tampilan Kartu Peran 3D (Secret Role Card)**
  - Begitu permainan dimulai, peran diacak (randomized) oleh Game Engine.
  - Setiap pemain mendapatkan kartu fantasi interaktif (3D Card Flip).
  - Ketuk kartu untuk membuka peran rahasia, melihat kawan serigala, misi kemenangan, dan menyembunyikannya kembali agar tidak diintip pemain lain.
- **🤖 AI Moderator & Game Engine Otomatis**
  - Tidak memerlukan moderator manusia! AI Moderator membacakan narasi dan memandu fase malam, fajar, diskusi, voting, hingga akhir permainan.
  - Suara AI otomatis menggunakan browser Web Speech API bahasa Indonesia.
  - Hasil penyelidikan Seer tampil seketika (real-time) di layar Seer tanpa harus klik next.
  - Bodyguard dilarang melindungi diri sendiri sesuai aturan resmi.
- **⚡ Multiplayer Real-Time (Authoritative Server)**
  - Menggunakan Authoritative WebSocket Server (WSS) dengan PostgreSQL Event Store, Fog of War state masking, dan ticket-based auth.
- **📱 Mode 1 Perangkat (Pass & Play)**
  - Opsi bermain di 1 smartphone atau laptop secara bergantian saat berkumpul bersama.

---

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 (Gothic Dark Werewolf Theme)
- **Networking:** Authoritative WebSocket Server (WSS) + Fog of War Dispatcher
- **Database / Event Store:** PostgreSQL (pg) + Event Sourcing + Command Idempotency
- **State Management:** Zustand (Client UI projection)
- **Speech Engine:** Web Speech API (Voice Synthesis)
- **Deployment:** Vercel

---

## 📦 Menjalankan di Lokal

```bash
# 1. Install dependencies
npm install

# 2. Jalankan server development
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser. Buka tab baru atau bagikan link ke perangkat lain di jaringan untuk bermain bersama.

---

## 🚀 Deployment ke Vercel

Proyek ini telah terhubung ke GitHub di repository `manuelixvivi/warewolf-moderator`.
Setiap `git push` ke branch `main` akan otomatis men-deploy versi terbaru ke Vercel.

---

## 📜 Lisensi
Dikembangkan untuk komunitas pemain Werewolf.
*One Village. Many Lies. One Wolf.*
