import { parentPort } from 'worker_threads';
import { ChessSearch } from '../ChessSearch.js';

// Ensure we have a parent port to communicate with
if (!parentPort) {
  throw new Error('This file must be run as a worker thread');
}

// Create a search instance for this worker
// We reuse the instance to keep the transposition table warm across moves
const search = new ChessSearch();

parentPort.on('message', (task) => {
  try {
    if (task.type === 'SEARCH') {
      const { fen, depth, time } = task;
      
      // Run the search
      // The search is synchronous but running in this separate thread
      const result = search.search(fen, depth, time);
      
      // Send result back
      parentPort?.postMessage({
        type: 'RESULT',
        move: result.bestMove,
        evaluation: result.score,
        stats: {
          nodes: result.nodes,
          depth: result.depth,
          time: result.time,
          nps: result.nps
        }
      });
    } else if (task.type === 'STOP') {
      search.stop();
    } else if (task.type === 'CLEAR_CACHE') {
      search.clearTT();
    }
  } catch (error) {
    parentPort?.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
