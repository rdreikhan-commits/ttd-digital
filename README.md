# BPM ITG E-SIGN 2026 (Pure JavaScript Edition)

Aplikasi web **BPM ITG E-SIGN 2026** adalah sistem tanda tangan elektronik dan verifikasi dokumen resmi untuk **Badan Perwakilan Mahasiswa (BPM) Institut Teknologi Garut periode 2026**.

Dibuat dengan **JavaScript Murni (Vanilla JS + Express.js)** yang super ringan, cepat, dan mudah dipahami.

---

## 📁 Struktur Project Super Bersih

```
bpm-itg-esign/
├── server.js              # Server Node.js (Express.js & PDF processing)
├── package.json           # Dependencies utama (express, pdf-lib, qrcode, multer)
├── db.json                # Database penyimpanan sederhana (JSON Store)
├── public/                # Halaman Web & Storage
│   ├── index.html         # Frontend Utama (Vanilla JS + Tailwind CSS)
│   ├── verify.html        # Halaman Verifikasi Publik
│   ├── uploads/           # File PDF Asli
│   ├── signed/            # File PDF Ditandatangani
│   └── signatures/        # File Gambar Signature
└── README.md
```

---

## 🚀 Cara Menjalankan

1. **Install Dependencies** (jika pertama kali):
   ```bash
   npm install
   ```

2. **Jalankan Server**:
   ```bash
   node server.js
   ```

3. **Akses Browser**:
   Buka **[http://localhost:3000](http://localhost:3000)**
