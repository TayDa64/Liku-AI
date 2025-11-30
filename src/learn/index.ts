/**
 * Liku Learn - Wisdom Center
 * 
 * A standalone research and learning assistant that helps students
 * and researchers with math, language, coding, and in-depth research.
 * 
 * @module learn
 */

// Types
export * from './types.js';

// Safety Layer
export {
  validateURL,
  sanitizeContent,
  sanitizeQuery,
  buildSafeDorkQuery,
  checkRateLimit,
  resetRateLimit,
  detectPII,
  redactPII,
  canGoDeeper,
  incrementDepth,
  resetDepth,
  getCurrentDepth,
} from './SafetyLayer.js';

// Engines
export {
  webSearch,
  advancedSearch,
  fetchPageContent,
  searchAcademic,
  searchTutorials,
  searchCode,
  searchDefinition,
  searchRecent,
} from './engines/WebSearcher.js';

export {
  processMath,
  detectMathMode,
  processMathWithWolfram,
  queryWolfram,
} from './engines/MathEngine.js';

export {
  processLanguage,
  detectLanguageMode,
} from './engines/LanguageEngine.js';

export {
  searchCodebase,
  readFileContent,
  getFileStructure,
  findDefinition,
  findTodos,
  findImports,
  getCodebaseStats,
} from './engines/CodebaseEngine.js';

// Main Research Engine
export {
  classifyQuery,
  research,
  getProgressiveHint,
  formatResponse,
} from './ResearchEngine.js';
