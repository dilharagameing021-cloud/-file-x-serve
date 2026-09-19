// server.js
// File Upload/Download Backend Server - Cloudflare R2 Storage
// -------------------------------------------------------------
// Run: npm install  then  npm start
// Local test: http://localhost:3000

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Cloudflare R2 Configuration ----------
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Per-Device Code System
// -----------------------
// Device ekak page eka open karama, "/register" call karala aluth 4-digit
// code ekak ganna. Ee code ekatama witharai ee device ekata file yawanna
// puluwan. Server eka restart una nam codes okkoma clear wenawa.
const deviceInboxes = {}; // { "1234": [ {name, size, downloadUrl, modified}, ... ] }

function generateUniqueCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (deviceInboxes[code]); // dan use wena code ekak nam aluthin hadanawa
  return code;
}

app.use(cors());
app.use(express.json());

// test-upload.html page eka serve karanawa
app.use(express.static(__dirname));

// ---------- Multer Configuration ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

// ---------- Helper: R2 file ekakata download URL ekak hadanawa ----------
function buildDownloadUrl(filename) {
  return `/download/${encodeURIComponent(filename)}`;
}

// ---------- Routes ----------

app.get('/', (req, res) => {
  res.json({ message: 'File Upload/Download Server eka Run wenawa! (Cloudflare R2)' });
});

// DEVICE REGISTER ENDPOINT
// Page eka load wena welawe methanin aluth (unique) code ekak illanawa.
app.post('/register', (req, res) => {
  const code = generateUniqueCode();
  deviceInboxes[code] = [];
  res.json({ success: true, code });
});

// Device eke code eka thama server eke thiyenawada kiyala check karanawa
// (server eka restart una nam, localStorage eke tibba code eka wada karanne naha)
app.get('/check-code/:code', (req, res) => {
  const exists = !!deviceInboxes[req.params.code];
  res.json({ success: true, exists });
});

// 1. FILE UPLOAD ENDPOINT -> R2 ekata yawala, targetCode ekata inbox ekata danawa
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File ekak select karala naha!' });
    }

    const targetCode = req.body.targetCode;
    if (!targetCode || !deviceInboxes[targetCode]) {
      return res.status(404).json({ success: false, message: 'Send karana code eka wenna, natnam ee device eka dan online naha.' });
    }

    // File name eka duplicate wenna puluwan nisa, code eka + timestamp ekak
    // sambanda karala key ekak hadanawa (R2 ekata witharai, penena nama wenas wenne naha)
    const r2Key = `${targetCode}_${Date.now()}_${req.file.originalname}`;

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const fileEntry = {
      name: req.file.originalname,
      key: r2Key,
      size: req.file.size,
      modified: new Date(),
      downloadUrl: buildDownloadUrl(r2Key)
    };

    deviceInboxes[targetCode].push(fileEntry);

    res.status(200).json({
      success: true,
      message: 'File eka success wela yawuna!',
      file: {
        originalName: fileEntry.name,
        savedAs: fileEntry.key,
        size: fileEntry.size,
        mimeType: req.file.mimetype,
        downloadUrl: fileEntry.downloadUrl,
        targetCode: targetCode
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. INBOX ENDPOINT - mema code ekata yawapu files okkoma denawa
app.get('/inbox/:code', (req, res) => {
  const code = req.params.code;
  const files = deviceInboxes[code];

  if (!files) {
    return res.status(404).json({ success: false, message: 'Code eka wenna, natnam server eka restart wela.' });
  }

  const sorted = [...files].sort((a, b) => new Date(b.modified) - new Date(a.modified));
  res.json({ success: true, count: sorted.length, files: sorted });
});

// 3. FILE DOWNLOAD ENDPOINT - R2 eken file eka gena stream karanawa
app.get('/download/:key', async (req, res) => {
  const key = req.params.key;

  // R2 key eke ithurata "targetCode_timestamp_" kotasa ain kara,
  // download wena welawe original file name ekama penena widihata
  const displayName = key.replace(/^\d+_\d+_/, '');

  try {
    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const object = await r2.send(command);

    res.setHeader('Content-Disposition', `attachment; filename="${displayName}"`);
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);

    object.Body.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ success: false, message: 'File eka hoyaganna bari una!' });
  }
});

// 4. DELETE FILE ENDPOINT - R2 eken + inbox eken delete karanawa
app.delete('/delete/:code/:key', async (req, res) => {
  const { code, key } = req.params;

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));

    if (deviceInboxes[code]) {
      deviceInboxes[code] = deviceInboxes[code].filter(f => f.key !== key);
    }

    res.json({ success: true, message: 'File eka delete una!' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, message: 'File eka delete karanna baha: ' + error.message });
  }
});

// Multer error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  } else if (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
  next();
});

// ---------- Start Server ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server eka run wenawa: http://localhost:${PORT}`);
  console.log(`☁️  Storage: Cloudflare R2 bucket "${R2_BUCKET}"`);
  console.log(`🔑 Per-device codes enabled - device ekak page eka open karama code ekak generate wenawa`);
});
