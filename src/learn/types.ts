/**
 * Liku Learn - Wisdom Center Types
 * 
 * TypeScript interfaces for the research and learning assistant.
 */

// ============================================================================
// Core Query Types
// ============================================================================

export type QueryType = 
  | 'general'      // Open-ended research
  | 'math'         // Calculations, equations, proofs
  | 'language'     // Grammar, definitions, etymology
  | 'code'         // Programming, codebase queries
  | 'deepdive';    // Multi-step research

export type HintStyle = 'progressive' | 'direct';

export interface LikuLearnQuery {
  id: string;
  text: string;
  type: QueryType;
  timestamp: Date;
  context?: QueryContext;
}

export interface QueryContext {
  currentFolder?: string;       // For codebase queries
  previousQueries?: string[];   // For context continuity
  subject?: string;             // Current topic being explored
}

// ============================================================================
// Search & Research Types
// ============================================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface DorkQuery {
  baseQuery: string;
  site?: string;           // site:github.com
  filetype?: string;       // filetype:pdf
  intitle?: string;        // intitle:"research paper"
  inurl?: string;          // inurl:docs
  exclude?: string[];      // -site:pinterest.com
  dateRange?: {
    after?: string;        // after:2024-01-01
    before?: string;       // before:2025-01-01
  };
}

export interface DeepDiveResult {
  topic: string;
  depth: 1 | 2 | 3;
  summary: string;
  sections: DeepDiveSection[];
  sources: SearchResult[];
  relatedTopics: string[];
}

export interface DeepDiveSection {
  title: string;
  content: string;
  depth: number;
}

// ============================================================================
// Math Engine Types
// ============================================================================

export type MathMode = 
  | 'calculate'    // 2 + 2 = 4
  | 'solve'        // x^2 - 4 = 0 → x = ±2
  | 'explain'      // "What is a derivative?"
  | 'simplify'     // Simplify expressions
  | 'convert';     // Unit conversions

export interface MathResult {
  mode: MathMode;
  input: string;
  output: string;
  steps?: string[];        // Step-by-step solution
  wolfram?: string;        // Wolfram Alpha result if available
  visualization?: string;  // ASCII visualization
}

// ============================================================================
// Language Engine Types
// ============================================================================

export type LanguageMode =
  | 'define'       // Word definition
  | 'grammar'      // Check/correct text
  | 'etymology'    // Word origin
  | 'synonyms'     // Thesaurus
  | 'antonyms'     // Opposite words
  | 'usage';       // Example sentences

export interface LanguageResult {
  mode: LanguageMode;
  word: string;
  result: string;
  examples?: string[];
  related?: string[];
}

// ============================================================================
// Codebase Engine Types
// ============================================================================

export type CodebaseScope = 
  | 'likubuddy'    // Only LikuBuddy workspace
  | 'custom'       // User-specified folder
  | 'gemini';      // Gemini CLI context

export interface CodebaseQuery {
  query: string;
  scope: CodebaseScope;
  customPath?: string;
  filePattern?: string;    // "*.ts", "src/**"
  maxResults?: number;
}

export interface CodebaseResult {
  query: string;
  files: CodebaseFile[];
  summary: string;
}

export interface CodebaseFile {
  path: string;
  relevantLines: CodeSnippet[];
  score: number;           // Relevance score
}

export interface CodeSnippet {
  startLine: number;
  endLine: number;
  content: string;
  context?: string;        // Surrounding context
}

// ============================================================================
// Response Types
// ============================================================================

export interface LikuLearnResponse {
  id: string;
  queryId: string;
  type: QueryType;
  content: ResponseContent;
  sources: SearchResult[];
  timestamp: Date;
  hintLevel?: number;      // For progressive hints (1, 2, 3)
}

export type ResponseContent = 
  | GeneralResponse
  | MathResult
  | LanguageResult
  | CodebaseResult
  | DeepDiveResult;

export interface GeneralResponse {
  answer: string;
  confidence: number;      // 0-1
  sources: SearchResult[];
}

// ============================================================================
// Settings Types
// ============================================================================

export interface LikuLearnSettings {
  // Core settings
  enabled: boolean;
  hintStyle: HintStyle;
  
  // History settings
  saveHistory: boolean;
  maxHistoryItems: number;
  
  // Search settings
  safeSearch: boolean;
  maxSearchResults: number;
  
  // Codebase settings
  codebaseScope: CodebaseScope;
  customCodebasePath?: string;
  
  // API keys (optional)
  wolframAppId?: string;
  
  // UI settings
  showSources: boolean;
  showConfidence: boolean;
}

export const DEFAULT_SETTINGS: LikuLearnSettings = {
  enabled: true,
  hintStyle: 'progressive',
  saveHistory: true,
  maxHistoryItems: 100,
  safeSearch: true,
  maxSearchResults: 5,
  codebaseScope: 'likubuddy',
  showSources: true,
  showConfidence: false,
};

// ============================================================================
// History Types
// ============================================================================

export interface HistoryEntry {
  id: number;
  query: string;
  queryType: QueryType;
  response: string;
  sources: string;         // JSON stringified
  createdAt: string;
  isFavorite: boolean;
}

// ============================================================================
// Safety Types
// ============================================================================

export interface SafetyCheck {
  isValid: boolean;
  reason?: string;
  sanitizedInput?: string;
}

export interface URLValidation {
  isAllowed: boolean;
  domain: string;
  reason?: string;
}

// Blocked domains for safety
export const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '192.168.',
  '10.',
  '172.16.',
  // Add more as needed
];

// Allowed search operators for dorking
export const ALLOWED_DORK_OPERATORS = [
  'site:',
  'filetype:',
  'intitle:',
  'inurl:',
  '-site:',
  'after:',
  'before:',
];

// Blocked operators (can reveal sensitive info)
export const BLOCKED_DORK_OPERATORS = [
  'cache:',
  'link:',
  'related:',
  'info:',
];
