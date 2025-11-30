/**
 * Liku Learn - Language Engine
 * 
 * Provides language assistance: definitions, grammar, etymology, synonyms.
 * Uses free dictionary APIs and local processing.
 */

import { LanguageResult, LanguageMode } from '../types.js';
import { sanitizeQuery, checkRateLimit, sanitizeContent } from '../SafetyLayer.js';

// ============================================================================
// Constants
// ============================================================================

const FREE_DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const DATAMUSE_API = 'https://api.datamuse.com/words';
const TIMEOUT_MS = 5000;

// ============================================================================
// Main Function
// ============================================================================

/**
 * Process a language query
 */
export async function processLanguage(
  input: string,
  mode: LanguageMode = 'define'
): Promise<LanguageResult> {
  // Sanitize input
  const sanitized = sanitizeQuery(input);
  if (!sanitized.isValid) {
    throw new Error(sanitized.reason);
  }

  const word = sanitized.sanitizedInput!.trim().toLowerCase();

  switch (mode) {
    case 'define':
      return define(word);
    case 'synonyms':
      return synonyms(word);
    case 'antonyms':
      return antonyms(word);
    case 'etymology':
      return etymology(word);
    case 'grammar':
      return grammarCheck(input);
    case 'usage':
      return usageExamples(word);
    default:
      return define(word);
  }
}

/**
 * Detect appropriate language mode from input
 */
export function detectLanguageMode(input: string): LanguageMode | null {
  const lower = input.toLowerCase();

  if (/define|definition|meaning\s+of|what\s+does.*mean/.test(lower)) {
    return 'define';
  }
  if (/synonym|similar\s+words?|another\s+word\s+for/.test(lower)) {
    return 'synonyms';
  }
  if (/antonym|opposite|contrary/.test(lower)) {
    return 'antonyms';
  }
  if (/etymology|origin|where\s+does.*come\s+from|history\s+of\s+the\s+word/.test(lower)) {
    return 'etymology';
  }
  if (/grammar|correct|check\s+my/.test(lower)) {
    return 'grammar';
  }
  if (/how\s+to\s+use|example|sentence/.test(lower)) {
    return 'usage';
  }

  return null;
}

// ============================================================================
// Dictionary Functions
// ============================================================================

/**
 * Get word definition from Free Dictionary API
 */
async function define(word: string): Promise<LanguageResult> {
  const rateCheck = checkRateLimit('dictionary', 20, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const response = await fetch(`${FREE_DICTIONARY_API}/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          mode: 'define',
          word,
          result: `No definition found for "${word}"`,
        };
      }
      throw new Error(`Dictionary API returned ${response.status}`);
    }

    const data = await response.json() as DictionaryResponse[];
    const entry = data[0];

    // Build the result
    const definitions: string[] = [];
    const examples: string[] = [];

    for (const meaning of entry.meanings || []) {
      const partOfSpeech = meaning.partOfSpeech;
      for (const def of meaning.definitions?.slice(0, 2) || []) {
        definitions.push(`(${partOfSpeech}) ${def.definition}`);
        if (def.example) {
          examples.push(`"${def.example}"`);
        }
      }
    }

    // Get phonetic
    const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';

    let result = `**${word}** ${phonetic}\n\n`;
    result += definitions.slice(0, 4).map((d, i) => `${i + 1}. ${d}`).join('\n');

    return {
      mode: 'define',
      word,
      result: sanitizeContent(result, 1000),
      examples: examples.slice(0, 3),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Dictionary request timed out');
    }
    return {
      mode: 'define',
      word,
      result: `Error looking up "${word}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get synonyms using Datamuse API
 */
async function synonyms(word: string): Promise<LanguageResult> {
  const rateCheck = checkRateLimit('datamuse', 20, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const params = new URLSearchParams({
      rel_syn: word,
      max: '10',
    });

    const response = await fetch(`${DATAMUSE_API}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Datamuse API returned ${response.status}`);
    }

    const data = await response.json() as DatamuseWord[];
    
    if (data.length === 0) {
      return {
        mode: 'synonyms',
        word,
        result: `No synonyms found for "${word}"`,
      };
    }

    const synonymList = data.map(w => w.word).slice(0, 10);

    return {
      mode: 'synonyms',
      word,
      result: `Synonyms for "${word}": ${synonymList.join(', ')}`,
      related: synonymList,
    };
  } catch (error) {
    return {
      mode: 'synonyms',
      word,
      result: `Error finding synonyms: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get antonyms using Datamuse API
 */
async function antonyms(word: string): Promise<LanguageResult> {
  const rateCheck = checkRateLimit('datamuse', 20, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const params = new URLSearchParams({
      rel_ant: word,
      max: '10',
    });

    const response = await fetch(`${DATAMUSE_API}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Datamuse API returned ${response.status}`);
    }

    const data = await response.json() as DatamuseWord[];
    
    if (data.length === 0) {
      return {
        mode: 'antonyms',
        word,
        result: `No antonyms found for "${word}"`,
      };
    }

    const antonymList = data.map(w => w.word).slice(0, 10);

    return {
      mode: 'antonyms',
      word,
      result: `Antonyms for "${word}": ${antonymList.join(', ')}`,
      related: antonymList,
    };
  } catch (error) {
    return {
      mode: 'antonyms',
      word,
      result: `Error finding antonyms: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get word etymology (uses local database + dictionary API origin field)
 */
async function etymology(word: string): Promise<LanguageResult> {
  // First check local etymology database
  const localEtymology = ETYMOLOGY_DATABASE[word.toLowerCase()];
  if (localEtymology) {
    return {
      mode: 'etymology',
      word,
      result: localEtymology,
    };
  }

  // Try to get origin from dictionary API
  try {
    const response = await fetch(`${FREE_DICTIONARY_API}/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const data = await response.json() as DictionaryResponse[];
      const entry = data[0];
      
      if (entry.origin) {
        return {
          mode: 'etymology',
          word,
          result: `**Origin of "${word}":** ${entry.origin}`,
        };
      }
    }
  } catch {
    // Fall through to default response
  }

  return {
    mode: 'etymology',
    word,
    result: `Etymology for "${word}" not found in local database. Try a web search for detailed etymology.`,
  };
}

/**
 * Basic grammar check (local rules)
 */
async function grammarCheck(text: string): Promise<LanguageResult> {
  const issues: string[] = [];
  const corrections: string[] = [];

  // Common grammar checks
  const rules = [
    {
      pattern: /\bi\b(?!\s*\w)/gi,
      issue: 'Capitalize "I"',
      fix: (match: string) => 'I',
    },
    {
      pattern: /\s{2,}/g,
      issue: 'Multiple spaces',
      fix: () => ' ',
    },
    {
      pattern: /\bthere\s+(is|are)\s+\w+\s+(things?|items?|people)\b/gi,
      issue: 'Consider rephrasing "there is/are"',
      fix: null,
    },
    {
      pattern: /\b(your|you're)\b/gi,
      issue: 'Check your/you\'re usage',
      fix: null,
    },
    {
      pattern: /\b(their|there|they're)\b/gi,
      issue: 'Check their/there/they\'re usage',
      fix: null,
    },
    {
      pattern: /\b(its|it's)\b/gi,
      issue: 'Check its/it\'s usage',
      fix: null,
    },
    {
      pattern: /[.!?]\s*[a-z]/g,
      issue: 'Capitalize after sentence-ending punctuation',
      fix: null,
    },
    {
      pattern: /\b(alot)\b/gi,
      issue: '"alot" should be "a lot"',
      fix: () => 'a lot',
    },
    {
      pattern: /\b(definately)\b/gi,
      issue: 'Spelling: "definately" → "definitely"',
      fix: () => 'definitely',
    },
    {
      pattern: /\b(seperate)\b/gi,
      issue: 'Spelling: "seperate" → "separate"',
      fix: () => 'separate',
    },
    {
      pattern: /\b(recieve)\b/gi,
      issue: 'Spelling: "recieve" → "receive"',
      fix: () => 'receive',
    },
  ];

  let corrected = text;

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      issues.push(rule.issue);
      if (rule.fix) {
        corrected = corrected.replace(rule.pattern, rule.fix as any);
      }
    }
  }

  if (issues.length === 0) {
    return {
      mode: 'grammar',
      word: text.substring(0, 50) + '...',
      result: '✓ No obvious grammar issues detected.',
    };
  }

  let result = `**Issues found (${issues.length}):**\n`;
  result += issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n');
  
  if (corrected !== text) {
    result += `\n\n**Suggested correction:**\n${corrected}`;
  }

  return {
    mode: 'grammar',
    word: text.substring(0, 50) + '...',
    result,
    examples: [corrected],
  };
}

/**
 * Get usage examples for a word
 */
async function usageExamples(word: string): Promise<LanguageResult> {
  // Get examples from dictionary API
  try {
    const response = await fetch(`${FREE_DICTIONARY_API}/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const data = await response.json() as DictionaryResponse[];
      const examples: string[] = [];

      for (const entry of data) {
        for (const meaning of entry.meanings || []) {
          for (const def of meaning.definitions || []) {
            if (def.example) {
              examples.push(`• ${def.example}`);
            }
          }
        }
      }

      if (examples.length > 0) {
        return {
          mode: 'usage',
          word,
          result: `**Usage examples for "${word}":**\n${examples.slice(0, 5).join('\n')}`,
          examples: examples.slice(0, 5),
        };
      }
    }
  } catch {
    // Fall through
  }

  return {
    mode: 'usage',
    word,
    result: `No usage examples found for "${word}". Try a web search for more examples.`,
  };
}

// ============================================================================
// Local Etymology Database
// ============================================================================

const ETYMOLOGY_DATABASE: Record<string, string> = {
  algorithm: 'From al-Khwarizmi, a 9th-century Persian mathematician whose name was Latinized. His works introduced Hindu-Arabic numerals and algebraic concepts to the Western world.',
  computer: 'From Latin "computare" meaning "to calculate, sum up." Originally referred to a person who performed calculations. First used for machines in 1945.',
  bug: 'The term "bug" for a software error popularized in 1947 when a moth was found in a Harvard computer. However, the term was used earlier for mechanical defects.',
  byte: 'Coined in 1956 by Werner Buchholz while working on IBM. A deliberate respelling of "bite" to avoid confusion with "bit."',
  pixel: 'Blend of "picture" and "element." First used in 1965 in reference to digital image processing.',
  robot: 'From Czech "robota" meaning "forced labor." Coined by Karel Čapek in his 1920 play R.U.R. (Rossum\'s Universal Robots).',
  internet: 'Combination of "interconnected" and "network." The term emerged in the 1970s from ARPANET research.',
  wiki: 'From Hawaiian "wiki wiki" meaning "quick." Ward Cunningham named his software WikiWikiWeb in 1994.',
  avatar: 'From Sanskrit "avatāra" meaning "descent" (of a deity). Used in computing since 1985 for digital representations.',
  emoji: 'From Japanese 絵文字: 絵 (e, "picture") + 文字 (moji, "character"). First created in 1999 by Shigetaka Kurita.',
  python: 'Named after Monty Python\'s Flying Circus by Guido van Rossum, who was reading scripts from the show while developing the language.',
  java: 'Named after Java coffee, which the developers drank while creating the language. Originally called "Oak."',
  liku: 'From Swahili/Bantu languages, meaning "wisdom" or "knowledge." Represents accumulated understanding.',
};

// ============================================================================
// Type Definitions for API Responses
// ============================================================================

interface DictionaryResponse {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  origin?: string;
  meanings?: {
    partOfSpeech: string;
    definitions?: {
      definition: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }[];
  }[];
}

interface DatamuseWord {
  word: string;
  score?: number;
  tags?: string[];
}
