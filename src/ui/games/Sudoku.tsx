import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';

interface SudokuProps {
  onExit: () => void;
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface Cell {
  value: number | null;
  isPreset: boolean;
  isConflict: boolean;
  isHint: boolean;  // Track cells filled by hints
}

// Check if a number is valid in a position
const isValidPlacement = (board: (number | null)[][], row: number, col: number, num: number): boolean => {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (c !== col && board[row][c] === num) return false;
  }
  // Check column
  for (let r = 0; r < 9; r++) {
    if (r !== row && board[r][col] === num) return false;
  }
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && board[r][c] === num) return false;
    }
  }
  return true;
};

// Generate a valid Sudoku puzzle - returns both puzzle and solution
const generateSudoku = (difficulty: string): { puzzle: (number | null)[][], solution: number[][] } => {
  // Start with a solved board pattern (shifted rows technique for simplicity)
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const board: number[][] = [];
  
  // Create a valid solved board using row/col shifting
  const shifts = [0, 3, 6, 1, 4, 7, 2, 5, 8];
  for (let row = 0; row < 9; row++) {
    const shiftedRow: number[] = [];
    for (let col = 0; col < 9; col++) {
      shiftedRow.push(base[(col + shifts[row]) % 9]);
    }
    board.push(shiftedRow);
  }
  
  // Shuffle rows within each 3-row band
  for (let band = 0; band < 3; band++) {
    const rows = [band * 3, band * 3 + 1, band * 3 + 2];
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [board[rows[i]], board[rows[j]]] = [board[rows[j]], board[rows[i]]];
    }
  }
  
  // Store the solution before removing cells
  const solution = board.map(row => [...row]);
  
  // Determine how many cells to remove
  let cellsToRemove: number;
  switch (difficulty) {
    case 'easy': cellsToRemove = 35; break;
    case 'hard': cellsToRemove = 55; break;
    default: cellsToRemove = 45; break; // medium
  }
  
  // Create puzzle by removing cells
  const puzzle: (number | null)[][] = board.map(row => [...row]);
  let removed = 0;
  while (removed < cellsToRemove) {
    const row = Math.floor(Math.random() * 9);
    const col = Math.floor(Math.random() * 9);
    if (puzzle[row][col] !== null) {
      puzzle[row][col] = null;
      removed++;
    }
  }
  
  return { puzzle, solution };
};

// Check if puzzle is completely solved
const isSolved = (board: Cell[][]): boolean => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col].value === null) return false;
      const values = board.map(r => r.map(c => c.value));
      if (!isValidPlacement(values, row, col, board[row][col].value!)) return false;
    }
  }
  return true;
};

const Sudoku: React.FC<SudokuProps> = ({ onExit, difficulty = 'medium' }) => {
  // Generate puzzle and solution once on mount
  const [{ puzzle: initialPuzzle, solution }] = useState(() => generateSudoku(difficulty));
  
  const [board, setBoard] = useState<Cell[][]>(() => {
    return initialPuzzle.map(row =>
      row.map(value => ({
        value,
        isPreset: value !== null,
        isConflict: false,
        isHint: false,
      }))
    );
  });
  
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [message, setMessage] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [stats, setStats] = useState<{ energy: number } | null>(null);

  // Load stats for hint cost display
  useEffect(() => {
    db.getStats().then(s => setStats({ energy: s.energy })).catch(() => {});
  }, [hintsUsed]);

  useEffect(() => {
    if (isSolved(board)) {
      setGameWon(true);
      const bonus = hintsUsed === 0 ? ' (No hints bonus! +10 XP)' : '';
      setMessage(`🎉 Congratulations! You solved it!${bonus}`);
      // Award XP on win
      db.getStats().then(s => {
        const xpReward = hintsUsed === 0 ? 30 : 20;
        db.updateStats({ xp: s.xp + xpReward, happiness: Math.min(100, s.happiness + 10) });
      }).catch(() => {});
    }
  }, [board]);

  // Use a hint - reveals the correct number for current cell
  const useHint = async () => {
    const cell = board[cursorRow][cursorCol];
    
    // Can't hint on preset or already correct cells
    if (cell.isPreset) {
      setMessage('💡 This is a preset cell!');
      return;
    }
    
    const correctValue = solution[cursorRow][cursorCol];
    if (cell.value === correctValue) {
      setMessage('💡 This cell is already correct!');
      return;
    }

    // Check if player has enough energy
    const currentStats = await db.getStats();
    if (currentStats.energy < 5) {
      setMessage('😴 Not enough energy for a hint! Rest first.');
      return;
    }

    // Deduct energy cost (hints tire Liku out)
    await db.updateStats({ energy: currentStats.energy - 5 });
    setStats({ energy: currentStats.energy - 5 });

    // Apply the hint
    const newBoard = board.map(row => row.map(c => ({ ...c })));
    newBoard[cursorRow][cursorCol].value = correctValue;
    newBoard[cursorRow][cursorCol].isHint = true;
    newBoard[cursorRow][cursorCol].isConflict = false;
    
    setBoard(newBoard);
    setHintsUsed(h => h + 1);
    setMessage(`💡 Hint used! (-5 Energy) [${hintsUsed + 1} hints]`);
  };

  useInput((input, key) => {
    if (key.escape) {
      onExit();
      return;
    }

    if (gameWon) return;

    // Hint key
    if (input === 'h' || input === 'H') {
      useHint();
      return;
    }

    // Navigation
    if (key.upArrow) {
      setCursorRow(r => Math.max(0, r - 1));
    } else if (key.downArrow) {
      setCursorRow(r => Math.min(8, r + 1));
    } else if (key.leftArrow) {
      setCursorCol(c => Math.max(0, c - 1));
    } else if (key.rightArrow) {
      setCursorCol(c => Math.min(8, c + 1));
    }

    // Number input
    if (/^[1-9]$/.test(input)) {
      if (!board[cursorRow][cursorCol].isPreset) {
        const num = parseInt(input, 10);
        const newBoard = board.map(row => row.map(cell => ({ ...cell })));
        newBoard[cursorRow][cursorCol].value = num;
        
        // Check for conflicts
        const values = newBoard.map(r => r.map(c => c.value));
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (newBoard[r][c].value !== null) {
              newBoard[r][c].isConflict = !isValidPlacement(values, r, c, newBoard[r][c].value!);
            }
          }
        }
        
        setBoard(newBoard);
        setMessage('');
      } else {
        setMessage('Cannot modify preset cells');
      }
    }

    // Clear cell (backspace, delete, or 0)
    if (input === '\x7F' || input === '\x08' || key.delete || input === '0') {
      if (!board[cursorRow][cursorCol].isPreset) {
        const newBoard = board.map(row => row.map(cell => ({ ...cell })));
        newBoard[cursorRow][cursorCol].value = null;
        newBoard[cursorRow][cursorCol].isConflict = false;
        setBoard(newBoard);
        setMessage('');
      }
    }
  });

  // Render a single cell with proper width
  const renderCell = (cell: Cell, row: number, col: number): React.ReactNode => {
    const isSelected = row === cursorRow && col === cursorCol;
    const displayValue = cell.value === null ? ' ' : cell.value.toString();
    
    let color: string = 'white';
    let bgColor: string | undefined = undefined;
    
    if (isSelected) {
      bgColor = 'blue';
      color = 'white';
    } else if (cell.isConflict) {
      color = 'red';
    } else if (cell.isPreset) {
      color = 'cyan';
    } else if (cell.isHint) {
      color = 'magenta';  // Hints shown in magenta
    } else if (cell.value !== null) {
      color = 'green';
    }

    return (
      <Text key={`${row}-${col}`} color={color} backgroundColor={bgColor}>
        {` ${displayValue} `}
      </Text>
    );
  };

  // Build the grid with proper box dividers
  const renderGrid = () => {
    const rows: React.ReactNode[] = [];
    
    // Top border
    rows.push(
      <Text key="top" color="gray">
        {'┌───┬───┬───╥───┬───┬───╥───┬───┬───┐'}
      </Text>
    );

    for (let row = 0; row < 9; row++) {
      // Cell row
      const cellRow: React.ReactNode[] = [];
      for (let col = 0; col < 9; col++) {
        // Left border or box divider
        if (col === 0) {
          cellRow.push(<Text key={`lb-${col}`} color="gray">│</Text>);
        } else if (col % 3 === 0) {
          cellRow.push(<Text key={`lb-${col}`} color="gray">║</Text>);
        } else {
          cellRow.push(<Text key={`lb-${col}`} color="gray">│</Text>);
        }
        
        cellRow.push(renderCell(board[row][col], row, col));
      }
      // Right border
      cellRow.push(<Text key="rb" color="gray">│</Text>);
      
      rows.push(<Box key={`row-${row}`}>{cellRow}</Box>);
      
      // Row separator
      if (row < 8) {
        if ((row + 1) % 3 === 0) {
          // Thick separator between boxes
          rows.push(
            <Text key={`sep-${row}`} color="gray">
              {'╞═══╪═══╪═══╬═══╪═══╪═══╬═══╪═══╪═══╡'}
            </Text>
          );
        } else {
          // Thin separator within box
          rows.push(
            <Text key={`sep-${row}`} color="gray">
              {'├───┼───┼───╫───┼───┼───╫───┼───┼───┤'}
            </Text>
          );
        }
      }
    }

    // Bottom border
    rows.push(
      <Text key="bottom" color="gray">
        {'└───┴───┴───╨───┴───┴───╨───┴───┴───┘'}
      </Text>
    );

    return rows;
  };

  return (
    <Box flexDirection="column" alignItems="center" padding={1}>
      <Text bold color="cyan">
        {'🧩 SUDOKU 🧩'}
      </Text>
      <Box>
        <Text dimColor>Difficulty: {difficulty}</Text>
        <Text>  </Text>
        <Text dimColor>Hints: </Text>
        <Text color={hintsUsed > 0 ? 'yellow' : 'green'}>{hintsUsed}</Text>
        {stats && (
          <>
            <Text>  </Text>
            <Text dimColor>Energy: </Text>
            <Text color={stats.energy > 20 ? 'green' : 'red'}>{stats.energy}%</Text>
          </>
        )}
      </Box>
      <Box marginY={1} />
      
      <Box flexDirection="column">
        {renderGrid()}
      </Box>
      
      <Box marginY={1} />
      
      {gameWon ? (
        <Text color="green" bold>{message}</Text>
      ) : (
        <Box flexDirection="column" alignItems="center">
          <Text color="yellow">
            ↑↓←→ Move | 1-9 Enter | 0/Del Clear | <Text color="magenta" bold>H</Text> Hint (-5⚡)
          </Text>
          {message && <Text color="magenta">{message}</Text>}
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text dimColor>Press ESC to exit</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>
          <Text color="cyan">■</Text> Preset  
          <Text color="green"> ■</Text> Your input  
          <Text color="magenta"> ■</Text> Hint  
          <Text color="red"> ■</Text> Conflict  
          <Text backgroundColor="blue" color="white"> ■ </Text> Cursor
        </Text>
      </Box>
    </Box>
  );
};

export default Sudoku;
