/**
 * ✅ Input Validation Helpers (Joi)
 */

import Joi from 'joi';

// Processing options schema
export const processOptionsSchema = Joi.object({
  startTime: Joi.number().min(0).optional(),
  duration: Joi.number().min(0).optional(),
  volume: Joi.number().min(0).max(10).default(1),
  fadeIn: Joi.number().min(0).optional(),
  fadeOut: Joi.number().min(0).optional(),
  pitch: Joi.number().min(-24).max(24).default(0),
  speed: Joi.number().min(0.25).max(4).default(1),
  eq: Joi.object({
    low: Joi.number().min(-20).max(20).default(0),
    mid: Joi.number().min(-20).max(20).default(0),
    high: Joi.number().min(-20).max(20).default(0)
  }).optional(),
  noiseReduction: Joi.boolean().default(false),
  outputFormat: Joi.string().valid('mp4', 'webm', 'mp3', 'wav').default('mp4')
});

// Validate and sanitize options
export const validateProcessOptions = (input) => {
  return processOptionsSchema.validate(input, {
    abortEarly: false,
    stripUnknown: true
  });
};

export default { validateProcessOptions, processOptionsSchema };
