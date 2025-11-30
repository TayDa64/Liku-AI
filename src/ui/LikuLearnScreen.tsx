import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import {
  webSearch,
  processMathWithWolfram,
  detectMathMode,
  processLanguage,
  detectLanguageMode,
  searchCodebase,
  getCodebaseStats,
} from '../learn/index.js';
import { logGameState } from '../core/GameStateLogger.js';
import type {
  SearchResult,
  MathResult,
  LanguageResult,
  CodebaseResult,
  CodebaseFile,
} from '../learn/types.js';

interface LikuLearnScreenProps {
  onExit: () => void;
}

type LearnMode = 'menu' | 'search' | 'math' | 'define' | 'code' | 'stats' | 'dive' | 'result';

interface ResultState {
  type: 'search' | 'math' | 'define' | 'code' | 'stats' | 'dive';
  data: unknown;
}

// Type for stats result
interface StatsResult {
  totalFiles: number;
  totalLines: number;
  byExtension: Record<string, number>;
  topDirectories?: string[];
}

const LikuLearnScreen: React.FC<LikuLearnScreenProps> = ({ onExit }) => {
  const { stdout } = useStdout();
  const terminalWidth = useMemo(() => {
    const cols = stdout?.columns || 120;
    return Math.max(60, Math.min(Math.floor(cols * 0.95), 140));
  }, [stdout?.columns]);

  const [mode, setMode] = useState<LearnMode>('menu');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const menuItems = [
    { id: 'search', name: '🔍 Web Search', desc: 'Search the web using DuckDuckGo' },
    { id: 'math', name: '📐 Math', desc: 'Solve equations and calculations' },
    { id: 'define', name: '📚 Dictionary', desc: 'Look up word definitions' },
    { id: 'code', name: '💻 Code Search', desc: 'Search your codebase' },
    { id: 'stats', name: '📊 Codebase Stats', desc: 'Get project statistics' },
    { id: 'dive', name: '🔬 Deep Dive', desc: 'Comprehensive research' },
    { id: 'back', name: '🔙 Back to Menu', desc: 'Return to main menu' },
  ];

  // AI State Logging
  useEffect(() => {
    const status = `Liku Learn | Mode: ${mode} | Loading: ${loading}`;
    let visualState = `Current Mode: ${mode}\n`;
    
    if (mode === 'menu') {
      visualState += 'MENU ITEMS:\n';
      menuItems.forEach((item, idx) => {
        const selected = idx === selectedIndex ? '[x]' : '[ ]';
        visualState += `  ${selected} ${item.name}\n`;
      });
    } else if (mode === 'result' && result) {
      visualState += `Result Type: ${result.type}\n`;
    } else {
      visualState += `Input: ${inputValue}\n`;
    }
    
    logGameState("Liku Learn", status, visualState);
  }, [mode, selectedIndex, inputValue, loading, result]);

  const executeSearch = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await webSearch(query);
      setResult({ type: 'search', data: results });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const executeMath = async (expr: string) => {
    setLoading(true);
    setError(null);
    try {
      const mathMode = detectMathMode(expr) || 'calculate';
      const results = await processMathWithWolfram(expr, mathMode);
      setResult({ type: 'math', data: results });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const executeDefine = async (word: string) => {
    setLoading(true);
    setError(null);
    try {
      const langMode = detectLanguageMode(word) || 'define';
      const results = await processLanguage(word, langMode);
      setResult({ type: 'define', data: results });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const executeCode = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchCodebase({ query, scope: 'likubuddy' });
      setResult({ type: 'code', data: results });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const executeStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await getCodebaseStats('likubuddy');
      setResult({ type: 'stats', data: results });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const executeDive = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      // Deep dive combines codebase search + web search
      const codeResults = await searchCodebase({ query, scope: 'likubuddy' });
      const webResults = await webSearch(query);
      setResult({ 
        type: 'dive', 
        data: { codeSearch: codeResults, webSearch: webResults } 
      });
      setMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMenuSelect = () => {
    const item = menuItems[selectedIndex];
    if (item.id === 'back') {
      onExit();
    } else if (item.id === 'stats') {
      executeStats();
    } else {
      setMode(item.id as LearnMode);
      setInputValue('');
    }
  };

  const handleInputSubmit = (value: string) => {
    if (!value.trim()) return;

    switch (mode) {
      case 'search':
        executeSearch(value);
        break;
      case 'math':
        executeMath(value);
        break;
      case 'define':
        executeDefine(value);
        break;
      case 'code':
        executeCode(value);
        break;
      case 'dive':
        executeDive(value);
        break;
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'menu') {
        onExit();
      } else {
        setMode('menu');
        setResult(null);
        setError(null);
        setInputValue('');
      }
      return;
    }

    if (mode === 'menu') {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1));
      } else if (key.return) {
        handleMenuSelect();
      }
    }
  });

  // Render functions for each result type
  const renderSearchResults = (data: SearchResult[]) => (
    <Box flexDirection="column">
      <Text bold color="cyan">🔍 Search Results</Text>
      <Box marginTop={1} flexDirection="column">
        {data.length === 0 ? (
          <Text dimColor>No results found</Text>
        ) : (
          data.slice(0, 8).map((item: SearchResult, i: number) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text bold color="white">📄 {item.title}</Text>
              <Text dimColor>   {item.url.substring(0, 60)}...</Text>
              {item.snippet && (
                <Text wrap="wrap">   {item.snippet.substring(0, 100)}...</Text>
              )}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );

  const renderMathResult = (data: MathResult) => (
    <Box flexDirection="column">
      <Text bold color="cyan">📐 Math Result</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Input:  <Text bold>{data.input}</Text></Text>
        <Text>Result: <Text bold color="green">{data.output}</Text></Text>
        {data.steps && data.steps.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Steps:</Text>
            {data.steps.map((step: string, i: number) => (
              <Text key={i}>  • {step}</Text>
            ))}
          </Box>
        )}
        {data.wolfram && (
          <Box marginTop={1}>
            <Text dimColor>Wolfram: {data.wolfram}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderLanguageResult = (data: LanguageResult) => (
    <Box flexDirection="column">
      <Text bold color="cyan">📚 Language Result</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>{data.word}</Text>
        <Text wrap="wrap">{data.result}</Text>
        {data.examples && data.examples.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Examples:</Text>
            {data.examples.slice(0, 3).map((ex: string, i: number) => (
              <Text key={i} dimColor>  • {ex}</Text>
            ))}
          </Box>
        )}
        {data.related && data.related.length > 0 && (
          <Box marginTop={1}>
            <Text>Related: <Text color="yellow">{data.related.slice(0, 5).join(', ')}</Text></Text>
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderCodeResults = (data: CodebaseResult) => (
    <Box flexDirection="column">
      <Text bold color="cyan">💻 Code Search Results</Text>
      <Text dimColor>{data.summary}</Text>
      <Box marginTop={1} flexDirection="column">
        {data.files.slice(0, 8).map((file: CodebaseFile, i: number) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text bold color="yellow">📁 {file.path}</Text>
            <Text dimColor>   Score: {file.score.toFixed(1)}</Text>
            {file.relevantLines.slice(0, 1).map((snippet, j) => (
              <Text key={j} wrap="wrap" dimColor>
                   L{snippet.startLine}: {snippet.content.substring(0, 60)}...
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );

  const renderStatsResult = (data: StatsResult) => (
    <Box flexDirection="column">
      <Text bold color="cyan">📊 Codebase Statistics</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Total Files: <Text bold color="green">{data.totalFiles.toLocaleString()}</Text></Text>
        <Text>Total Lines: <Text bold color="green">{data.totalLines.toLocaleString()}</Text></Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>By Extension:</Text>
          {Object.entries(data.byExtension).slice(0, 8).map(([ext, count]) => (
            <Text key={ext}>  {ext}: {count}</Text>
          ))}
        </Box>
        {data.topDirectories && data.topDirectories.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Top Directories:</Text>
            {data.topDirectories.slice(0, 5).map((dir: string, i: number) => (
              <Text key={i}>  📁 {dir}</Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderDiveResult = (data: { codeSearch?: CodebaseResult; webSearch?: SearchResult[] }) => (
    <Box flexDirection="column">
      <Text bold color="cyan">🔬 Deep Dive Results</Text>
      <Box marginTop={1} flexDirection="column">
        {data.codeSearch && data.codeSearch.files.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>💻 From Codebase:</Text>
            {data.codeSearch.files.slice(0, 3).map((file: CodebaseFile, i: number) => (
              <Text key={i}>   📁 {file.path}</Text>
            ))}
          </Box>
        )}
        {data.webSearch && data.webSearch.length > 0 && (
          <Box flexDirection="column">
            <Text bold>🌐 From Web:</Text>
            {data.webSearch.slice(0, 3).map((item: SearchResult, i: number) => (
              <Text key={i}>   📄 {item.title}</Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderResult = () => {
    if (!result) return null;

    switch (result.type) {
      case 'search':
        return renderSearchResults(result.data as SearchResult[]);
      case 'math':
        return renderMathResult(result.data as MathResult);
      case 'define':
        return renderLanguageResult(result.data as LanguageResult);
      case 'code':
        return renderCodeResults(result.data as CodebaseResult);
      case 'stats':
        return renderStatsResult(result.data as StatsResult);
      case 'dive':
        return renderDiveResult(result.data as { codeSearch?: CodebaseResult; webSearch?: SearchResult[] });
      default:
        return <Text dimColor>Unknown result type</Text>;
    }
  };

  const getInputPrompt = (): string => {
    switch (mode) {
      case 'search': return 'Search query';
      case 'math': return 'Math expression';
      case 'define': return 'Word to define';
      case 'code': return 'Code search query';
      case 'dive': return 'Research topic';
      default: return 'Input';
    }
  };

  const getInputExample = (): string => {
    switch (mode) {
      case 'search': return 'e.g., "react hooks best practices"';
      case 'math': return 'e.g., "2 * (3 + 4)" or "sqrt(16)"';
      case 'define': return 'e.g., "wisdom" or "algorithm"';
      case 'code': return 'e.g., "useInput" or "useState"';
      case 'dive': return 'e.g., "typescript generics tutorial"';
      default: return '';
    }
  };

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" width={terminalWidth}>
        <Box marginBottom={1} flexDirection="column" alignItems="center">
          <Text bold color="magenta">🎓 Liku Learn - Wisdom Center 🎓</Text>
        </Box>
        <Box justifyContent="center">
          <Text color="yellow">⏳ Processing your request...</Text>
        </Box>
      </Box>
    );
  }

  // Result view
  if (mode === 'result' && result) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" width={terminalWidth}>
        <Box marginBottom={1} flexDirection="column" alignItems="center">
          <Text bold color="magenta">🎓 Liku Learn - Wisdom Center 🎓</Text>
        </Box>

        {renderResult()}

        {error && (
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    );
  }

  // Input mode (for modes that need input)
  if (mode !== 'menu' && mode !== 'result') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" width={terminalWidth}>
        <Box marginBottom={1} flexDirection="column" alignItems="center">
          <Text bold color="magenta">🎓 Liku Learn - Wisdom Center 🎓</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">{getInputPrompt()}</Text>
          <Text dimColor>{getInputExample()}</Text>
        </Box>

        <Box>
          <Text color="green">❯ </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleInputSubmit}
            placeholder="Type and press Enter..."
          />
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Press Esc to cancel, Enter to submit</Text>
        </Box>
      </Box>
    );
  }

  // Menu view (default)
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" width={terminalWidth}>
      <Box marginBottom={1} flexDirection="column" alignItems="center">
        <Text bold color="magenta">🎓 Liku Learn - Wisdom Center 🎓</Text>
        <Text dimColor>"Liku" means wisdom - Let's learn together!</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {menuItems.map((item, index) => (
          <Box key={item.id}>
            <Text color={index === selectedIndex ? 'green' : 'white'} bold={index === selectedIndex}>
              {index === selectedIndex ? '▶ ' : '  '}
              {item.name}
            </Text>
            {index === selectedIndex && (
              <Text dimColor> - {item.desc}</Text>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Use ↑/↓ to select, Enter to choose, Esc to exit</Text>
      </Box>
    </Box>
  );
};

export default LikuLearnScreen;
