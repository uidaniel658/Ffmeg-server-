/**
 * 📊 GET /api/ffmpeg/status/:jobId
 * Check processing job status
 */

import express from 'express';
import { getJobs } from './process.js';

const router = express.Router();

router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  const jobs = getJobs();
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ 
      success: false, 
      error: 'Job not found',
      hint: 'Job may have expired or never existed'
    });
  }
  
  res.json({
    success: true,
    data: {
      id: job.id,
      status: job.status, // 'processing' | 'completed' | 'failed'
      progress: job.progress,
      createdAt: job.createdAt,
      updatedAt: job.completedAt || job.failedAt || new Date().toISOString(),
      input: job.input,
      output: job.output,
      error: job.error,
      processingTime: job.processingTime
    }
  });
});

export default router;
