#!/usr/bin/env node
/**
 * Liku-AI WebSocket Server CLI
 * 
 * Standalone server for AI-vs-AI games and remote connections.
 * Run this instead of `npm start` to avoid TUI interference.
 * 
 * Usage:
 *   npx liku-server              # Start server on default port 3847
 *   npx liku-server --port 3850  # Custom port
 *   npx liku-server --help       # Show help
 * 
 * @module websocket/cli
 */

import { LikuWebSocketServer } from './server.js';
import { gameSessionManager } from './sessions.js';

interface ServerOptions {
  port: number;
  healthPort: number;
  maxClients: number;
  verbose: boolean;
}

function parseArgs(): ServerOptions {
  const args = process.argv.slice(2);
  const options: ServerOptions = {
    port: 3847,
    healthPort: 3848,
    maxClients: 100,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    
    if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10);
      options.healthPort = options.port + 1;
    }
    
    if (arg === '--health-port') {
      options.healthPort = parseInt(args[++i], 10);
    }
    
    if (arg === '--max-clients') {
      options.maxClients = parseInt(args[++i], 10);
    }
    
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              Liku-AI WebSocket Server                        ║
║          Standalone server for AI-vs-AI games                ║
╚══════════════════════════════════════════════════════════════╝

USAGE:
  npx liku-server [options]
  npm run server [-- options]

OPTIONS:
  -p, --port <port>       WebSocket port (default: 3847)
  --health-port <port>    Health check port (default: port+1)
  --max-clients <n>       Maximum concurrent clients (default: 100)
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message

EXAMPLES:
  npx liku-server                    # Start on port 3847
  npx liku-server -p 3850            # Start on port 3850
  npx liku-server -v                 # Verbose mode

AI-VS-AI GAME FLOW:
  1. Start this server: npx liku-server
  2. Connect Agent 1:   ws://localhost:3847?name=Agent1
  3. Connect Agent 2:   ws://localhost:3847?name=Agent2
  4. Agent 1 creates game:
     {"type":"action","payload":{"action":"game_create","gameType":"tictactoe"}}
  5. Agent 2 joins:
     {"type":"action","payload":{"action":"game_join","sessionId":"<id>","slot":"O"}}
  6. Game auto-starts when both players join
  7. Make moves:
     {"type":"action","payload":{"action":"game_move","sessionId":"<id>","row":0,"col":0}}

HEALTH ENDPOINTS:
  GET http://localhost:3848/health   - Server health status
  GET http://localhost:3848/ready    - Readiness probe
  GET http://localhost:3848/metrics  - Prometheus metrics

For more info: https://github.com/TayDa64/LikuBuddy
`);
}

function printBanner(options: ServerOptions): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██╗     ██╗██╗  ██╗██╗   ██╗     █████╗ ██╗                ║
║   ██║     ██║██║ ██╔╝██║   ██║    ██╔══██╗██║                ║
║   ██║     ██║█████╔╝ ██║   ██║    ███████║██║                ║
║   ██║     ██║██╔═██╗ ██║   ██║    ██╔══██║██║                ║
║   ███████╗██║██║  ██╗╚██████╔╝    ██║  ██║██║                ║
║   ╚══════╝╚═╝╚═╝  ╚═╝ ╚═════╝     ╚═╝  ╚═╝╚═╝                ║
║                                                              ║
║              WebSocket Server for AI Games                   ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  WebSocket:  ws://localhost:${String(options.port).padEnd(5)}                          ║
║  Health:     http://localhost:${String(options.healthPort).padEnd(4)}/health                 ║
║  Max Clients: ${String(options.maxClients).padEnd(4)}                                       ║
╠══════════════════════════════════════════════════════════════╣
║  Commands:                                                   ║
║    • Press Ctrl+C to stop the server                         ║
║    • Connect AI agents to play games                         ║
╚══════════════════════════════════════════════════════════════╝
`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  
  printBanner(options);

  const server = new LikuWebSocketServer({
    port: options.port,
    healthPort: options.healthPort,
    maxClients: options.maxClients,
    enableHeartbeat: true,
    enableRateLimiting: true,
  });

  // Event logging
  server.on('clientConnected', (clientId: string, metadata: { ip?: string }) => {
    console.log(`[+] Client connected: ${clientId.slice(0, 8)}... from ${metadata.ip || 'unknown'}`);
  });

  server.on('clientDisconnected', (clientId: string) => {
    console.log(`[-] Client disconnected: ${clientId.slice(0, 8)}...`);
  });

  // Session events
  server.on('sessionCreated', (session: { id: string; config: { gameType: string } }) => {
    console.log(`[GAME] Session created: ${session.id.slice(0, 12)}... (${session.config.gameType})`);
  });

  server.on('sessionGameStarted', (sessionId: string) => {
    console.log(`[GAME] Game started: ${sessionId.slice(0, 12)}...`);
  });

  server.on('sessionMoveMade', (sessionId: string, data: { slot?: string; row?: number; col?: number }) => {
    if (options.verbose) {
      console.log(`[GAME] Move: ${sessionId.slice(0, 8)}... - ${data.slot} at (${data.row},${data.col})`);
    }
  });

  server.on('sessionGameEnded', (sessionId: string, result: { winner?: string; isDraw?: boolean }) => {
    if (result.isDraw) {
      console.log(`[GAME] Game ended: ${sessionId.slice(0, 12)}... - DRAW`);
    } else {
      console.log(`[GAME] Game ended: ${sessionId.slice(0, 12)}... - Winner: ${result.winner}`);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[*] Shutting down server...');
    await server.stop();
    console.log('[*] Server stopped. Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await server.start();
    console.log('[*] Server is ready for connections!\n');
    
    // Print quick start guide
    console.log('Quick Start:');
    console.log('  1. Open another terminal');
    console.log('  2. Run: node scripts/test-ai-vs-ai.js');
    console.log('  3. Or connect your own AI agent to ws://localhost:' + options.port);
    console.log('');
  } catch (err) {
    console.error('[!] Failed to start server:', err);
    process.exit(1);
  }
}

main().catch(console.error);
