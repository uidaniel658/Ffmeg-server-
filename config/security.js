/**
 * 🔐 Security Configuration: API Key Validation + Rate Limiting
 */

import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * Validate API key from header or query
 */
export const validateApiKey = (req, res, next) => {
  const providedKey = req.headers['x-api-key'] || req.query.api_key;
  const expectedKey = process.env.API_SECRET_KEY;
  
  if (!expectedKey) {
    logger.warn('⚠️  API_SECRET_KEY not configured - allowing all requests (DEV ONLY)');
    return next();
  }
  
  if (!providedKey || providedKey !== expectedKey) {
    logger.warn(`🔐 Invalid API key attempt from ${req.ip}`);
    return res.status(403).json({ 
      error: 'Invalid or missing API key',
      hint: 'Use x-api-key header'
    });
  }
  
  next();
};

/**
 * Create configurable rate limiter
 */
export const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 min default
    max: options.max || 50,
    message: options.message || { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Rate limit by API key if present, else by IP
      return req.headers['x-api-key'] || req.ip;
    },
    handler: (req, res) => {
      logger.warn(`⚡ Rate limit exceeded for ${req.headers['x-api-key'] || req.ip}`);
      res.status(429).json(options.message);
    }
  });
};

/**
 * Generate secure random API key (for setup script)
 */
export const generateApiKey = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default { validateApiKey, createRateLimiter, generateApiKey };
