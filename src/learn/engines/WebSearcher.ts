/**
 * Liku Learn - Web Searcher Engine
 * 
 * Provides web search capabilities using DuckDuckGo HTML endpoint (no API key required).
 * Supports Google dorking for advanced searches with safety guards.
 */

import { SearchResult, DorkQuery, SafetyCheck } from '../types.js';
import { 
  validateURL, 
  sanitizeContent, 
  buildSafeDorkQuery, 
  checkRateLimit,
  redactPII 
} from '../SafetyLayer.js';

// ============================================================================
// Constants
// ============================================================================

const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_MAX_RESULTS = 5;
const SEARCH_TIMEOUT_MS = 10000;

// ============================================================================
// Main Search Functions
// ============================================================================

/**
 * Perform a web search using DuckDuckGo HTML endpoint
 */
export async function webSearch(
  query: string,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<SearchResult[]> {
  // Rate limit check
  const rateCheck = checkRateLimit('web_search', 10, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const results = await searchDuckDuckGo(query, maxResults);
    return results;
  } catch (error) {
    console.error('Web search failed:', error);
    return [];
  }
}

/**
 * Perform an advanced search with Google dorking operators
 */
export async function advancedSearch(
  dork: DorkQuery,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<SearchResult[]> {
  // Build safe dork query
  const safeQuery = buildSafeDorkQuery(dork);
  if (!safeQuery.isValid) {
    throw new Error(safeQuery.reason);
  }

  return webSearch(safeQuery.sanitizedInput!, maxResults);
}

/**
 * Fetch and extract content from a specific URL
 */
export async function fetchPageContent(url: string): Promise<string> {
  // Validate URL
  const urlCheck = validateURL(url);
  if (!urlCheck.isAllowed) {
    throw new Error(urlCheck.reason);
  }

  // Rate limit check
  const rateCheck = checkRateLimit('fetch_page', 5, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract text content
    const textContent = extractTextFromHTML(html);
    
    // Sanitize content
    const sanitized = sanitizeContent(textContent);
    
    // Redact PII
    const safe = redactPII(sanitized);

    return safe;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

// ============================================================================
// DuckDuckGo Implementation
// ============================================================================

/**
 * Search DuckDuckGo using HTML endpoint
 */
async function searchDuckDuckGo(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    kl: 'us-en',    // US English
    kp: '1',         // SafeSearch on
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${DUCKDUCKGO_HTML_URL}?${params}`, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    return parseDuckDuckGoResults(html, maxResults);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Search timed out');
    }
    throw error;
  }
}

/**
 * Parse DuckDuckGo HTML results
 */
function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result entries (simplified regex parsing)
  // DuckDuckGo HTML format: <a class="result__a" href="URL">TITLE</a>
  //                        <a class="result__snippet">SNIPPET</a>
  
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

  const links: { url: string; title: string }[] = [];
  let match;

  while ((match = resultPattern.exec(html)) !== null && links.length < maxResults * 2) {
    const url = decodeURIComponent(match[1].replace(/.*uddg=([^&]*).*/, '$1'));
    const title = cleanHtmlText(match[2]);
    
    // Validate URL before adding
    const urlCheck = validateURL(url);
    if (urlCheck.isAllowed && title && url.startsWith('http')) {
      links.push({ url, title });
    }
  }

  // Extract snippets
  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null && snippets.length < maxResults * 2) {
    snippets.push(cleanHtmlText(match[1]));
  }

  // Combine links and snippets
  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
      source: extractDomain(links[i].url),
    });
  }

  return results;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract text content from HTML
 */
function extractTextFromHTML(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Clean HTML text (remove tags, decode entities)
 */
function cleanHtmlText(text: string): string {
  return decodeHtmlEntities(
    text.replace(/<[^>]+>/g, '').trim()
  );
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

// ============================================================================
// Convenience Search Builders
// ============================================================================

/**
 * Search for academic/research content
 */
export async function searchAcademic(query: string): Promise<SearchResult[]> {
  const dork: DorkQuery = {
    baseQuery: query,
    site: 'scholar.google.com OR arxiv.org OR researchgate.net OR academia.edu',
    exclude: ['pinterest.com', 'facebook.com', 'twitter.com'],
  };
  return advancedSearch(dork);
}

/**
 * Search for tutorials and documentation
 */
export async function searchTutorials(query: string): Promise<SearchResult[]> {
  const dork: DorkQuery = {
    baseQuery: `${query} tutorial OR guide OR documentation`,
    exclude: ['pinterest.com', 'facebook.com'],
  };
  return advancedSearch(dork);
}

/**
 * Search for code examples
 */
export async function searchCode(query: string, language?: string): Promise<SearchResult[]> {
  const langFilter = language ? ` ${language}` : '';
  const dork: DorkQuery = {
    baseQuery: `${query}${langFilter} code example`,
    site: 'github.com OR stackoverflow.com OR dev.to OR medium.com',
  };
  return advancedSearch(dork);
}

/**
 * Search for definitions and explanations
 */
export async function searchDefinition(term: string): Promise<SearchResult[]> {
  const dork: DorkQuery = {
    baseQuery: `"${term}" definition OR meaning OR explained`,
    site: 'wikipedia.org OR britannica.com OR merriam-webster.com',
  };
  return advancedSearch(dork);
}

/**
 * Search with date filter (recent content)
 */
export async function searchRecent(
  query: string,
  afterDate: string
): Promise<SearchResult[]> {
  const dork: DorkQuery = {
    baseQuery: query,
    dateRange: { after: afterDate },
  };
  return advancedSearch(dork);
}
