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

## Backlog / Remaining
- P1: Layar Search & Community terdedikasi; halaman Info restoran yang lebih kaya.
- P1: Aplikasi merchant (desktop) — kelola menu, pesanan masuk, status meja.
- P2: Pembayaran asli (Stripe/Razorpay) menggantikan mock; promo/referral engine.
- P2: Upload gambar (Object Storage) untuk avatar/menu; realtime tracking (websocket).
- P2: Autentikasi hardening, forgot-password.

## Demo Credentials
- andi@eatly.com / password123
