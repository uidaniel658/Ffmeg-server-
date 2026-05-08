/**
 * 📁 File Storage Management: Uploads, Outputs, Cleanup
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Ensure directories exist
 */
export const ensureDirectories = async (dirs) => {
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`📁 Created directory: ${dir}`);
    }
  }
};

/**
 * Validate uploaded file
 */
export const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  const allowedVideo = (process.env.ALLOWED_VIDEO_TYPES || 'mp4,webm,mov,avi')
    .split(',').map(t => t.trim().toLowerCase());
  const allowedAudio = (process.env.ALLOWED_AUDIO_TYPES || 'mp3,wav,ogg,m4a')
    .split(',').map(t => t.trim().toLowerCase());
  const allowed = [...allowedVideo, ...allowedAudio];
  
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  
  if (!allowed.includes(ext)) {
    return { 
      valid: false, 
      error: `Invalid file type: .${ext}. Allowed: ${allowed.join(', ')}` 
    };
  }
  
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024;
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${(maxSize / 1024 / 1024).toFixed(0)}MB`     };
  }
  
  return { valid: true };
};

/**
 * Get file info (size, type, duration via ffprobe)
 */
export const getFileInfo = async (filepath) => {
  const stats = await fs.stat(filepath);
  
  return {
    path: filepath,
    filename: path.basename(filepath),
    size: stats.size,
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    modified: stats.mtime,
    ext: path.extname(filepath).slice(1).toLowerCase()
  };
};

/**
 * Delete files older than X hours
 */
export const cleanupOldFiles = async (uploadDir, outputDir, hours = 24) => {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  let deleted = 0;
  
  for (const dir of [uploadDir, outputDir]) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file === '.gitkeep') continue;
        
        const filepath = path.join(dir, file);
        const stat = await fs.stat(filepath);
        
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filepath);
          deleted++;
          logger.debug(`🗑️  Deleted old file: ${file}`);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error(`❌ Error cleaning ${dir}`, err);
      }
    }
  }  
  return { deleted, cutoffHours: hours };
};

/**
 * Move file from uploads to outputs (after processing)
 */
export const moveFile = async (from, to) => {
  try {
    await fs.rename(from, to);
    logger.debug(`📦 Moved: ${from} → ${to}`);
    return true;
  } catch (err) {
    // If rename fails (cross-device), copy then delete
    await fs.copyFile(from, to);
    await fs.unlink(from);
    logger.debug(`📦 Copied + deleted: ${from} → ${to}`);
    return true;
  }
};

export default { ensureDirectories, validateFile, getFileInfo, cleanupOldFiles, moveFile };
