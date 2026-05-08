/**
 * 🎬 BD DUBBING STUDIO - FFmpeg Processing Server
 * ✅ Production-ready Express + FFmpeg API
 * ✅ Trim, volume, fade, pitch, speed, mix, export
 * ✅ Security, logging, cleanup, job tracking
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

// Internal modules
import logger from './utils/logger.js';
import { validateApiKey, createRateLimiter } from './config/security.js';
import { ensureDirectories, validateFile, cleanupOldFiles } from './config/storage.js';
import { buildFFmpegCommand } from './config/ffmpeg.js';
import processRoute from './routes/process.js';
import statusRoute from './routes/status.js';
import cleanupRoute from './routes/cleanup.js';

// Load environment
dotenv.config();

// Set FFmpeg paths (critical for Replit/Render)
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// ═══════════════════════════════════════════════════════════
// 🔐 SECURITY & MIDDLEWARE
// ═══════════════════════════════════════════════════════════

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false
}));
// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Request-ID']
}));

// Rate limiting
app.use('/api/ffmpeg/', createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: { error: 'Too many requests. Please try again later.' }
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  logger.info(`[${req.requestId}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ═══════════════════════════════════════════════════════════
// 📁 STORAGE SETUP
// ═══════════════════════════════════════════════════════════

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');

ensureDirectories([UPLOAD_DIR, OUTPUT_DIR]).catch(err => {
  logger.error('❌ Failed to create directories', err);
  process.exit(1);
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const { valid, error } = validateFile(file);
  if (valid) {
    cb(null, true);
  } else {
    cb(new Error(error), false);
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 // 500MB
  },
  fileFilter
});

// ═══════════════════════════════════════════════════════════
// 🛣️ API ROUTES
// ═══════════════════════════════════════════════════════════

// Health check (no auth required)
app.get('/api/ffmpeg/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'bds-ffmpeg-server',
    version: '1.0.0',
    ffmpeg: {
      available: true,
      path: ffmpegPath
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Protected routes (require API key)
app.use('/api/ffmpeg/process', validateApiKey, upload.single('file'), processRoute);
app.use('/api/ffmpeg/status', validateApiKey, statusRoute);
app.use('/api/ffmpeg/cleanup', validateApiKey, cleanupRoute);

// Serve processed files (optional - for direct download)
app.use('/outputs', express.static(OUTPUT_DIR, {
  maxAge: '1h',  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.mp4') || filepath.endsWith('.webm')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}));

// ═══════════════════════════════════════════════════════════
// ❌ ERROR HANDLING
// ═══════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  logger.warn(`[${req.requestId}] 404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    logger.warn(`[${requestId}] File too large: ${err.message}`);
    return res.status(413).json({ error: 'File too large', maxSize: process.env.MAX_FILE_SIZE });
  }
  
  // Multer file type error
  if (err.message?.includes('Invalid file type')) {
    logger.warn(`[${requestId}] Invalid file type: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  
  // API key error
  if (err.message?.includes('API key')) {
    logger.warn(`[${requestId}] Auth error: ${err.message}`);
    return res.status(403).json({ error: 'Invalid or missing API key' });
  }
  
  // FFmpeg processing error
  if (err.message?.includes('FFmpeg failed')) {
    logger.error(`[${requestId}] Processing error: ${err.message}`);
    return res.status(500).json({ 
      error: 'Processing failed', 
      details: err.message,
      requestId 
    });
  }
    // Generic error
  logger.error(`[${requestId}] Server error:`, err);
  res.status(500).json({ 
    error: 'Internal server error',
    requestId: process.env.NODE_ENV === 'development' ? requestId : undefined
  });
});

// ═══════════════════════════════════════════════════════════
// 🚀 SERVER STARTUP
// ═══════════════════════════════════════════════════════════

const startServer = async () => {
  try {
    // Verify FFmpeg is working
    await new Promise((resolve, reject) => {
      ffmpeg().getAvailableFormats((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('✅ FFmpeg verified and ready');
    
    // Schedule auto cleanup (every 6 hours)
    if (process.env.NODE_ENV !== 'test') {
      const cleanupInterval = 6 * 60 * 60 * 1000; // 6 hours
      setInterval(async () => {
        try {
          const result = await cleanupOldFiles(UPLOAD_DIR, OUTPUT_DIR, 24);
          logger.info(`🧹 Auto cleanup: deleted ${result.deleted} files`);
        } catch (err) {
          logger.error('❌ Auto cleanup failed', err);
        }
      }, cleanupInterval);
      logger.info(`🧹 Auto cleanup scheduled every 6 hours`);
    }
    
    // Start HTTP server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`
╔══════════════════════════════════════════════════════╗
║  🎬 BDS FFmpeg Server - RUNNING                      ║
║  🌐 ${HOST === '0.0.0.0' ? 'http://localhost' : `http://${HOST}`}:${PORT}
║  🔑 API Key Required: x-api-key header               ║
║  🗂️  Uploads: ${UPLOAD_DIR}
║  📤 Outputs: ${OUTPUT_DIR}
║  🎛️  Environment: ${process.env.NODE_ENV}
╚══════════════════════════════════════════════════════╝
      `.trim());
    });    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`🛑 Received ${signal}. Shutting down gracefully...`);
      
      // Stop accepting new requests
      server.close(async () => {
        logger.info('✅ HTTP server closed');
        
        // Cleanup temp files
        try {
          await cleanupOldFiles(UPLOAD_DIR, OUTPUT_DIR, 0); // Delete all temp
          logger.info('🧹 Temporary files cleaned');
        } catch (err) {
          logger.error('❌ Cleanup on shutdown failed', err);
        }
        
        process.exit(0);
      });
      
      // Force close after timeout
      setTimeout(() => {
        logger.error('❌ Could not close connections in time, forcing exit');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    return server;
    
  } catch (error) {
    logger.error('❌ Failed to start server', error);
    process.exit(1);
  }
};

// Start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, startServer };
