import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ElicitationAgent } from '../builder/ElicitationAgent.js';
import { gameLoader } from '../core/GameLoader.js';

interface BuilderUIProps {
  onExit: () => void;
}

type BuilderStep = 'idea' | 'eliciting' | 'generating' | 'installing' | 'complete' | 'error';

const BuilderUI: React.FC<BuilderUIProps> = ({ onExit }) => {
  const [step, setStep] = useState<BuilderStep>('idea');
  const [gameIdea, setGameIdea] = useState('');
  const [questions, setQuestions] = useState('');
  const [answers, setAnswers] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [gameInfo, setGameInfo] = useState<{ id: string; name: string } | null>(null);
  const [useQuickGen, setUseQuickGen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
    
    // Toggle quick generation mode with 'q' key (only on idea input screen)
    if (input === 'q' && step === 'idea') {
      setUseQuickGen(prev => !prev);
    }
  });

  const handleIdeaSubmit = async () => {
    if (!gameIdea.trim()) return;

    setMessage('Starting elicitation...');
    setStep('eliciting');

    try {
      const agent = new ElicitationAgent();

      if (useQuickGen) {
        // Quick generation without questions
        setStep('generating');
        setMessage('Generating your game... This may take a moment.');
        
        const result = await agent.quickGenerate(gameIdea);
        
        // Validate the code
        const validation = gameLoader.validateGameCode(result.code);
        if (!validation.valid) {
          setError(`Generated code has issues: ${validation.errors.join(', ')}`);
          setStep('error');
          return;
        }

        // Install the game
        setStep('installing');
        setMessage('Installing game...');
        
        const installResult = await gameLoader.installGeneratedGame(result.code, {
          id: result.gameId,
          name: result.name,
          description: result.description
        });

        if (installResult.success) {
          setGameInfo({ id: result.gameId, name: result.name });
          setMessage(installResult.message);
          setStep('complete');
        } else {
          setError(installResult.error || installResult.message);
          setStep('error');
        }
      } else {
        // Full elicitation with questions
        const { questions: qs } = await agent.startElicitationSession(gameIdea);
        setQuestions(qs);
        setMessage('Please answer the following questions:');
        setStep('eliciting');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const handleAnswersSubmit = async () => {
    if (!answers.trim()) return;

    setStep('generating');
    setMessage('Generating your game based on your answers...');

    try {
      const agent = new ElicitationAgent();
      const result = await agent.generateGameFromAnswers(gameIdea, answers);

      // Validate the code
      const validation = gameLoader.validateGameCode(result.code);
      if (!validation.valid) {
        setError(`Generated code has issues: ${validation.errors.join(', ')}`);
        setStep('error');
        return;
      }

      // Install the game
      setStep('installing');
      setMessage('Installing game...');
      
      const installResult = await gameLoader.installGeneratedGame(result.code, {
        id: result.gameId,
        name: result.name,
        description: result.description
      });

      if (installResult.success) {
        setGameInfo({ id: result.gameId, name: result.name });
        setMessage(installResult.message);
        setStep('complete');
      } else {
        setError(installResult.error || installResult.message);
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const renderIdeaInput = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">🎮 LikuBuddy Game Builder 🎮</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text>Describe the game you want to create:</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text dimColor>Example: "A space shooter where I dodge asteroids"</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold>Your idea: </Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={(value) => {
            setGameIdea(value);
            setInputValue('');
            handleIdeaSubmit();
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue, Esc to exit</Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          {useQuickGen ? '⚡ Quick Mode: ON' : '🔍 Detailed Mode: ON'}
          {' '}
          <Text dimColor>(Toggle with 'q' for quick generation)</Text>
        </Text>
      </Box>
    </Box>
  );

  const renderEliciting = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="yellow">Questions about your game:</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text>{questions}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold>Your answers: </Text>
      </Box>
      
      <Box marginBottom={1}>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={(value) => {
            setAnswers(value);
            setInputValue('');
            handleAnswersSubmit();
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Answer the questions, then press Enter</Text>
      </Box>
    </Box>
  );

  const renderGenerating = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="yellow">⚙️ Generating your game...</Text>
      </Box>
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text dimColor>This may take 10-30 seconds...</Text>
      </Box>
    </Box>
  );

  const renderInstalling = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">💾 Installing your game...</Text>
      </Box>
      <Text>{message}</Text>
    </Box>
  );

  const renderComplete = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">✅ Success!</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      {gameInfo && (
        <Box marginBottom={1} borderStyle="single" borderColor="green" padding={1}>
          <Box flexDirection="column">
            <Text>
              <Text bold>Game Name: </Text>
              <Text color="cyan">{gameInfo.name}</Text>
            </Text>
            <Text>
              <Text bold>Game ID: </Text>
              <Text color="yellow">{gameInfo.id}</Text>
            </Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press Esc to return to the main menu</Text>
      </Box>
    </Box>
  );

  const renderError = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="red">❌ Error</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="red">{error}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Esc to return and try again</Text>
      </Box>
    </Box>
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={70}
    >
      {step === 'idea' && renderIdeaInput()}
      {step === 'eliciting' && renderEliciting()}
      {step === 'generating' && renderGenerating()}
      {step === 'installing' && renderInstalling()}
      {step === 'complete' && renderComplete()}
      {step === 'error' && renderError()}
    </Box>
  );
};

export default BuilderUI;
