/**
 * 🎬 POST /api/ffmpeg/process
 * Main endpoint for media processing
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import logger from '../utils/logger.js';
import { buildFFmpegCommand, runFFmpeg, getMediaInfo } from '../config/ffmpeg.js';
import { getFileInfo, moveFile } from '../config/storage.js';

const router = express.Router();

// In-memory job store (MVP - replace with Redis/DB for production)
const jobs = new Map();

router.post('/', async (req, res) => {
  const jobId = uuidv4();
  const startTime = Date.now();
  
  logger.info(`🆕 [${jobId}] Processing request started`, {
    file: req.file?.originalname,
    options: Object.keys(req.body).filter(k => !k.includes('password'))
  });
  
  // Store job status
  jobs.set(jobId, {
    id: jobId,
    status: 'processing',
    progress: 0,
    createdAt: new Date().toISOString(),
    input: req.file ? {
      name: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    } : null
  });
  
  try {
    // Validate file
    if (!req.file) {
      throw new Error('No file uploaded');
    }
    
    // Get input file info
    const inputInfo = await getFileInfo(req.file.path);
    const mediaInfo = await getMediaInfo(req.file.path).catch(() => null);
    
    logger.debug(`[${jobId}] Input: ${inputInfo.filename} (${inputInfo.sizeMB}MB, ${mediaInfo?.duration?.toFixed(1)}s)`);    
    // Prepare output path
    const outputFilename = `${jobId}-${path.parse(req.file.originalname).name}-processed.mp4`;
    const outputPath = path.join(process.env.OUTPUT_DIR || './outputs', outputFilename);
    
    // Build and run FFmpeg command
    const options = {
      ...req.body,
      hasVideo: mediaInfo?.streams?.some(s => s.type === 'video')
    };
    
    const command = buildFFmpegCommand(req.file.path, outputPath, options);
    
    // Run with progress tracking
    await runFFmpeg(command, jobId);
    
    // Move file if needed (in case of cross-device)
    await moveFile(req.file.path, outputPath).catch(() => {});
    
    // Update job status
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'completed',
      progress: 100,
      output: {
        filename: outputFilename,
        path: outputPath,
        downloadUrl: `/outputs/${outputFilename}`,
        size: (await getFileInfo(outputPath)).size
      },
      processingTime,
      completedAt: new Date().toISOString()
    });
    
    logger.info(`✅ [${jobId}] Processing completed in ${processingTime}s`);
    
    // Send response
    res.status(200).json({
      success: true,
      jobId,
      message: 'Processing completed successfully',
      output: {
        filename: outputFilename,
        downloadUrl: `/outputs/${outputFilename}`,
        size: jobs.get(jobId).output.size
      },
      processingTime: `${processingTime}s`,
      timestamp: new Date().toISOString()
    });    
  } catch (error) {
    // Update job status to failed
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString()
    });
    
    logger.error(`❌ [${jobId}] Processing failed: ${error.message}`);
    
    // Cleanup input file on error
    if (req.file?.path) {
      import('fs/promises').then(fs => fs.unlink(req.file.path).catch(() => {}));
    }
    
    res.status(500).json({
      success: false,
      jobId,
      error: 'Processing failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/ffmpeg/process/:jobId - Check job status
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      error: job.error,
      input: job.input,
      output: job.output,
      processingTime: job.processingTime
    }  });
});

// Export jobs map for external monitoring (optional)
export const getJobs = () => jobs;

export default router;
