// File upload endpoint. Stores under data/uploads/, served via /uploads/*.
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOADS_DIR } from '../config.js';
import { requireAuth } from '../auth.js';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set([
  // images
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  // audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  // video
  'video/mp4', 'video/webm', 'video/quicktime',
  // docs
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/zip', 'application/x-zip-compressed', 'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },  // 2 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('mime_not_allowed'));
  },
});

const router = Router();

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'no_file' });
  res.json({
    ok: true,
    file: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
    },
  });
});

// Multer errors land here.
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ detail: 'file_too_large', limit_mb: 25 });
  }
  if (err.message === 'mime_not_allowed') {
    return res.status(415).json({ detail: 'mime_not_allowed' });
  }
  res.status(500).json({ detail: 'upload_error', message: err.message });
});

export default router;
