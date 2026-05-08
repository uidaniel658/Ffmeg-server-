/**
 * 🎬 FFmpeg Command Builder & Wrapper
 */

import ffmpeg from 'fluent-ffmpeg';
import logger from '../utils/logger.js';

/**
 * Build FFmpeg command based on options
 */
export const buildFFmpegCommand = (inputPath, outputPath, options = {}) => {
  let command = ffmpeg(inputPath);
  
  // ── Trim / Cut ─────────────────────────────────────
  if (options.startTime) {
    command = command.seekInput(parseFloat(options.startTime));
    logger.debug(`✂️  Trim start: ${options.startTime}s`);
  }
  if (options.duration) {
    command = command.duration(parseFloat(options.duration));
    logger.debug(`✂️  Trim duration: ${options.duration}s`);
  }
  
  // ── Audio Processing ───────────────────────────────
  // Volume
  if (options.volume && options.volume !== 1) {
    command = command.audioFilters(`volume=${parseFloat(options.volume)}`);
    logger.debug(`🔊 Volume: ${options.volume}x`);
  }
  
  // Fade in
  if (options.fadeIn) {
    command = command.audioFilters(`afade=t=in:st=0:d=${parseFloat(options.fadeIn)}`);
    logger.debug(`🌅 Fade in: ${options.fadeIn}s`);
  }
  
  // Fade out (needs duration or calculate from file)
  if (options.fadeOut && options.duration) {
    const fadeStart = parseFloat(options.duration) - parseFloat(options.fadeOut);
    command = command.audioFilters(`afade=t=out:st=${fadeStart}:d=${parseFloat(options.fadeOut)}`);
    logger.debug(`🌇 Fade out: ${options.fadeOut}s (start: ${fadeStart}s)`);
  }
  
  // Pitch shift (semitones)
  if (options.pitch && options.pitch !== 0) {
    const semitones = parseFloat(options.pitch);
    // Using rubberband or aselect method
    command = command.audioFilters(`asetrate=44100*2^(${semitones}/12),aresample=44100`);
    logger.debug(`🎵 Pitch shift: ${semitones} semitones`);
  }  
  // Speed/tempo
  if (options.speed && options.speed !== 1) {
    const speed = parseFloat(options.speed);
    // atempo supports 0.5 to 2.0, chain for extreme values
    if (speed >= 0.5 && speed <= 2.0) {
      command = command.audioFilters(`atempo=${speed}`);
    } else {
      // Chain multiple atempo filters for extreme speeds
      const chains = [];
      let remaining = speed;
      while (remaining > 2.0) {
        chains.push('atempo=2.0');
        remaining /= 2.0;
      }
      while (remaining < 0.5) {
        chains.push('atempo=0.5');
        remaining /= 0.5;
      }
      if (remaining !== 1.0) {
        chains.push(`atempo=${remaining}`);
      }
      command = command.audioFilters(chains.join(','));
    }
    logger.debug(`⚡ Speed: ${options.speed}x`);
  }
  
  // EQ (3-band example: low, mid, high)
  if (options.eq) {
    const { low = 0, mid = 0, high = 0 } = options.eq;
    if (low !== 0 || mid !== 0 || high !== 0) {
      const filters = [
        low !== 0 && `equalizer=f=100:t=q:w=2:g=${low}`,
        mid !== 0 && `equalizer=f=1000:t=q:w=2:g=${mid}`,
        high !== 0 && `equalizer=f=10000:t=q:w=2:g=${high}`
      ].filter(Boolean);
      if (filters.length > 0) {
        command = command.audioFilters(filters.join(','));
        logger.debug(`🎚️  EQ: low=${low}, mid=${mid}, high=${high}`);
      }
    }
  }
  
  // Noise reduction (simple highpass for voice)
  if (options.noiseReduction) {
    command = command.audioFilters('highpass=f=200,compand=0.3|0.8:6:-70/-70|-20/-20|-5/-5|0/-inf');
    logger.debug(`🔇 Noise reduction enabled`);
  }
  
  // ── Output Settings ─────────────────────────────────  const preset = process.env.FFMPEG_PRESET || 'medium';
  const crf = process.env.FFMPEG_CRF || '23';
  const audioBitrate = process.env.FFMPEG_AUDIO_BITRATE || '192k';
  
  command
    .outputOptions([
      '-movflags +faststart',  // Web streaming optimization
      `-preset ${preset}`,      // Encoding speed/quality tradeoff
      `-crf ${crf}`,            // Quality (18=best, 28=worst)
      `-b:a ${audioBitrate}`    // Audio bitrate
    ]);
  
  // Video codec (if input has video)
  if (options.hasVideo !== false) {
    const videoBitrate = process.env.FFMPEG_VIDEO_BITRATE || '2500k';
    command.outputOptions([
      '-c:v libx264',
      `-b:v ${videoBitrate}`,
      '-pix_fmt yuv420p'  // Compatibility
    ]);
  }
  
  // Audio codec
  command.outputOptions([
    '-c:a aac',
    '-ar 48000',          // Sample rate
    '-ac 2'               // Stereo
  ]);
  
  // Final output
  command = command.toFormat('mp4').save(outputPath);
  
  return command;
};

/**
 * Run FFmpeg command with Promise wrapper + logging
 */
export const runFFmpeg = (command, jobId) => {
  return new Promise((resolve, reject) => {
    let progress = { percent: 0, timemark: '00:00:00' };
    
    command
      .on('start', (cmd) => {
        logger.info(`🎬 [${jobId}] FFmpeg started: ${cmd.substring(0, 100)}...`);
      })
      .on('progress', (p) => {
        progress = {
          percent: p.percent || 0,
          timemark: p.timemark || '00:00:00'        };
        // Log progress every 10%
        if (progress.percent % 10 === 0 && progress.percent > 0) {
          logger.debug(`📊 [${jobId}] Progress: ${progress.percent.toFixed(1)}% @ ${progress.timemark}`);
        }
      })
      .on('end', () => {
        logger.info(`✅ [${jobId}] FFmpeg completed`);
        resolve({ success: true, progress });
      })
      .on('error', (err, stdout, stderr) => {
        const errorMsg = stderr || err.message || 'Unknown FFmpeg error';
        logger.error(`❌ [${jobId}] FFmpeg failed: ${errorMsg}`);
        logger.debug(`📋 FFmpeg stdout: ${stdout?.substring(0, 500)}`);
        reject(new Error(`FFmpeg failed: ${errorMsg}`));
      });
  });
};

/**
 * Get media info via ffprobe
 */
export const getMediaInfo = (filepath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (err) {
        reject(new Error(`ffprobe failed: ${err.message}`));
        return;
      }
      
      const stream = metadata.streams.find(s => s.codec_type === 'video') || 
                    metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        duration: metadata.format?.duration || 0,
        size: metadata.format?.size || 0,
        codec: stream?.codec_name || 'unknown',
        bitrate: metadata.format?.bit_rate || 0,
        streams: metadata.streams.map(s => ({
          type: s.codec_type,
          codec: s.codec_name,
          sampleRate: s.sample_rate,
          channels: s.channels
        }))
      });
    });
  });
};

export default { buildFFmpegCommand, runFFmpeg, getMediaInfo };
