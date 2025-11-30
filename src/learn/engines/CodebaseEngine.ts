/**
 * Liku Learn - Codebase Engine
 * 
 * Provides codebase awareness and search capabilities.
 * Can search LikuBuddy workspace, user-specified folders, or Gemini CLI context.
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  CodebaseQuery, 
  CodebaseResult, 
  CodebaseFile, 
  CodeSnippet, 
  CodebaseScope 
} from '../types.js';
import { sanitizeQuery, sanitizeContent } from '../SafetyLayer.js';

// ============================================================================
// Constants
// ============================================================================

const LIKUBUDDY_ROOT = process.cwd();
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_FILES_TO_SEARCH = 100;
const MAX_RESULTS = 10;
const CONTEXT_LINES = 3;

// File patterns to include
const INCLUDE_PATTERNS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.py', '.java', '.go', '.rs',
  '.md', '.txt', '.json', '.yaml', '.yml',
  '.css', '.scss', '.html',
];

// Directories to exclude
const EXCLUDE_DIRS = [
  'node_modules', 'dist', '.git', '.vscode',
  '__pycache__', '.pytest_cache', 'venv',
  'build', 'target', 'coverage',
];

// ============================================================================
// Main Function
// ============================================================================

/**
 * Search the codebase for relevant content
 */
export async function searchCodebase(query: CodebaseQuery): Promise<CodebaseResult> {
  // Sanitize query
  const sanitized = sanitizeQuery(query.query);
  if (!sanitized.isValid) {
    throw new Error(sanitized.reason);
  }

  const searchTerms = sanitized.sanitizedInput!.toLowerCase().split(/\s+/);
  
  // Determine the root directory
  const rootDir = getRootDirectory(query.scope, query.customPath);
  
  if (!fs.existsSync(rootDir)) {
    return {
      query: query.query,
      files: [],
      summary: `Directory not found: ${rootDir}`,
    };
  }

  // Find all relevant files
  const files = await findFiles(rootDir, query.filePattern);
  
  // Search files for matches
  const results = await searchFiles(files, searchTerms, query.maxResults || MAX_RESULTS);

  // Build summary
  const summary = buildSummary(query.query, results, rootDir);

  return {
    query: query.query,
    files: results,
    summary,
  };
}

/**
 * Read a specific file with context
 */
export async function readFileContent(
  filePath: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(LIKUBUDDY_ROOT, filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(fullPath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${filePath} (${(stats.size / 1024).toFixed(1)}KB > ${MAX_FILE_SIZE / 1024}KB)`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  if (startLine !== undefined && endLine !== undefined) {
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    return lines.slice(start, end).join('\n');
  }

  return sanitizeContent(content, 10000);
}

/**
 * Get file structure overview
 */
export async function getFileStructure(
  scope: CodebaseScope,
  customPath?: string
): Promise<string> {
  const rootDir = getRootDirectory(scope, customPath);
  
  if (!fs.existsSync(rootDir)) {
    return `Directory not found: ${rootDir}`;
  }

  const structure = buildTreeStructure(rootDir, '', 0, 3);
  return structure;
}

/**
 * Find function/class definition
 */
export async function findDefinition(
  name: string,
  scope: CodebaseScope = 'likubuddy',
  customPath?: string
): Promise<CodebaseFile[]> {
  const rootDir = getRootDirectory(scope, customPath);
  const files = await findFiles(rootDir);
  
  const results: CodebaseFile[] = [];

  // Patterns for function/class definitions
  const patterns = [
    new RegExp(`(?:function|const|let|var)\\s+${name}\\s*[=\\(]`, 'i'),
    new RegExp(`(?:class|interface|type|enum)\\s+${name}\\s*[{<]`, 'i'),
    new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, 'im'),
    new RegExp(`\\b${name}\\s*:\\s*\\([^)]*\\)\\s*=>`, 'i'),  // Arrow function
    new RegExp(`def\\s+${name}\\s*\\(`, 'i'),  // Python
  ];

  for (const file of files.slice(0, MAX_FILES_TO_SEARCH)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      const snippets: CodeSnippet[] = [];

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          if (pattern.test(lines[i])) {
            const start = Math.max(0, i - CONTEXT_LINES);
            const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
            
            snippets.push({
              startLine: start + 1,
              endLine: end,
              content: lines.slice(start, end).join('\n'),
            });
            break;
          }
        }
      }

      if (snippets.length > 0) {
        results.push({
          path: path.relative(rootDir, file),
          relevantLines: snippets,
          score: 1.0,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get root directory based on scope
 */
function getRootDirectory(scope: CodebaseScope, customPath?: string): string {
  switch (scope) {
    case 'likubuddy':
      return LIKUBUDDY_ROOT;
    case 'custom':
      return customPath || LIKUBUDDY_ROOT;
    case 'gemini':
      // Look for Gemini CLI context
      const geminiDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.gemini');
      return fs.existsSync(geminiDir) ? geminiDir : LIKUBUDDY_ROOT;
    default:
      return LIKUBUDDY_ROOT;
  }
}

/**
 * Find all files matching pattern
 */
async function findFiles(rootDir: string, filePattern?: string): Promise<string[]> {
  const files: string[] = [];
  
  function walkDir(dir: string, depth: number = 0): void {
    if (depth > 10 || files.length >= MAX_FILES_TO_SEARCH) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) {
          walkDir(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Check file pattern if specified
        if (filePattern) {
          const pattern = filePattern.replace(/\*/g, '.*');
          if (!new RegExp(pattern).test(entry.name)) continue;
        }

        // Check extension
        if (INCLUDE_PATTERNS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walkDir(rootDir);
  return files;
}

/**
 * Search files for matching content
 */
async function searchFiles(
  files: string[],
  searchTerms: string[],
  maxResults: number
): Promise<CodebaseFile[]> {
  const results: CodebaseFile[] = [];

  for (const file of files) {
    if (results.length >= maxResults) break;

    try {
      const stats = fs.statSync(file);
      if (stats.size > MAX_FILE_SIZE) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      const lowerContent = content.toLowerCase();

      // Calculate relevance score
      let score = 0;
      for (const term of searchTerms) {
        const matches = (lowerContent.match(new RegExp(term, 'gi')) || []).length;
        score += matches;
      }

      if (score === 0) continue;

      // Find relevant line snippets
      const snippets: CodeSnippet[] = [];
      
      for (let i = 0; i < lines.length && snippets.length < 3; i++) {
        const lowerLine = lines[i].toLowerCase();
        
        if (searchTerms.some(term => lowerLine.includes(term))) {
          const start = Math.max(0, i - CONTEXT_LINES);
          const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
          
          // Avoid overlapping snippets
          const overlaps = snippets.some(s => 
            (start >= s.startLine - 1 && start < s.endLine) ||
            (end > s.startLine - 1 && end <= s.endLine)
          );

          if (!overlaps) {
            snippets.push({
              startLine: start + 1,
              endLine: end,
              content: lines.slice(start, end).join('\n'),
            });
          }
        }
      }

      if (snippets.length > 0) {
        results.push({
          path: file,
          relevantLines: snippets,
          score: score / searchTerms.length,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults);
}

/**
 * Build a summary of search results
 */
function buildSummary(query: string, results: CodebaseFile[], rootDir: string): string {
  if (results.length === 0) {
    return `No matches found for "${query}" in ${rootDir}`;
  }

  let summary = `Found ${results.length} file(s) matching "${query}":\n\n`;
  
  for (const file of results) {
    const relativePath = path.relative(rootDir, file.path);
    summary += `📁 ${relativePath} (${file.relevantLines.length} matches, score: ${file.score.toFixed(1)})\n`;
  }

  return summary;
}

/**
 * Build a tree structure representation
 */
function buildTreeStructure(dir: string, prefix: string, depth: number, maxDepth: number): string {
  if (depth > maxDepth) return prefix + '...\n';

  let result = '';
  
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  // Filter and sort
  const filtered = entries.filter(e => 
    !EXCLUDE_DIRS.includes(e.name) && !e.name.startsWith('.')
  );
  
  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const newPrefix = prefix + (isLast ? '    ' : '│   ');

    if (entry.isDirectory()) {
      result += prefix + connector + entry.name + '/\n';
      result += buildTreeStructure(
        path.join(dir, entry.name),
        newPrefix,
        depth + 1,
        maxDepth
      );
    } else {
      result += prefix + connector + entry.name + '\n';
    }
  }

  return result;
}

// ============================================================================
// Specialized Queries
// ============================================================================

/**
 * Search for TODO/FIXME comments
 */
export async function findTodos(
  scope: CodebaseScope = 'likubuddy',
  customPath?: string
): Promise<CodebaseFile[]> {
  return searchCodebase({
    query: 'TODO FIXME BUG HACK XXX',
    scope,
    customPath,
    maxResults: 20,
  }).then(result => result.files);
}

/**
 * Search for imports/dependencies
 */
export async function findImports(
  moduleName: string,
  scope: CodebaseScope = 'likubuddy',
  customPath?: string
): Promise<CodebaseFile[]> {
  return searchCodebase({
    query: `import ${moduleName} require ${moduleName}`,
    scope,
    customPath,
    maxResults: 20,
  }).then(result => result.files);
}

/**
 * Get file statistics
 */
export async function getCodebaseStats(
  scope: CodebaseScope = 'likubuddy',
  customPath?: string
): Promise<{
  totalFiles: number;
  byExtension: Record<string, number>;
  totalLines: number;
  topDirectories: string[];
}> {
  const rootDir = getRootDirectory(scope, customPath);
  const files = await findFiles(rootDir);
  
  const byExtension: Record<string, number> = {};
  const dirCounts: Record<string, number> = {};
  let totalLines = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || 'no-ext';
    byExtension[ext] = (byExtension[ext] || 0) + 1;

    const relDir = path.dirname(path.relative(rootDir, file)).split(path.sep)[0] || '.';
    dirCounts[relDir] = (dirCounts[relDir] || 0) + 1;

    try {
      const content = fs.readFileSync(file, 'utf-8');
      totalLines += content.split('\n').length;
    } catch {
      // Skip
    }
  }

  const topDirectories = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dir]) => dir);

  return {
    totalFiles: files.length,
    byExtension,
    totalLines,
    topDirectories,
  };
}
