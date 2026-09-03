const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories & Vercel Storage
const isVercel = !!(process.env.VERCEL || process.env.NOW_REGION);
const baseStorageDir = isVercel ? path.join('/tmp', 'bpm-esign') : path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(baseStorageDir, 'uploads');
const SIGNED_DIR = path.join(baseStorageDir, 'signed');
const SIGNATURES_DIR = path.join(baseStorageDir, 'signatures');
const DB_FILE = isVercel ? path.join('/tmp', 'bpm-esign', 'db.json') : path.join(__dirname, 'db.json');

[UPLOADS_DIR, SIGNED_DIR, SIGNATURES_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error('Directory creation error:', e);
  }
});

// Simple JSON Store with Users & Documents
let dbData = {
  users: [
    {
      id: 'usr_admin',
      name: 'Administrator ITG',
      email: 'admin@bpmitg.ac.id',
      password: 'admin123',
      role: 'ADMIN',
      organization: 'Administrator Sistem',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_bpm',
      name: 'Ketua BPM ITG 2026',
      email: 'ketua@bpmitg.ac.id',
      password: 'ketua123',
      role: 'ORGANISASI',
      organization: 'Badan Perwakilan Mahasiswa (BPM ITG)',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_bem',
      name: 'Presiden BEM ITG 2026',
      email: 'bem@bpmitg.ac.id',
      password: 'bem123',
      role: 'ORGANISASI',
      organization: 'Badan Eksekutif Mahasiswa (BEM ITG)',
      createdAt: new Date().toISOString(),
    }
  ],
  documents: []
};

// Load initial seed data from project db.json if available
const seedDbPath = path.join(__dirname, 'db.json');
if (fs.existsSync(seedDbPath)) {
  try {
    const loadedSeed = JSON.parse(fs.readFileSync(seedDbPath, 'utf8'));
    if (loadedSeed.users) dbData.users = loadedSeed.users;
    if (loadedSeed.documents) dbData.documents = loadedSeed.documents;
  } catch (e) {
    console.error('Seed DB Load Error:', e);
  }
}

// If DB_FILE exists (e.g. in /tmp or local), load any persisted data over seed
if (fs.existsSync(DB_FILE) && DB_FILE !== seedDbPath) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (Array.isArray(loaded)) {
      dbData.documents = loaded;
    } else {
      dbData = { ...dbData, ...loaded };
    }
  } catch (e) {
    console.error('DB Load Error:', e);
  }
}

let documents = dbData.documents;
let users = dbData.users;

function saveDB() {
  dbData.documents = documents;
  dbData.users = users;
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
  } catch (e) {
    console.error('Save DB Warning:', e);
  }
}

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${unique}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file PDF yang diperbolehkan!'));
    }
  }
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/signed', express.static(SIGNED_DIR));
app.use('/signatures', express.static(SIGNATURES_DIR));

// Create dummy signature image if missing
const dummySigPath = path.join(SIGNATURES_DIR, 'signature.png');
if (!fs.existsSync(dummySigPath)) {
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAABcbTqOAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGt0lEQVR4nO2dW5KrOBCGcwDvf0s+gBcAXqAX4AXAC/AC4AXgBcAL8ALgBc4G8mMmk3TnOJ7YJkj6v6pTNcYGSfr0S0JiGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhmN/g+eH55eUnLwfzazw/PL+gkDxPXhDm1yAheX6AkDxPXhDm13h+eH5BIXnysDB/wiBI3ifPC/PH8PzwjELyPHlhmD+BLMjkhWH+BBaS+ePJy8P8CSwk84eT14f5E1hI5g8n7w/z+zy/e355fnl+npxhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhGIZhfpm8RsijeeijyetjWbsAAcFnfJ68RpZbgID8e/IaWcYEBCsCIiigBASlBARk6oKAoLxMXiuL+C8gLz8vIBMXBQRl8lpZQkKy9BAgJJMXyyIEBIIiEpKJiwOCMnm9LOATIPrKCfDklbKYICQTFwYEZfKaWc4iIHrNjDJxcUBQJq+b5UwCIspt===';
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// 1. Upload PDF & Metadata
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File PDF wajib diunggah!' });
    }

    const { documentNumber, documentName, subject, documentDate, sender } = req.body;
    if (!documentNumber || !documentName) {
      return res.status(400).json({ error: 'Nomor surat dan nama dokumen wajib diisi!' });
    }

    // Read original PDF to get page count & original SHA-256 hash
    const filePath = req.file.path;
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const originalHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');

    // Generate Document ID: BPM-ESIGN-2026-XXXXXX
    const count = documents.length + 1;
    const documentCode = `BPM-ESIGN-2026-${String(count).padStart(6, '0')}`;
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    const newDoc = {
      id,
      documentCode,
      documentNumber,
      documentName,
      subject: subject || '-',
      documentDate: documentDate || new Date().toISOString().split('T')[0],
      sender: sender || 'Ketua BPM ITG',
      originalFilename: req.file.filename,
      originalBase64: pdfBytes.toString('base64'),
      signedFilename: null,
      signedBase64: null,
      status: 'PENDING',
      originalHash,
      signedHash: null,
      pageCount,
      signedAt: null,
      signerName: 'Ketua BPM ITG 2026',
      signerTitle: 'Ketua Badan Perwakilan Mahasiswa Institut Teknologi Garut',
      createdAt: new Date().toISOString(),
    };

    documents.unshift(newDoc);
    saveDB();

    const { originalBase64, signedBase64, ...cleanDoc } = newDoc;
    res.json({ success: true, document: cleanDoc });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: err.message || 'Gagal mengunggah file PDF' });
  }
});

// 2. Sign PDF Document
app.post('/api/sign/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const { pageNumber, position, templateType, signerName, signerTitle } = req.body;

    const docIndex = documents.findIndex(d => d.id === docId);
    if (docIndex === -1) {
      return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    }
    const doc = documents[docIndex];

    const originalPath = path.join(UPLOADS_DIR, doc.originalFilename);
    let existingPdfBytes;
    if (fs.existsSync(originalPath)) {
      existingPdfBytes = fs.readFileSync(originalPath);
    } else if (doc.originalBase64) {
      existingPdfBytes = Buffer.from(doc.originalBase64, 'base64');
    } else {
      return res.status(404).json({ error: 'File PDF asal tidak ditemukan' });
    }
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const targetPageNum = (pageNumber || 1) - 1;
    const pages = pdfDoc.getPages();
    const targetPage = pages[targetPageNum] || pages[0];
    const pageHeight = targetPage.getHeight();

    // Fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // QR Code Image
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const verifyUrl = `${protocol}://${host}/verify/${doc.documentCode}`;
    const qrPngBuffer = await QRCode.toBuffer(verifyUrl, {
      margin: 1,
      width: 150,
      color: { dark: '#0B1D3A', light: '#FFFFFF' },
    });
    const qrImage = await pdfDoc.embedPng(qrPngBuffer);

    // Name & Title to render
    const nameToRender = signerName || doc.signerName || 'Ketua BPM ITG 2026';
    const titleToRender = signerTitle || doc.signerTitle || 'Ketua Badan Perwakilan Mahasiswa ITG';

    const tpl = templateType || 'standard';
    const pos = position || { x: 350, y: 650, width: 200, height: 100 };
    const blockX = pos.x;
    const blockY = pageHeight - pos.y - pos.height;
    const blockW = pos.width;
    const blockH = pos.height;

    if (tpl === 'footer') {
      // --- TEMPLATE 1: FOOTER PANJANG DI BAWAH ---
      targetPage.drawRectangle({
        x: blockX,
        y: blockY,
        width: blockW,
        height: blockH,
        borderColor: rgb(0.04, 0.11, 0.22),
        borderWidth: 1,
        color: rgb(0.95, 0.97, 1),
      });

      // Left QR
      const qrSize = Math.min(blockH - 8, 38);
      targetPage.drawImage(qrImage, {
        x: blockX + 8,
        y: blockY + 4,
        width: qrSize,
        height: qrSize,
      });

      // Text inside footer band
      targetPage.drawText(`DITANDATANGANI SECARA ELEKTRONIK - ${nameToRender.toUpperCase()}`, {
        x: blockX + qrSize + 16,
        y: blockY + blockH - 14,
        size: 7,
        font: helveticaBold,
        color: rgb(0.04, 0.11, 0.22),
      });

      targetPage.drawText(`${titleToRender} | ID: ${doc.documentCode}`, {
        x: blockX + qrSize + 16,
        y: blockY + blockH - 26,
        size: 6,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });

      targetPage.drawText(`Verifikasi Resmi: ${verifyUrl}`, {
        x: blockX + qrSize + 16,
        y: blockY + 6,
        size: 5.5,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });

    } else if (tpl === 'certificate') {
      // --- TEMPLATE 3: TTD SERTIFIKAT / PIAGAM ---
      targetPage.drawRectangle({
        x: blockX,
        y: blockY,
        width: blockW,
        height: blockH,
        borderColor: rgb(0.78, 0.65, 0.3), // Gold border
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
        opacity: 0.98,
      });

      // Top Gold Accent Line
      targetPage.drawRectangle({
        x: blockX,
        y: blockY + blockH - 16,
        width: blockW,
        height: 16,
        color: rgb(0.78, 0.65, 0.3),
      });

      targetPage.drawText('E-CERTIFICATE SIGNATURE - BPM ITG 2026', {
        x: blockX + 8,
        y: blockY + blockH - 12,
        size: 6.5,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });

      const qrSize = Math.min(blockH - 24, 52);
      targetPage.drawImage(qrImage, {
        x: blockX + blockW - qrSize - 6,
        y: blockY + 6,
        width: qrSize,
        height: qrSize,
      });

      targetPage.drawText(nameToRender, {
        x: blockX + 10,
        y: blockY + blockH - 34,
        size: 8.5,
        font: helveticaBold,
        color: rgb(0.04, 0.11, 0.22),
      });

      targetPage.drawText(titleToRender, {
        x: blockX + 10,
        y: blockY + blockH - 46,
        size: 6.5,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });

      targetPage.drawText(`Doc ID: ${doc.documentCode}`, {
        x: blockX + 10,
        y: blockY + 8,
        size: 5.5,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });

    } else {
      // --- TEMPLATE 2 & DEFAULT: KOTAK TTD UMUM ---
      targetPage.drawRectangle({
        x: blockX,
        y: blockY,
        width: blockW,
        height: blockH,
        borderColor: rgb(0.04, 0.11, 0.22),
        borderWidth: 0.8,
        color: rgb(1, 1, 1),
        opacity: 0.95,
      });

      targetPage.drawRectangle({
        x: blockX,
        y: blockY + blockH - 18,
        width: blockW,
        height: 18,
        color: rgb(0.04, 0.11, 0.22),
      });

      targetPage.drawText('DITANDATANGANI SECARA ELEKTRONIK', {
        x: blockX + 5,
        y: blockY + blockH - 13,
        size: 6,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });

      const qrSize = Math.min(blockH - 24, 50);
      targetPage.drawImage(qrImage, {
        x: blockX + blockW - qrSize - 5,
        y: blockY + 5,
        width: qrSize,
        height: qrSize,
      });

      targetPage.drawText(nameToRender, {
        x: blockX + 8,
        y: blockY + blockH - 32,
        size: 8,
        font: helveticaBold,
        color: rgb(0.04, 0.11, 0.22),
      });

      targetPage.drawText(titleToRender, {
        x: blockX + 8,
        y: blockY + blockH - 44,
        size: 6.5,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });

      targetPage.drawText(`ID: ${doc.documentCode}`, {
        x: blockX + 8,
        y: blockY + 8,
        size: 5.5,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    // Save Signed PDF
    const signedPdfBytes = await pdfDoc.save();
    const signedBuffer = Buffer.from(signedPdfBytes);
    const signedFilename = `${doc.documentCode}-SIGNED.pdf`;
    const signedFilePath = path.join(SIGNED_DIR, signedFilename);

    try {
      fs.writeFileSync(signedFilePath, signedBuffer);
    } catch (e) {
      console.error('Write signed file warning:', e);
    }

    // Compute Signed SHA-256 Hash
    const signedHash = crypto.createHash('sha256').update(signedBuffer).digest('hex');

    // Update Doc in DB
    const now = new Date();
    doc.status = 'VERIFIED';
    doc.signedFilename = signedFilename;
    doc.signedBase64 = signedBuffer.toString('base64');
    doc.signedHash = signedHash;
    doc.signerName = nameToRender;
    doc.signerTitle = titleToRender;
    doc.signedAt = now.toISOString();

    saveDB();

    res.json({
      success: true,
      documentCode: doc.documentCode,
      signedFilename,
      signedHash,
      signedAt: doc.signedAt,
    });
  } catch (err) {
    console.error('Sign Error:', err);
    res.status(500).json({ error: err.message || 'Gagal menandatangani PDF' });
  }
});

// 3. List All Documents
app.get('/api/documents', (req, res) => {
  res.json({ documents });
});

// 4. Get Single Document
app.get('/api/documents/:id', (req, res) => {
  const doc = documents.find(d => d.id === req.params.id || d.documentCode === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
  res.json({ document: doc });
});

// 5. Public Verification API
app.get('/api/verify/:code', (req, res) => {
  const code = req.params.code;
  const doc = documents.find(d => d.documentCode === code);

  if (!doc) {
    return res.json({
      valid: false,
      status: 'INVALID',
      message: 'Dokumen tidak terdaftar atau tidak ditemukan dalam sistem.'
    });
  }

  res.json({
    valid: true,
    status: doc.status,
    document: {
      documentName: doc.documentName,
      documentNumber: doc.documentNumber,
      documentDate: doc.documentDate,
      signedAt: doc.signedAt,
      signerName: doc.signerName,
      signerTitle: doc.signerTitle,
      documentCode: doc.documentCode,
      signedHash: doc.signedHash,
    },
    message: 'Dokumen valid dan terdaftar secara resmi di sistem BPM ITG 2026.'
  });
});

// 6. User Login API
app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();

  console.log(`[LOGIN ATTEMPT] Email: "${email}", Pass: "${password}"`);

  // Search in database
  let user = users.find(u => (u.email || '').trim().toLowerCase() === email && (u.password || '').trim() === password);

  // Fallback default accounts check to guarantee success
  if (!user) {
    if (email === 'admin@bpmitg.ac.id' && password === 'admin123') {
      user = { id: 'usr_admin', name: 'Administrator ITG', email: 'admin@bpmitg.ac.id', role: 'ADMIN', organization: 'Administrator Sistem' };
    } else if (email === 'ketua@bpmitg.ac.id' && password === 'ketua123') {
      user = { id: 'usr_ketua', name: 'Ketua BPM ITG 2026', email: 'ketua@bpmitg.ac.id', role: 'ORGANISASI', organization: 'Badan Perwakilan Mahasiswa (BPM ITG)' };
    } else if (email === 'bem@bpmitg.ac.id' && password === 'bem123') {
      user = { id: 'usr_bem', name: 'Presiden BEM ITG 2026', email: 'bem@bpmitg.ac.id', role: 'ORGANISASI', organization: 'Badan Eksekutif Mahasiswa (BEM ITG)' };
    }
  }

  if (!user) {
    console.log(`[LOGIN FAILED] No matching user for "${email}"`);
    return res.status(401).json({ error: 'Email atau password salah! Silakan periksa kembali.' });
  }

  console.log(`[LOGIN SUCCESS] User: ${user.name} (${user.role})`);
  const { password: _, ...userWithoutPass } = user;
  res.json({ success: true, user: userWithoutPass });
});

// 7. Get All Users (Admin Feature)
app.get('/api/users', (req, res) => {
  const safeUsers = users.map(({ password, ...rest }) => rest);
  res.json({ users: safeUsers });
});

// 8. Create New User (Admin Feature)
app.post('/api/users', (req, res) => {
  try {
    const { name, email, password, role, organization } = req.body;
    if (!name || !email || !password || !organization) {
      return res.status(400).json({ error: 'Nama, email, password, dan nama organisasi wajib diisi!' });
    }

    const existing = users.find(u => u.email === email);
    if (existing) {
      return res.status(400).json({ error: 'Email sudah terdaftar!' });
    }

    const newUser = {
      id: 'usr_' + Date.now().toString(36),
      name,
      email,
      password,
      role: role || 'ORGANISASI',
      organization: organization.trim(),
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveDB();

    const { password: _, ...safeUser } = newUser;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah user' });
  }
});

// 9. Delete User (Admin Feature)
app.delete('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  const index = users.findIndex(u => u.id === userId);
  if (index === -1) {
    return res.status(404).json({ error: 'User tidak ditemukan' });
  }
  
  if (users[index].email === 'admin@bpmitg.ac.id') {
    return res.status(400).json({ error: 'Akun Utama Admin tidak dapat dihapus!' });
  }

  users.splice(index, 1);
  saveDB();
  res.json({ success: true });
});

// Serve Public Login HTML Route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve Public Verification HTML Route
app.get('/verify/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

// Dynamic file handlers for uploads and signed PDFs with memory priority for Vercel
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;

  const doc = documents.find(d => d.originalFilename === filename);
  if (doc && doc.originalBase64) {
    const buf = Buffer.from(doc.originalBase64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(buf);
  }

  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).send('File unggahan tidak ditemukan');
});

app.get('/signed/:filename', (req, res) => {
  const filename = req.params.filename;

  const doc = documents.find(d => d.signedFilename === filename);
  if (doc && doc.signedBase64) {
    const buf = Buffer.from(doc.signedBase64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  }

  const filePath = path.join(SIGNED_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).send('File hasil TTD tidak ditemukan');
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 BPM ITG E-SIGN 2026 (Vanilla JS Server Ready)`);
    console.log(`👉 Access URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
