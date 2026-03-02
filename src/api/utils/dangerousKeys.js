/**
 * Keys that must never appear as path segments — prototype pollution vectors.
 * Used by both API boundary validation and inner config mutation paths.
 */
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
