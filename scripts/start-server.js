#!/usr/bin/env node
/**
 * Simple WebSocket server starter
 */

// Use dynamic import for ES modules
async function main() {
  console.log('Starting Liku-AI WebSocket server...');
  
  const { wsServer } = await import('../dist/websocket/server.js');
  
  await wsServer.start();
  
  console.log('Server is running on port 3847');
  console.log('Health endpoint on port 3848');
  console.log('Press Ctrl+C to stop');
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
