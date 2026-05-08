/**
 * 🎬 BD DUBBING STUDIO - FFmpeg Processing Server
 * ✅ REST API for trim, volume, fade, mix, export
 * ✅ Auto-cleanup, validation, security, error handling
 * ✅ Deploy-ready for Render/Railway
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 4000;

// ── Directories ──────────────────────────────────────────
const UPLOAD_DIR = path.resolve('./uploads');
const OUTPUT_DIR = path.resolve('./outputs');

[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  fs.mkdir(dir, { recursive: true }).catch(console.error);
});

// ── Middleware ───────────────────────────────────────────
app.use(cors({
  origin: (process.env.CORS_ORIGIN || '').split(',').map(u => u.trim()),
  credentials: true
}));
app.use(express.json());
app.use(express.static(OUTPUT_DIR));

// Rate limiting
app.use('/api/ffmpeg/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many processing requests. Try again later.' }
}));

// API Key Validation Middleware
const validateApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.api_key;  if (!key || key !== process.env.API_SECRET_KEY) {
    return res.status(403).json({ error: 'Invalid or missing API key' });
  }
  next();
};

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const allowed = [...(process.env.ALLOWED_VIDEO_TYPES || '').split(','), ...(process.env.ALLOWED_AUDIO_TYPES || '').split(',')].map(t => t.trim());
    allowed.includes(ext) ? cb(null, true) : cb(new Error(`Invalid type. Allowed: ${allowed.join(', ')}`), false);
  }
});

// ── FFmpeg Promise Wrapper ───────────────────────────────
const runFFmpeg = (command) => new Promise((resolve, reject) => {
  command
    .on('start', cmd => console.log(`🎬 FFmpeg: ${cmd}`))
    .on('progress', p => process.env.NODE_ENV === 'development' && console.log(`📊 ${p.percent?.toFixed(1)}%`))
    .on('end', resolve)
    .on('error', (err, stdout, stderr) => reject(new Error(`FFmpeg failed: ${stderr || err.message}`)));
});

// ── Routes ───────────────────────────────────────────────

// 🔹 Health Check
app.get('/api/ffmpeg/health', (req, res) => {
  res.json({ status: 'OK', ffmpeg: 'ready', timestamp: new Date().toISOString() });
});

// 🔹 Process Endpoint (trim, volume, fade, pitch, speed)
app.post('/api/ffmpeg/process', validateApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const { startTime, duration, volume = 1, fadeIn, fadeOut, pitch = 0, speed = 1 } = req.body;
    const jobId = uuidv4();
    const inputPath = req.file.path;
    const outputPath = path.join(OUTPUT_DIR, `${jobId}-${req.file.originalname}`);
    
    let command = ffmpeg(inputPath);
        // Trim
    if (startTime) command = command.seekInput(parseFloat(startTime));
    if (duration) command = command.duration(parseFloat(duration));
    
    // Volume
    if (volume !== 1) command = command.audioFilters(`volume=${parseFloat(volume)}`);
    
    // Fade in/out
    if (fadeIn) command = command.audioFilters(`afade=t=in:st=0:d=${parseFloat(fadeIn)}`);
    if (fadeOut && duration) {
      const fadeStart = parseFloat(duration) - parseFloat(fadeOut);
      command = command.audioFilters(`afade=t=out:st=${fadeStart}:d=${parseFloat(fadeOut)}`);
    }
    
    // Pitch (semitones)
    if (pitch !== 0) {
      command = command.audioFilters(`asetrate=44100*2^(${parseFloat(pitch)}/12),aresample=44100`);
    }
    
    // Speed
    if (speed !== 1) {
      command = command.audioFilters(`atempo=${parseFloat(speed)}`);
    }
    
    await runFFmpeg(command.toFormat('mp4').save(outputPath));
    
    // Return download URL + job ID
    const downloadUrl = `${req.protocol}://${req.get('host')}/outputs/${path.basename(outputPath)}`;
    
    res.json({
      success: true,
      jobId,
      originalName: req.file.originalname,
      downloadUrl,
      processedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Processing error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

// 🔹 File Cleanup (Auto/Old files delete)
app.post('/api/ffmpeg/cleanup', validateApiKey, async (req, res) => {
  try {
    const hours = parseInt(req.body.hours || process.env.FILE_CLEANUP_HOURS || 24);
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    const dirs = [UPLOAD_DIR, OUTPUT_DIR];
    let deleted = 0;    
    for (const dir of dirs) {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          deleted++;
        }
      }
    }
    
    res.json({ success: true, deletedFiles: deleted, cutoffHours: hours });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', details: error.message });
  }
});

// ── Error Handling ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  if (err.message?.includes('Invalid type')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ─────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🎬 BDS FFmpeg Server Running                        ║
║  🌐 http://localhost:${PORT}                          ║
║  🔑 API Key Required: x-api-key header                ║
╚══════════════════════════════════════════════════════╝
  `);
});
