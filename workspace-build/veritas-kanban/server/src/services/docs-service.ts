/**
 * Docs Service
 *
 * Manages markdown documents stored in the VK docs directory.
 * Provides CRUD operations, search, and file system watching.
 *
 * Inspired by @nateherk's Klouse dashboard docs tab.
 */

import { createLogger } from '../lib/logger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', '.veritas-kanban');

const log = createLogger('docs');

// ─── Types ───────────────────────────────────────────────────────

export interface DocFile {
  /** Relative path from docs root */
  path: string;
  /** Filename without directory */
  name: string;
  /** File content (markdown) */
  content?: string;
  /** File size in bytes */
  size: number;
  /** Last modified ISO timestamp */
  modified: string;
  /** Created ISO timestamp */
  created: string;
  /** File extension */
  extension: string;
  /** Directory containing the file */
  directory: string;
}

export interface DocSearchResult {
  file: DocFile;
  /** Matching lines with context */
  matches: Array<{
    line: number;
    text: string;
    highlight: string;
  }>;
}

export interface DocsStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Record<string, number>;
  byDirectory: Record<string, number>;
  lastModified?: DocFile;
}

// ─── Service ─────────────────────────────────────────────────────

class DocsService {
  private docsRoot: string;

  constructor() {
    // Default to <storage>/../docs, configurable via VK_DOCS_DIR
    this.docsRoot = process.env.VK_DOCS_DIR || path.join(DATA_DIR, '..', 'docs');
  }

  /**
   * List all markdown files in the docs directory.
   */
  async listFiles(options?: {
    directory?: string;
    extension?: string;
    sortBy?: 'name' | 'modified' | 'size';
    sortOrder?: 'asc' | 'desc';
  }): Promise<DocFile[]> {
    const files: DocFile[] = [];
    const root = options?.directory
      ? path.join(this.docsRoot, options.directory)
      : this.docsRoot;

    try {
      await this.scanDirectory(root, files);
    } catch (err) {
      log.warn({ err, root }, 'Failed to scan docs directory');
      return [];
    }

    // Filter by extension
    if (options?.extension) {
      const ext = options.extension.startsWith('.') ? options.extension : `.${options.extension}`;
      return files.filter((f) => f.extension === ext);
    }

    // Sort
    const sortBy = options?.sortBy || 'modified';
    const sortOrder = options?.sortOrder || 'desc';
    files.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'modified':
          cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return files;
  }

  /**
   * Get a specific file with content.
   */
  async getFile(filePath: string): Promise<DocFile | null> {
    const fullPath = path.join(this.docsRoot, filePath);

    // Security: prevent path traversal
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.docsRoot))) {
      log.warn({ filePath }, 'Path traversal attempt blocked');
      return null;
    }

    try {
      const stat = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, 'utf-8');

      return {
        path: filePath,
        name: path.basename(filePath),
        content,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
        extension: path.extname(filePath),
        directory: path.dirname(filePath),
      };
    } catch {
      return null;
    }
  }

  /**
   * Create or update a file.
   */
  async saveFile(filePath: string, content: string): Promise<DocFile> {
    const fullPath = path.join(this.docsRoot, filePath);

    // Security: prevent path traversal
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.docsRoot))) {
      throw new Error('Invalid file path');
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    const stat = await fs.stat(fullPath);
    log.info({ filePath }, 'Doc saved');

    return {
      path: filePath,
      name: path.basename(filePath),
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      created: stat.birthtime.toISOString(),
      extension: path.extname(filePath),
      directory: path.dirname(filePath),
    };
  }

  /**
   * Delete a file.
   */
  async deleteFile(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.docsRoot, filePath);

    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.docsRoot))) {
      return false;
    }

    try {
      await fs.unlink(fullPath);
      log.info({ filePath }, 'Doc deleted');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search files by name and content.
   */
  async search(query: string, options?: { limit?: number }): Promise<DocSearchResult[]> {
    const files = await this.listFiles();
    const results: DocSearchResult[] = [];
    const queryLower = query.toLowerCase();
    const limit = options?.limit || 20;

    for (const file of files) {
      // Check filename match
      if (file.name.toLowerCase().includes(queryLower)) {
        results.push({ file, matches: [] });
        if (results.length >= limit) break;
        continue;
      }

      // Check content match
      try {
        const fullPath = path.join(this.docsRoot, file.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const matches: DocSearchResult['matches'] = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            matches.push({
              line: i + 1,
              text: lines[i].slice(0, 200),
              highlight: query,
            });
            if (matches.length >= 3) break; // Max 3 matches per file
          }
        }

        if (matches.length > 0) {
          results.push({ file, matches });
          if (results.length >= limit) break;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  /**
   * Get docs directory statistics.
   */
  async getStats(): Promise<DocsStats> {
    const files = await this.listFiles();
    const byExtension: Record<string, number> = {};
    const byDirectory: Record<string, number> = {};
    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;
      byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
      byDirectory[file.directory || '.'] = (byDirectory[file.directory || '.'] || 0) + 1;
    }

    return {
      totalFiles: files.length,
      totalSize,
      byExtension,
      byDirectory,
      lastModified: files[0], // Already sorted by modified desc
    };
  }

  /**
   * List subdirectories.
   */
  async listDirectories(): Promise<string[]> {
    const dirs: string[] = [];
    try {
      await this.scanDirectories(this.docsRoot, '', dirs);
    } catch {
      // Root doesn't exist
    }
    return dirs.sort();
  }

  // ─── Private ─────────────────────────────────────────────────

  private async scanDirectory(dir: string, files: DocFile[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        await this.scanDirectory(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        // Only index markdown and text files
        if (!['.md', '.mdx', '.txt', '.json', '.yaml', '.yml'].includes(ext)) continue;

        try {
          const stat = await fs.stat(fullPath);
          const relativePath = path.relative(this.docsRoot, fullPath);
          files.push({
            path: relativePath,
            name: entry.name,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            created: stat.birthtime.toISOString(),
            extension: ext,
            directory: path.dirname(relativePath),
          });
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }

  private async scanDirectories(dir: string, prefix: string, dirs: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        dirs.push(relative);
        await this.scanDirectories(path.join(dir, entry.name), relative, dirs);
      }
    }
  }
}

// Singleton
let instance: DocsService | null = null;

export function getDocsService(): DocsService {
  if (!instance) {
    instance = new DocsService();
  }
  return instance;
}
