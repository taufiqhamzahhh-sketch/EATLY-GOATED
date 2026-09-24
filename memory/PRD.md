# EATLY — Product Requirements Document

## Problem Statement
Aplikasi pemesanan makan di tempat (dine-in) berbahasa Indonesia. User memberikan repo GitHub + self-extractor berisi kode EATLY versi lengkap (Phase 2/3), yang diimpor ke workspace ini untuk dilanjutkan pengembangannya.

## Architecture
- Frontend: Expo / React Native (expo-router), React Query + Context, Plus Jakarta Sans.
- Backend: FastAPI + Motor (MongoDB), JWT auth, bcrypt.
- Env: MONGO_URL, DB_NAME (eatly_database), JWT_SECRET di backend/.env; EXPO_PUBLIC_BACKEND_URL di frontend/.env.
- Data auto-seed saat startup (6 restoran, 17 menu, 3 reels, user demo).

## User Personas
- Diner (pelanggan) yang ingin memesan makanan untuk makan di tempat, memilih meja & waktu, membayar (simulasi), melacak pesanan, dan memberi ulasan.

## Core Requirements (static)
- Auth email/password (JWT).
- Discovery: beranda, reels komunitas, pencarian, detail restoran + menu per kategori, ulasan, info.
- Kustomisasi menu (level pedas, pilihan nasi, tambahan) via bottom sheet.
- Keranjang, checkout dine-in, pembayaran simulasi (QRIS/GoPay/Card/Cash), promo tervalidasi server.
- Pelacakan pesanan (paid → preparing → ready → completed) + pembatalan (window 5 detik).
- Ulasan (hanya order selesai), notifikasi in-app.
- Favorit, profil dengan kode referral.

## Implemented (with dates)
- 2026-09-24: Impor proyek lengkap dari self-extractor. Buat ulang .env yang hilang. Backend 21 endpoint aktif.
  - Auth, restaurants, menu, reels, favorites.
  - Orders (validasi harga & opsi server-side, promo, metode bayar), status progression otomatis (background loop 5s), cancel/complete.
  - Reviews (+ agregasi rating restoran), Notifications (list, unread-count, read-all).
  - Frontend screens: checkout, payment-success (QR), order/[id] tracking, review/[id], notifications, +not-found.
  - Verified: testing agent — backend 29/29 pass, frontend E2E 100%.
- 2026-09-24: Sistem Sosial Feed & Reels (food-first, Instagram-like), additive.
  - Backend collections: posts, post_likes, post_saves, comments, comment_likes, follows, reports. ~14 endpoint baru di /api (feed, posts CRUD, like/save, comments+replies+comment-like, follow, social profile, user posts, me/saved, social/search, reports). Notifikasi sosial (like/comment/follow) lewat sistem notifikasi existing. Seed sosial dev (4 kreator, 8 post foto/carousel/video/reel tertaut restoran+menu, follows & komentar seed).
  - Frontend: 5 tab (Beranda, Feed, Reels, Pesanan, Profil; Favorit dipindah ke Profil). Layar baru: (tabs)/feed, (tabs)/reels, post/[id], user/[id], search, saved, create. Komponen: PostCard, PostMediaView (carousel+video+double-tap like), CommentsSheet, PostOptionsSheet, CaptionText (hashtag/mention interaktif), Avatar. Tag restoran/menu → buka halaman Eatly.
  - Verified: testing agent — backend 30/30 sosial + 16/16 regresi pass, frontend E2E semua alur inti pass.
  - Known limitation: upload media biner belum pakai Object Storage (Create pakai galeri kurasi + image-picker perangkat); video Reel seed pakai sample mp4 + poster makanan asli.

## Backlog / Remaining
- P1: Object Storage untuk upload foto/video asli (menggantikan galeri kurasi).
- P1: Feed "For You" personalisasi (saat ini kronologis) berbasis follow/like/kategori.
- P1: Aplikasi merchant (kelola menu, pesanan masuk, status meja).
- P2: Pembayaran asli (Stripe/Razorpay) menggantikan mock; promo/referral engine.
- P2: Upload gambar (Object Storage) untuk avatar/menu; realtime tracking (websocket).
- P2: Autentikasi hardening, forgot-password.

## Demo Credentials
- andi@eatly.com / password123
