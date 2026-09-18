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
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Cloudflare R2 Configuration ----------
// Mema values .env file eken ennawa (.env.example eka balanna)
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Session Code System
// -------------------
// Server eka start wena sarema, 4-digit code ekak generate wenawa.
function generateSessionCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
const SESSION_CODE = generateSessionCode();

app.use(cors());
app.use(express.json());

// test-upload.html page eka serve karanawa
app.use(express.static(__dirname));

// ---------- Multer Configuration ----------
// File eka disk ekata save karanne naha - memory ekata (buffer ekak widihata) gannawa,
// egin ma R2 ekata yawanawa. Ehema hindama local storage ekak apata one wenne naha.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

// ---------- Helper: R2 file ekakata download URL ekak hadanawa ----------
function buildDownloadUrl(filename) {
  return `${PORT === 3000 ? 'http://localhost:' + PORT : ''}/download/${encodeURIComponent(filename)}`;
}

// ---------- Routes ----------

app.get('/', (req, res) => {
  res.json({ message: 'File Upload/Download Server eka Run wenawa! (Cloudflare R2)' });
});

app.get('/session-code', (req, res) => {
  res.json({ success: true, code: SESSION_CODE });
});

// 1. FILE UPLOAD ENDPOINT -> R2 ekata yawanawa
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File ekak select karala naha!' });
    }

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: req.file.originalname,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    res.status(200).json({
      success: true,
      message: 'File eka success wela R2 ekata upload una!',
      file: {
        originalName: req.file.originalname,
        savedAs: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        downloadUrl: buildDownloadUrl(req.file.originalname),
        shareCode: SESSION_CODE
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. MULTIPLE FILES UPLOAD -> R2 ekata
app.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Files select karala naha!' });
    }

    const filesInfo = [];
    for (const file of req.files) {
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: file.originalname,
        Body: file.buffer,
        ContentType: file.mimetype
      }));
      filesInfo.push({
        originalName: file.originalname,
        savedAs: file.originalname,
        size: file.size,
        downloadUrl: buildDownloadUrl(file.originalname)
      });
    }

    res.status(200).json({
      success: true,
      message: `${req.files.length} files R2 ekata upload una!`,
      files: filesInfo
    });
  } catch (error) {
    console.error('Multi-upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Shared helper - R2 bucket eke thiyena files okkoma list ekak widihata gannawa
async function listR2Files() {
  const result = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET }));
  const contents = result.Contents || [];

  const filesInfo = contents.map(obj => ({
    name: obj.Key,
    size: obj.Size,
    modified: obj.LastModified,
    downloadUrl: buildDownloadUrl(obj.Key)
  }));

  filesInfo.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return filesInfo;
}

// 3. LIST ALL FILES ENDPOINT (R2 bucket eken)
app.get('/files', async (req, res) => {
  try {
    const filesInfo = await listR2Files();
    res.json({ success: true, count: filesInfo.length, files: filesInfo });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ success: false, message: 'Files list karanna baha: ' + error.message });
  }
});

// 4. FILE DOWNLOAD ENDPOINT - R2 eken file eka gena stream karanawa
app.get('/download/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: filename });
    const object = await r2.send(command);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);

    object.Body.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ success: false, message: 'File eka hoyaganna bari una!' });
  }
});

// 4b. RECEIVE FILES BY SESSION CODE ENDPOINT
app.get('/receive/:code', async (req, res) => {
  const code = req.params.code;

  if (code !== SESSION_CODE) {
    return res.status(404).json({ success: false, message: 'Code eka wenna, natnam software eka restart wela aluth code ekak una.' });
  }

  try {
    const filesInfo = await listR2Files();
    res.json({ success: true, count: filesInfo.length, files: filesInfo });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Files list karanna baha: ' + error.message });
  }
});

// 5. DELETE FILE ENDPOINT - R2 eken delete karanawa
app.delete('/delete/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
    res.json({ success: true, message: 'File eka R2 eken delete una!' });
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
  console.log(`🔑 Session Code eka: ${SESSION_CODE}  (server eka restart karana thuru meka wenas wenne naha)`);
});
