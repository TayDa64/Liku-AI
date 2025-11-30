#!/usr/bin/env node
/**
 * Liku Learn CLI
 * 
 * Command-line interface for the Liku Learn wisdom center.
 * Usage: liku-learn [command] [query]
 * 
 * Commands:
 *   search <query>   - Web search
 *   math <expr>      - Math calculation
 *   define <word>    - Word definition
 *   code <query>     - Search codebase
 *   dive <topic>     - Deep dive research
 *   help             - Show help
 */

import meow from 'meow';
import { 
  research, 
  formatResponse, 
  classifyQuery,
  webSearch,
  processMath,
  processLanguage,
  searchCodebase,
  getCodebaseStats,
} from './index.js';
import { db } from '../services/DatabaseService.js';

const cli = meow(`
  Usage
    $ liku-learn [command] [query]

  Commands
    search <query>   Web search for a topic
    math <expr>      Calculate or solve math expressions
    define <word>    Get word definition
    synonyms <word>  Get synonyms for a word
    code <query>     Search the codebase
    stats            Show codebase statistics
    dive <topic>     Deep dive research on a topic
    history          Show research history
    help             Show this help

  Examples
    $ liku-learn search "react hooks tutorial"
    $ liku-learn math "2 + 2"
    $ liku-learn math "solve x^2 - 4 = 0"
    $ liku-learn define algorithm
    $ liku-learn code "DatabaseService"
    $ liku-learn dive "machine learning"
`, {
  importMeta: import.meta,
  flags: {
    verbose: {
      type: 'boolean',
      shortFlag: 'v',
      default: false,
    } as const,
    direct: {
      type: 'boolean',
      shortFlag: 'd',
      default: false,
    } as const,
  },
});

async function main() {
  const [command, ...args] = cli.input;
  const query = args.join(' ');

  if (!command || command === 'help') {
    cli.showHelp();
    return;
  }

  console.log('\n🎓 Liku Learn - Wisdom Center\n');

  try {
    switch (command) {
      case 'search': {
        if (!query) {
          console.error('❌ Please provide a search query');
          process.exit(1);
        }
        console.log(`🔍 Searching for: "${query}"...\n`);
        const results = await webSearch(query, 5);
        
        if (results.length === 0) {
          console.log('No results found.');
        } else {
          for (const result of results) {
            console.log(`📄 ${result.title}`);
            console.log(`   ${result.source}`);
            console.log(`   ${result.snippet.substring(0, 150)}...`);
            console.log(`   🔗 ${result.url}\n`);
          }
        }
        break;
      }

      case 'math': {
        if (!query) {
          console.error('❌ Please provide a math expression');
          process.exit(1);
        }
        console.log(`📐 Processing: "${query}"...\n`);
        const mathResult = await processMath(query);
        
        console.log(`Input:  ${mathResult.input}`);
        console.log(`Result: ${mathResult.output}`);
        
        if (mathResult.steps && mathResult.steps.length > 0) {
          console.log('\nSteps:');
          for (const step of mathResult.steps) {
            console.log(`  • ${step}`);
          }
        }
        break;
      }

      case 'define': {
        if (!query) {
          console.error('❌ Please provide a word to define');
          process.exit(1);
        }
        console.log(`📚 Looking up: "${query}"...\n`);
        const langResult = await processLanguage(query, 'define');
        console.log(langResult.result);
        
        if (langResult.examples && langResult.examples.length > 0) {
          console.log('\nExamples:');
          for (const example of langResult.examples) {
            console.log(`  • ${example}`);
          }
        }
        break;
      }

      case 'synonyms': {
        if (!query) {
          console.error('❌ Please provide a word');
          process.exit(1);
        }
        console.log(`📝 Finding synonyms for: "${query}"...\n`);
        const synResult = await processLanguage(query, 'synonyms');
        console.log(synResult.result);
        break;
      }

      case 'code': {
        if (!query) {
          console.error('❌ Please provide a search query');
          process.exit(1);
        }
        console.log(`💻 Searching codebase for: "${query}"...\n`);
        const codeResult = await searchCodebase({
          query,
          scope: 'likubuddy',
        });
        
        console.log(codeResult.summary);
        
        for (const file of codeResult.files.slice(0, 3)) {
          console.log(`\n📁 ${file.path}:`);
          for (const snippet of file.relevantLines.slice(0, 1)) {
            console.log(`   Lines ${snippet.startLine}-${snippet.endLine}:`);
            const lines = snippet.content.split('\n');
            for (const line of lines.slice(0, 5)) {
              console.log(`   ${line}`);
            }
            if (lines.length > 5) {
              console.log(`   ... (${lines.length - 5} more lines)`);
            }
          }
        }
        break;
      }

      case 'stats': {
        console.log('📊 Gathering codebase statistics...\n');
        const stats = await getCodebaseStats('likubuddy');
        
        console.log(`Total Files: ${stats.totalFiles}`);
        console.log(`Total Lines: ${stats.totalLines.toLocaleString()}`);
        console.log(`\nBy Extension:`);
        for (const [ext, count] of Object.entries(stats.byExtension).slice(0, 10)) {
          console.log(`  ${ext}: ${count}`);
        }
        console.log(`\nTop Directories:`);
        for (const dir of stats.topDirectories) {
          console.log(`  📁 ${dir}`);
        }
        break;
      }

      case 'dive': {
        if (!query) {
          console.error('❌ Please provide a topic');
          process.exit(1);
        }
        console.log(`🔬 Deep diving into: "${query}"...\n`);
        const response = await research(`deep dive ${query}`, {
          hintStyle: cli.flags.direct ? 'direct' : 'progressive',
        });
        console.log(formatResponse(response));
        break;
      }

      case 'history': {
        console.log('📜 Research History:\n');
        const history = await db.getLearnHistory(10);
        
        if (history.length === 0) {
          console.log('No history yet. Start researching!');
        } else {
          for (const entry of history) {
            const star = entry.isFavorite ? '⭐ ' : '';
            console.log(`${star}[${entry.queryType}] ${entry.query}`);
            console.log(`   ${entry.createdAt}\n`);
          }
        }
        break;
      }

      default: {
        // If no command matches, treat the entire input as a query
        const fullQuery = [command, ...args].join(' ');
        console.log(`🧠 Researching: "${fullQuery}"...\n`);
        
        const queryType = classifyQuery(fullQuery);
        console.log(`Detected type: ${queryType}\n`);
        
        const response = await research(fullQuery, {
          hintStyle: cli.flags.direct ? 'direct' : 'progressive',
        });
        
        console.log(formatResponse(response));
        
        // Save to history
        const settings = await db.getLearnSettings();
        if (settings.saveHistory) {
          await db.addLearnHistoryEntry(
            fullQuery,
            response.type,
            formatResponse(response),
            JSON.stringify(response.sources)
          );
        }
        break;
      }
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (cli.flags.verbose) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log('\n✨ Liku Learn - Wisdom is power!\n');
}

main().catch(console.error);
