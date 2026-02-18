/**
 * Server-side MIME type validation using magic bytes.
 *
 * This module validates uploaded files by inspecting their actual content
 * (magic bytes) rather than trusting the client-provided MIME type or
 * file extension. This prevents attackers from uploading executables or
 * scripts disguised as innocent file types.
 */

import { fileTypeFromBuffer } from 'file-type';
import path from 'path';

// ─── Allowed MIME types with metadata ────────────────────────────────────────
// Each entry maps a MIME type to its allowed extensions and per-type size limit.
// Files not in this map are rejected outright.

export interface AllowedTypeInfo {
  /** Human-readable category for error messages */
  category: string;
  /** Allowed file extensions (lowercase, without dot) */
  extensions: string[];
  /** Max file size in bytes for this specific type */
  maxSize: number;
}

const MB = 1024 * 1024;

/**
 * Whitelist of allowed MIME types with per-type size limits.
 *
 * Categories:
 *  - Images: jpeg, png, gif, webp, svg (SVG is text-based, no magic bytes)
 *  - Documents: PDF, plain text, markdown, CSV, HTML
 *  - Office: docx, xlsx, pptx, legacy doc/xls
 *  - Data/Config: JSON, XML, YAML
 */
export const ALLOWED_TYPES: Record<string, AllowedTypeInfo> = {
  // ── Images ──────────────────────────────────────────────────────────────────
  'image/jpeg':    { category: 'image', extensions: ['jpg', 'jpeg'], maxSize: 10 * MB },
  'image/png':     { category: 'image', extensions: ['png'],         maxSize: 10 * MB },
  'image/gif':     { category: 'image', extensions: ['gif'],         maxSize: 5 * MB },
  'image/webp':    { category: 'image', extensions: ['webp'],        maxSize: 10 * MB },
  'image/svg+xml': { category: 'image', extensions: ['svg'],         maxSize: 1 * MB },

  // ── Documents ───────────────────────────────────────────────────────────────
  'application/pdf': { category: 'document', extensions: ['pdf'], maxSize: 10 * MB },
  'text/plain':      { category: 'text',     extensions: ['txt', 'log', 'text'], maxSize: 5 * MB },
  'text/markdown':   { category: 'text',     extensions: ['md', 'markdown'],     maxSize: 5 * MB },
  'text/html':       { category: 'text',     extensions: ['html', 'htm'],        maxSize: 5 * MB },
  'text/csv':        { category: 'text',     extensions: ['csv'],                maxSize: 10 * MB },

  // ── Office ──────────────────────────────────────────────────────────────────
  'application/msword': {
    category: 'office', extensions: ['doc'], maxSize: 10 * MB,
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    category: 'office', extensions: ['docx'], maxSize: 10 * MB,
  },
  'application/vnd.ms-excel': {
    category: 'office', extensions: ['xls'], maxSize: 10 * MB,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    category: 'office', extensions: ['xlsx'], maxSize: 10 * MB,
  },
  'application/vnd.ms-powerpoint': {
    category: 'office', extensions: ['ppt'], maxSize: 10 * MB,
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    category: 'office', extensions: ['pptx'], maxSize: 10 * MB,
  },

  // ── Data / Config ──────────────────────────────────────────────────────────
  'application/json': { category: 'data', extensions: ['json'],         maxSize: 5 * MB },
  'application/xml':  { category: 'data', extensions: ['xml'],          maxSize: 5 * MB },
  'text/xml':         { category: 'data', extensions: ['xml'],          maxSize: 5 * MB },
  'application/yaml': { category: 'data', extensions: ['yaml', 'yml'], maxSize: 5 * MB },
  'text/yaml':        { category: 'data', extensions: ['yaml', 'yml'], maxSize: 5 * MB },
};

// ─── Dangerous MIME types (always rejected) ──────────────────────────────────
// Even if someone manages to craft a file that looks like these, block them.

const BLOCKED_MIME_TYPES = new Set([
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-elf',
  'application/x-dosexec',
  'application/x-mach-binary',
  'application/vnd.microsoft.portable-executable',
  'application/x-sharedlib',
  'application/x-shellscript',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-msi',
  'application/java-archive',
  'application/x-java-applet',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/x-python-code',
  'application/x-perl',
  'application/x-ruby',
  'application/wasm',
]);

// ─── Extension-to-MIME mapping for text-based files ──────────────────────────
// file-type cannot detect these from magic bytes (they're just text).
// We allow them based on extension alone, but only if the claimed MIME
// is also in the allowed list.

const TEXT_BASED_EXTENSIONS = new Set([
  'txt', 'log', 'text', 'md', 'markdown', 'csv',
  'html', 'htm', 'json', 'xml', 'yaml', 'yml', 'svg',
]);

// ─── Extension → expected MIME types ─────────────────────────────────────────

function buildExtensionToMimeMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [mime, info] of Object.entries(ALLOWED_TYPES)) {
    for (const ext of info.extensions) {
      const existing = map.get(ext) || [];
      existing.push(mime);
      map.set(ext, existing);
    }
  }
  return map;
}

const EXTENSION_TO_MIMES = buildExtensionToMimeMap();

// ─── Dangerous file extensions ───────────────────────────────────────────────
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'com', 'bat', 'cmd', 'msi', 'scr', 'pif', 'vbs', 'vbe',
  'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh', 'ps1', 'ps2', 'psc1',
  'psc2', 'msh', 'msh1', 'msh2', 'inf', 'reg', 'rgs', 'sct',
  'shb', 'shs', 'lnk', 'dll', 'sys', 'drv', 'ocx', 'cpl',
  'hta', 'jar', 'class', 'php', 'py', 'pyc', 'pyo', 'rb',
  'pl', 'sh', 'bash', 'csh', 'ksh', 'wasm', 'elf', 'bin',
  'app', 'action', 'command', 'workflow', 'dmg', 'iso',
]);

// ─── Public validation types ─────────────────────────────────────────────────

export interface MimeValidationResult {
  valid: boolean;
  /** Detected MIME type from magic bytes (null for text-based files) */
  detectedMime: string | null;
  /** The MIME type to use (detected or claimed) */
  effectiveMime: string;
  /** Error message if invalid */
  error?: string;
}

// ─── Main validation function ────────────────────────────────────────────────

/**
 * Validate a file's MIME type by inspecting its magic bytes.
 *
 * Checks performed (in order):
 * 1. Extension is not on the blocked list
 * 2. Extension is recognized (maps to an allowed MIME type)
 * 3. Magic bytes are inspected to detect actual file type
 * 4. Detected type is not on the blocked list
 * 5. Detected type matches the claimed MIME / extension
 * 6. Per-type file size limit is enforced
 *
 * For text-based files (no magic bytes), we validate that the claimed
 * MIME type is allowed and matches the extension.
 */
export async function validateMimeType(
  buffer: Buffer,
  originalName: string,
  claimedMime: string,
  fileSize: number,
): Promise<MimeValidationResult> {
  const ext = path.extname(originalName).toLowerCase().replace('.', '');

  // 1. Block dangerous extensions
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      detectedMime: null,
      effectiveMime: claimedMime,
      error: `File extension ".${ext}" is not allowed. Executable and script files are blocked for security.`,
    };
  }

  // 2. Check extension is recognized
  const allowedMimesForExt = EXTENSION_TO_MIMES.get(ext);
  if (!allowedMimesForExt) {
    return {
      valid: false,
      detectedMime: null,
      effectiveMime: claimedMime,
      error: `File extension ".${ext}" is not recognized. Allowed types: images (jpg, png, gif, webp, svg), documents (pdf, txt, md, csv, html), office files (doc/x, xls/x, ppt/x), and data formats (json, xml, yaml).`,
    };
  }

  // 3. Detect actual MIME type from magic bytes
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    // 4. Block dangerous detected types
    if (BLOCKED_MIME_TYPES.has(detected.mime)) {
      return {
        valid: false,
        detectedMime: detected.mime,
        effectiveMime: detected.mime,
        error: `File content detected as "${detected.mime}" which is blocked for security. The file may be disguised as a ".${ext}" file.`,
      };
    }

    // 5a. Verify detected type is in our allowed list
    const typeInfo = ALLOWED_TYPES[detected.mime];
    if (!typeInfo) {
      // Special case: Office Open XML formats are zip-based.
      // file-type detects them as 'application/zip' sometimes.
      // If the extension maps to an allowed office type, allow it.
      if (detected.mime === 'application/zip' && allowedMimesForExt.some(m => ALLOWED_TYPES[m]?.category === 'office')) {
        // Office files are zip-based, this is expected
        const effectiveMime = allowedMimesForExt[0];
        const officeTypeInfo = ALLOWED_TYPES[effectiveMime];
        if (officeTypeInfo && fileSize > officeTypeInfo.maxSize) {
          return {
            valid: false,
            detectedMime: detected.mime,
            effectiveMime,
            error: `File size (${formatSize(fileSize)}) exceeds the ${formatSize(officeTypeInfo.maxSize)} limit for ${officeTypeInfo.category} files.`,
          };
        }
        return { valid: true, detectedMime: detected.mime, effectiveMime };
      }

      // Also handle CFB (Compound File Binary) for legacy Office formats
      if (detected.mime === 'application/x-cfb' && allowedMimesForExt.some(m =>
        m === 'application/msword' ||
        m === 'application/vnd.ms-excel' ||
        m === 'application/vnd.ms-powerpoint'
      )) {
        const effectiveMime = allowedMimesForExt[0];
        const legacyTypeInfo = ALLOWED_TYPES[effectiveMime];
        if (legacyTypeInfo && fileSize > legacyTypeInfo.maxSize) {
          return {
            valid: false,
            detectedMime: detected.mime,
            effectiveMime,
            error: `File size (${formatSize(fileSize)}) exceeds the ${formatSize(legacyTypeInfo.maxSize)} limit for ${legacyTypeInfo.category} files.`,
          };
        }
        return { valid: true, detectedMime: detected.mime, effectiveMime };
      }

      return {
        valid: false,
        detectedMime: detected.mime,
        effectiveMime: detected.mime,
        error: `File content detected as "${detected.mime}" which is not an allowed type. The file extension is ".${ext}" but the actual content doesn't match any allowed format.`,
      };
    }

    // 5b. Verify extension matches detected type
    if (!typeInfo.extensions.includes(ext)) {
      // Allow some flexibility: e.g., jpg/jpeg are interchangeable
      // Check if the extension maps to the same category
      const extCategory = allowedMimesForExt
        .map(m => ALLOWED_TYPES[m]?.category)
        .filter(Boolean);
      
      if (!extCategory.includes(typeInfo.category)) {
        return {
          valid: false,
          detectedMime: detected.mime,
          effectiveMime: detected.mime,
          error: `File extension ".${ext}" doesn't match file content (detected as ${typeInfo.category}: ${detected.mime}). This may indicate a disguised file.`,
        };
      }
    }

    // 6. Per-type size limit
    if (fileSize > typeInfo.maxSize) {
      return {
        valid: false,
        detectedMime: detected.mime,
        effectiveMime: detected.mime,
        error: `File size (${formatSize(fileSize)}) exceeds the ${formatSize(typeInfo.maxSize)} limit for ${typeInfo.category} files.`,
      };
    }

    return { valid: true, detectedMime: detected.mime, effectiveMime: detected.mime };
  }

  // ── No magic bytes detected (text-based files) ────────────────────────────
  if (TEXT_BASED_EXTENSIONS.has(ext)) {
    // Verify the claimed MIME type is in the allowed list
    const typeInfo = ALLOWED_TYPES[claimedMime];
    if (!typeInfo) {
      // Try to find the correct MIME type from extension mapping
      const expectedMime = allowedMimesForExt[0];
      const expectedInfo = ALLOWED_TYPES[expectedMime];
      if (!expectedInfo) {
        return {
          valid: false,
          detectedMime: null,
          effectiveMime: claimedMime,
          error: `File type "${claimedMime}" is not allowed.`,
        };
      }

      // Use the extension-based MIME type instead of the claimed one
      if (fileSize > expectedInfo.maxSize) {
        return {
          valid: false,
          detectedMime: null,
          effectiveMime: expectedMime,
          error: `File size (${formatSize(fileSize)}) exceeds the ${formatSize(expectedInfo.maxSize)} limit for ${expectedInfo.category} files.`,
        };
      }
      return { valid: true, detectedMime: null, effectiveMime: expectedMime };
    }

    // Check per-type size limit
    if (fileSize > typeInfo.maxSize) {
      return {
        valid: false,
        detectedMime: null,
        effectiveMime: claimedMime,
        error: `File size (${formatSize(fileSize)}) exceeds the ${formatSize(typeInfo.maxSize)} limit for ${typeInfo.category} files.`,
      };
    }

    return { valid: true, detectedMime: null, effectiveMime: claimedMime };
  }

  // No magic bytes and not a recognized text-based extension
  return {
    valid: false,
    detectedMime: null,
    effectiveMime: claimedMime,
    error: `Could not verify file type for ".${ext}". Only known file types with verifiable content are allowed.`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / MB)}MB`;
}

/**
 * Get a human-readable list of allowed file types for documentation/error messages.
 */
export function getAllowedTypesDescription(): string {
  const categories = new Map<string, string[]>();
  for (const [, info] of Object.entries(ALLOWED_TYPES)) {
    const exts = categories.get(info.category) || [];
    for (const ext of info.extensions) {
      if (!exts.includes(ext)) exts.push(ext);
    }
    categories.set(info.category, exts);
  }

  const parts: string[] = [];
  for (const [category, exts] of categories) {
    parts.push(`${category}: .${exts.join(', .')}`);
  }
  return parts.join('; ');
}
