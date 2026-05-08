/**
 * 🔊 Audio Processing Service
 * Reusable functions for audio-specific FFmpeg operations
 */

import { buildFFmpegCommand } from '../config/ffmpeg.js';

/**
 * Apply voice optimization filters (for dubbing)
 */
export const optimizeForVoice = (command, options = {}) => {
  const {
    noiseReduction = true,
    compression = true,
    normalize = true
  } = options;
  
  let filters = [];
  
  // Noise reduction (highpass + compand)
  if (noiseReduction) {
    filters.push('highpass=f=200');
    filters.push('compand=0.3|0.8:6:-70/-70|-20/-20|-5/-5|0/-inf');
  }
  
  // Compression for consistent volume
  if (compression) {
    filters.push('acompressor=threshold=-20dB:ratio=4:attack=20:release=200');
  }
  
  // Normalize to -1dB peak
  if (normalize) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }
  
  if (filters.length > 0) {
    command.audioFilters(filters.join(','));
  }
  
  return command;
};

/**
 * Extract audio from video (for dubbing workflow)
 */
export const extractAudio = (inputPath, outputPath) => {
  return buildFFmpegCommand(inputPath, outputPath, {
    hasVideo: false,
    audioOnly: true
  }).outputOptions([
    '-vn',              // No video
    '-c:a aac',         // AAC audio
    '-b:a 192k',        // Bitrate
    '-ar 48000'         // Sample rate
  ]);
};

export default { optimizeForVoice, extractAudio };
