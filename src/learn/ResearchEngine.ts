/**
 * Liku Learn - Research Engine
 * 
 * Main orchestrator for all research capabilities.
 * Routes queries to appropriate engines and combines results.
 */

import {
  LikuLearnQuery,
  LikuLearnResponse,
  QueryType,
  SearchResult,
  LikuLearnSettings,
  DEFAULT_SETTINGS,
  DeepDiveResult,
  DeepDiveSection,
  HintStyle,
} from './types.js';
import { sanitizeQuery, resetDepth, incrementDepth, canGoDeeper, getCurrentDepth } from './SafetyLayer.js';
import { webSearch, advancedSearch, fetchPageContent, searchAcademic, searchCode } from './engines/WebSearcher.js';
import { processMath, detectMathMode, processMathWithWolfram } from './engines/MathEngine.js';
import { processLanguage, detectLanguageMode } from './engines/LanguageEngine.js';
import { searchCodebase, findDefinition, getCodebaseStats, getFileStructure } from './engines/CodebaseEngine.js';

// ============================================================================
// Query Classification
// ============================================================================

/**
 * Classify a query into a query type
 */
export function classifyQuery(query: string): QueryType {
  const lower = query.toLowerCase();

  // Check for math
  const mathMode = detectMathMode(query);
  if (mathMode) {
    return 'math';
  }

  // Check for language
  const langMode = detectLanguageMode(query);
  if (langMode) {
    return 'language';
  }

  // Check for code-related queries
  const codePatterns = [
    /\b(function|class|method|variable|import|export|code|implement|debug|error|bug)\b/i,
    /\b(typescript|javascript|python|java|rust|go|react|node)\b/i,
    /how\s+(to|do\s+i)\s+(write|create|implement|build|make)/i,
    /\b(file|folder|directory|codebase|workspace|repository)\b/i,
  ];

  if (codePatterns.some(p => p.test(lower))) {
    return 'code';
  }

  // Check for deep dive patterns
  const deepDivePatterns = [
    /deep\s*dive/i,
    /explain\s+in\s+depth/i,
    /comprehensive/i,
    /everything\s+about/i,
    /detailed?\s+(explanation|analysis|overview)/i,
  ];

  if (deepDivePatterns.some(p => p.test(lower))) {
    return 'deepdive';
  }

  // Default to general
  return 'general';
}

// ============================================================================
// Main Research Function
// ============================================================================

/**
 * Process a research query
 */
export async function research(
  query: string,
  settings: Partial<LikuLearnSettings> = {}
): Promise<LikuLearnResponse> {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
  
  // Sanitize query
  const sanitized = sanitizeQuery(query);
  if (!sanitized.isValid) {
    throw new Error(sanitized.reason);
  }

  const cleanQuery = sanitized.sanitizedInput!;
  const queryType = classifyQuery(cleanQuery);
  
  // Create query object
  const likuQuery: LikuLearnQuery = {
    id: generateId(),
    text: cleanQuery,
    type: queryType,
    timestamp: new Date(),
  };

  // Route to appropriate handler
  switch (queryType) {
    case 'math':
      return handleMathQuery(likuQuery, mergedSettings);
    case 'language':
      return handleLanguageQuery(likuQuery, mergedSettings);
    case 'code':
      return handleCodeQuery(likuQuery, mergedSettings);
    case 'deepdive':
      return handleDeepDiveQuery(likuQuery, mergedSettings);
    default:
      return handleGeneralQuery(likuQuery, mergedSettings);
  }
}

// ============================================================================
// Query Handlers
// ============================================================================

/**
 * Handle math queries
 */
async function handleMathQuery(
  query: LikuLearnQuery,
  settings: LikuLearnSettings
): Promise<LikuLearnResponse> {
  const mathMode = detectMathMode(query.text) || 'calculate';
  
  const result = await processMathWithWolfram(
    query.text,
    mathMode,
    settings.wolframAppId
  );

  // Build response content
  let content = `**${mathMode.charAt(0).toUpperCase() + mathMode.slice(1)}:**\n\n`;
  content += `Input: \`${result.input}\`\n`;
  content += `Result: **${result.output}**\n`;
  
  if (result.steps && result.steps.length > 0) {
    content += `\n**Steps:**\n`;
    content += result.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  if (result.wolfram) {
    content += `\n\n**Wolfram Alpha says:** ${result.wolfram}`;
  }

  return {
    id: generateId(),
    queryId: query.id,
    type: 'math',
    content: result,
    sources: [],
    timestamp: new Date(),
  };
}

/**
 * Handle language queries
 */
async function handleLanguageQuery(
  query: LikuLearnQuery,
  settings: LikuLearnSettings
): Promise<LikuLearnResponse> {
  const langMode = detectLanguageMode(query.text) || 'define';
  
  // Extract the word/phrase to look up
  const wordMatch = query.text.match(/(?:define|meaning\s+of|synonym|antonym|etymology)\s+(?:of\s+)?["']?(\w+)["']?/i);
  const word = wordMatch ? wordMatch[1] : query.text.split(' ').pop() || query.text;

  const result = await processLanguage(word, langMode);

  return {
    id: generateId(),
    queryId: query.id,
    type: 'language',
    content: result,
    sources: [],
    timestamp: new Date(),
  };
}

/**
 * Handle code/codebase queries
 */
async function handleCodeQuery(
  query: LikuLearnQuery,
  settings: LikuLearnSettings
): Promise<LikuLearnResponse> {
  const sources: SearchResult[] = [];

  // Check if it's a definition lookup
  const defMatch = query.text.match(/(?:find|where\s+is|definition\s+of)\s+(\w+)/i);
  if (defMatch) {
    const results = await findDefinition(
      defMatch[1],
      settings.codebaseScope,
      settings.customCodebasePath
    );

    if (results.length > 0) {
      return {
        id: generateId(),
        queryId: query.id,
        type: 'code',
        content: {
          query: query.text,
          files: results,
          summary: `Found ${results.length} definition(s) for "${defMatch[1]}"`,
        },
        sources,
        timestamp: new Date(),
      };
    }
  }

  // Try codebase search first
  const codebaseResult = await searchCodebase({
    query: query.text,
    scope: settings.codebaseScope,
    customPath: settings.customCodebasePath,
  });

  // Also search web for code examples
  const webResults = await searchCode(query.text);
  sources.push(...webResults);

  return {
    id: generateId(),
    queryId: query.id,
    type: 'code',
    content: codebaseResult,
    sources,
    timestamp: new Date(),
  };
}

/**
 * Handle general research queries
 */
async function handleGeneralQuery(
  query: LikuLearnQuery,
  settings: LikuLearnSettings
): Promise<LikuLearnResponse> {
  // Perform web search
  const searchResults = await webSearch(query.text, settings.maxSearchResults);

  // Build a combined response
  let summary = '';
  
  if (searchResults.length > 0) {
    summary = `Found ${searchResults.length} result(s) for "${query.text}":\n\n`;
    
    for (const result of searchResults) {
      summary += `**${result.title}** (${result.source})\n`;
      summary += `${result.snippet}\n`;
      summary += `[${result.url}]\n\n`;
    }
  } else {
    summary = `No results found for "${query.text}". Try rephrasing your query.`;
  }

  return {
    id: generateId(),
    queryId: query.id,
    type: 'general',
    content: {
      answer: summary,
      confidence: searchResults.length > 0 ? 0.7 : 0.2,
      sources: searchResults,
    },
    sources: searchResults,
    timestamp: new Date(),
  };
}

/**
 * Handle deep dive queries
 */
async function handleDeepDiveQuery(
  query: LikuLearnQuery,
  settings: LikuLearnSettings
): Promise<LikuLearnResponse> {
  resetDepth();
  
  // Extract topic from query
  const topicMatch = query.text.match(/(?:deep\s*dive|explain|everything\s+about)\s+(?:on\s+|into\s+|about\s+)?(.+)/i);
  const topic = topicMatch ? topicMatch[1].trim() : query.text;

  const sections: DeepDiveSection[] = [];
  const allSources: SearchResult[] = [];

  // Level 1: Overview
  incrementDepth();
  const overviewResults = await webSearch(`what is ${topic}`, 3);
  allSources.push(...overviewResults);
  
  sections.push({
    title: 'Overview',
    content: overviewResults.map(r => r.snippet).join(' '),
    depth: 1,
  });

  // Level 2: Key Concepts (if we can go deeper)
  if (canGoDeeper()) {
    incrementDepth();
    const conceptResults = await webSearch(`${topic} key concepts explained`, 3);
    allSources.push(...conceptResults);
    
    sections.push({
      title: 'Key Concepts',
      content: conceptResults.map(r => r.snippet).join(' '),
      depth: 2,
    });
  }

  // Level 3: Advanced Topics (if we can go deeper)
  if (canGoDeeper()) {
    incrementDepth();
    const advancedResults = await webSearch(`${topic} advanced topics`, 3);
    allSources.push(...advancedResults);
    
    sections.push({
      title: 'Advanced Topics',
      content: advancedResults.map(r => r.snippet).join(' '),
      depth: 3,
    });
  }

  // Find related topics
  const relatedTopics: string[] = [];
  for (const source of allSources.slice(0, 5)) {
    // Extract potential related topics from snippets
    const words = source.snippet.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 5 && !word.includes(topic.toLowerCase()) && !relatedTopics.includes(word)) {
        relatedTopics.push(word);
        if (relatedTopics.length >= 5) break;
      }
    }
    if (relatedTopics.length >= 5) break;
  }

  const deepDiveResult: DeepDiveResult = {
    topic,
    depth: getCurrentDepth() as 1 | 2 | 3,
    summary: `Deep dive on "${topic}" with ${sections.length} sections and ${allSources.length} sources.`,
    sections,
    sources: allSources,
    relatedTopics,
  };

  resetDepth();

  return {
    id: generateId(),
    queryId: query.id,
    type: 'deepdive',
    content: deepDiveResult,
    sources: allSources,
    timestamp: new Date(),
  };
}

// ============================================================================
// Progressive Hints
// ============================================================================

/**
 * Generate progressive hints for a query
 */
export async function getProgressiveHint(
  query: string,
  currentLevel: number,
  settings: Partial<LikuLearnSettings> = {}
): Promise<{ hint: string; level: number; hasMore: boolean }> {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };

  if (currentLevel >= 3) {
    // Give the full answer
    const response = await research(query, { ...mergedSettings, hintStyle: 'direct' });
    return {
      hint: formatResponseAsHint(response, 'direct'),
      level: 3,
      hasMore: false,
    };
  }

  // Generate hint based on level
  const queryType = classifyQuery(query);
  
  switch (currentLevel) {
    case 1:
      return {
        hint: generateLevel1Hint(query, queryType),
        level: 1,
        hasMore: true,
      };
    case 2:
      return {
        hint: await generateLevel2Hint(query, queryType),
        level: 2,
        hasMore: true,
      };
    default:
      return {
        hint: 'Think about what you\'re trying to find out...',
        level: 1,
        hasMore: true,
      };
  }
}

/**
 * Generate Level 1 hint (Socratic - make them think)
 */
function generateLevel1Hint(query: string, queryType: QueryType): string {
  const hints: Record<QueryType, string[]> = {
    math: [
      'What operation is this asking for?',
      'Can you identify the numbers and operators?',
      'What formula or method applies here?',
    ],
    language: [
      'Consider the root of the word...',
      'How is this word typically used?',
      'Think about similar words you know...',
    ],
    code: [
      'What programming concept is this related to?',
      'Where might this be defined?',
      'What keywords would you search for?',
    ],
    general: [
      'What topic area does this fall under?',
      'What do you already know about this?',
      'What specific aspect are you curious about?',
    ],
    deepdive: [
      'Start by understanding the basics...',
      'What is the core concept here?',
      'What related topics might be helpful?',
    ],
  };

  const options = hints[queryType] || hints.general;
  return `💭 **Hint 1:** ${options[Math.floor(Math.random() * options.length)]}`;
}

/**
 * Generate Level 2 hint (more specific guidance)
 */
async function generateLevel2Hint(query: string, queryType: QueryType): Promise<string> {
  switch (queryType) {
    case 'math':
      const mathMode = detectMathMode(query);
      if (mathMode === 'calculate') {
        return '🔍 **Hint 2:** Break down the expression step by step. What operation comes first? Remember PEMDAS/BODMAS.';
      } else if (mathMode === 'solve') {
        return '🔍 **Hint 2:** Isolate the variable by performing inverse operations on both sides of the equation.';
      }
      return '🔍 **Hint 2:** Identify what type of math problem this is and which formula applies.';

    case 'language':
      const langMode = detectLanguageMode(query);
      if (langMode === 'define') {
        return '🔍 **Hint 2:** Think about the context where you\'ve seen this word used before.';
      }
      return '🔍 **Hint 2:** Consider the word\'s parts - prefix, root, and suffix often reveal meaning.';

    case 'code':
      return '🔍 **Hint 2:** Check the documentation or search for examples of similar implementations.';

    default:
      return '🔍 **Hint 2:** Try searching for more specific terms related to your question.';
  }
}

/**
 * Format a response as a hint
 */
function formatResponseAsHint(response: LikuLearnResponse, style: HintStyle): string {
  if (style === 'direct') {
    // Return the full content
    if (typeof response.content === 'object') {
      if ('answer' in response.content) {
        return response.content.answer;
      }
      if ('output' in response.content) {
        return `Result: ${response.content.output}`;
      }
      if ('result' in response.content) {
        return response.content.result;
      }
      if ('summary' in response.content) {
        return response.content.summary;
      }
    }
    return JSON.stringify(response.content, null, 2);
  }

  // Progressive style - summarize
  return '✅ **Answer:** See the full response below.';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format response for display
 */
export function formatResponse(response: LikuLearnResponse): string {
  let output = '';

  switch (response.type) {
    case 'math':
      const math = response.content as any;
      output = `📐 **Math Result**\n\n`;
      output += `Input: \`${math.input}\`\n`;
      output += `Output: **${math.output}**\n`;
      if (math.steps) {
        output += `\nSteps:\n${math.steps.map((s: string, i: number) => `  ${i + 1}. ${s}`).join('\n')}`;
      }
      break;

    case 'language':
      const lang = response.content as any;
      output = `📚 **${lang.mode.charAt(0).toUpperCase() + lang.mode.slice(1)}**\n\n`;
      output += lang.result;
      if (lang.examples && lang.examples.length > 0) {
        output += `\n\n**Examples:**\n${lang.examples.join('\n')}`;
      }
      break;

    case 'code':
      const code = response.content as any;
      output = `💻 **Codebase Search**\n\n`;
      output += code.summary;
      if (code.files && code.files.length > 0) {
        for (const file of code.files.slice(0, 3)) {
          output += `\n\n📁 ${file.path}:\n`;
          for (const snippet of file.relevantLines.slice(0, 1)) {
            output += `\`\`\`\n${snippet.content}\n\`\`\``;
          }
        }
      }
      break;

    case 'deepdive':
      const dd = response.content as any;
      output = `🔬 **Deep Dive: ${dd.topic}**\n\n`;
      output += dd.summary + '\n\n';
      for (const section of dd.sections) {
        output += `### ${section.title}\n${section.content}\n\n`;
      }
      if (dd.relatedTopics && dd.relatedTopics.length > 0) {
        output += `\n**Related Topics:** ${dd.relatedTopics.join(', ')}`;
      }
      break;

    default:
      const general = response.content as any;
      output = general.answer || JSON.stringify(general, null, 2);
  }

  // Add sources
  if (response.sources && response.sources.length > 0) {
    output += '\n\n---\n**Sources:**\n';
    for (const source of response.sources.slice(0, 3)) {
      output += `• [${source.title}](${source.url})\n`;
    }
  }

  return output;
}
