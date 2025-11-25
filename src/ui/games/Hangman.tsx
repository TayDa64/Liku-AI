import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';

interface HangmanProps {
    onExit: () => void;
}

const HANGMAN_PICS = [
`
  +---+
  |   |
      |
      |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\  |
      |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\  |
 /    |
      |
=========`,
`
  +---+
  |   |
  O   |
 /|\  |
 / \  |
      |
=========`
];

const Hangman: React.FC<HangmanProps> = ({ onExit }) => {
    const [word, setWord] = useState('');
    const [guessedLetters, setGuessedLetters] = useState<string[]>([]);
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');

    const startNewGame = async () => {
        const newWord = await db.getRandomHangmanWord();
        setWord(newWord.toUpperCase());
        setGuessedLetters([]);
        setWrongGuesses(0);
        setGameState('playing');
    };

    useEffect(() => {
        startNewGame();
    }, []);

    const handleGuess = (letter: string) => {
        if (gameState !== 'playing' || guessedLetters.includes(letter)) {
            return;
        }

        setGuessedLetters(prev => [...prev, letter]);

        if (!word.includes(letter)) {
            setWrongGuesses(prev => prev + 1);
        }
    };

    useInput((input, key) => {
        if (gameState !== 'playing') {
            if (key.return) {
                startNewGame();
            } else if (key.escape) {
                onExit();
            }
            return;
        }

        if (input && /^[a-zA-Z]$/.test(input)) {
            handleGuess(input.toUpperCase());
        } else if (key.escape) {
            onExit();
        }
    });

    useEffect(() => {
        if (!word) return;

        const wordGuessed = word.split('').every(letter => guessedLetters.includes(letter));
        if (wordGuessed) {
            setGameState('won');
            db.getStats().then(stats => {
                db.updateStats({ hangman_wins: stats.hangman_wins + 1, xp: stats.xp + 25 });
            });
        } else if (wrongGuesses >= HANGMAN_PICS.length - 1) {
            setGameState('lost');
            db.getStats().then(stats => {
                db.updateStats({ hangman_losses: stats.hangman_losses + 1 });
            });
        }
    }, [guessedLetters, wrongGuesses, word]);

    const displayedWord = word
        .split('')
        .map(letter => (guessedLetters.includes(letter) ? letter : '_'))
        .join(' ');

    return (
        <Box flexDirection="column" alignItems="center">
            <Box marginBottom={1}>
                <Text bold color="yellow">H A N G M A N</Text>
            </Box>

            <Box>
                <Text>{HANGMAN_PICS[wrongGuesses]}</Text>
            </Box>

            <Box marginTop={1}>
                <Text bold color="cyan">{displayedWord}</Text>
            </Box>

            <Box marginTop={1}>
                <Text>Guessed: {guessedLetters.join(', ')}</Text>
            </Box>

            {gameState === 'playing' && (
                <Box marginTop={1}>
                    <Text dimColor>Type a letter to guess. Press Esc to quit.</Text>
                </Box>
            )}

            {gameState === 'won' && (
                <Box marginTop={1} flexDirection="column" alignItems="center">
                    <Text color="green" bold>You won! (+25 XP)</Text>
                    <Text dimColor>Press Enter to play again, or Esc to exit.</Text>
                </Box>
            )}

            {gameState === 'lost' && (
                <Box marginTop={1} flexDirection="column" alignItems="center">
                    <Text color="red" bold>You lost!</Text>
                    <Text>The word was: <Text bold>{word}</Text></Text>
                    <Text dimColor>Press Enter to play again, or Esc to exit.</Text>
                </Box>
            )}
        </Box>
    );
};

export default Hangman;
