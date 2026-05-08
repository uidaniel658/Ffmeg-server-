/**
 * 🧹 POST /api/ffmpeg/cleanup
 * Delete old uploaded/processed files
 */

import express from 'express';
import { cleanupOldFiles } from '../config/storage.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { hours = 24, dryRun = false } = req.body;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const outputDir = process.env.OUTPUT_DIR || './outputs';
    
    logger.info(`🧹 Cleanup request: ${hours}h, dryRun=${dryRun}`);
    
    if (dryRun) {
      // Just report what would be deleted
      const result = { dryRun: true, wouldDelete: 0, dirs: [uploadDir, outputDir] };
      return res.json({ success: true, result });
    }
    
    const result = await cleanupOldFiles(uploadDir, outputDir, hours);
    
    logger.info(`🧹 Cleanup completed: deleted ${result.deleted} files`);
    
    res.json({
      success: true,
      message: `Deleted ${result.deleted} files older than ${hours} hours`,
      result
    });
    
  } catch (error) {
    logger.error('❌ Cleanup failed', error);
    res.status(500).json({ 
      success: false, 
      error: 'Cleanup failed', 
      message: error.message 
    });
  }
});

export default router;
