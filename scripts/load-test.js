#!/usr/bin/env node
/**
 * WebSocket Load Testing Script for Liku-AI
 * 
 * Tests server capacity with many concurrent connections to establish
 * performance baselines before implementing Chess AI tournaments.
 * 
 * Usage:
 *   node scripts/load-test.js [options]
 * 
 * Options:
 *   --connections=100    Number of connections to create (default: 100)
 *   --ramp=10            Connections per second during ramp-up (default: 10)
 *   --duration=30        Test duration in seconds after ramp-up (default: 30)
 *   --url=ws://...       WebSocket server URL (default: ws://localhost:3847)
 *   --messages=1         Messages per second per client (default: 1)
 *   --verbose            Show detailed per-connection logs
 *   --profile            Enable detailed memory profiling
 * 
 * Examples:
 *   node scripts/load-test.js --connections=100
 *   node scripts/load-test.js --connections=500 --ramp=20 --duration=60
 *   node scripts/load-test.js --connections=1000 --profile
 */

import WebSocket from 'ws';

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value === undefined ? true : isNaN(value) ? value : Number(value);
  }
  return acc;
}, {});

// Configuration
const CONFIG = {
  connections: args.connections || 100,
  rampRate: args.ramp || 10,
  duration: args.duration || 30,
  url: args.url || 'ws://localhost:3847',
  messagesPerSecond: args.messages || 1,
  verbose: args.verbose || false,
  profile: args.profile || false,
};

// Statistics tracking
const stats = {
  connectionsAttempted: 0,
  connectionsSuccessful: 0,
  connectionsFailed: 0,
  connectionsActive: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: [],
  latencies: [],
  memorySnapshots: [],
  startTime: null,
  endTime: null,
};

// Active connections
const clients = new Map();

// Memory tracking
function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
    external: Math.round(mem.external / 1024 / 1024 * 100) / 100,
    rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024 * 100) / 100,
  };
}

// Format bytes for display
function formatMB(mb) {
  return `${mb.toFixed(2)} MB`;
}

// Calculate percentile
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Create a single WebSocket connection
function createConnection(id) {
  return new Promise((resolve) => {
    stats.connectionsAttempted++;
    const startTime = Date.now();
    
    try {
      const ws = new WebSocket(CONFIG.url);
      let connected = false;
      
      // Connection timeout
      const timeout = setTimeout(() => {
        if (!connected) {
          ws.terminate();
          stats.connectionsFailed++;
          stats.errors.push({ id, error: 'Connection timeout', time: Date.now() });
          resolve(null);
        }
      }, 10000);
      
      ws.on('open', () => {
        connected = true;
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        stats.latencies.push(latency);
        stats.connectionsSuccessful++;
        stats.connectionsActive++;
        
        if (CONFIG.verbose) {
          console.log(`  [${id}] Connected in ${latency}ms`);
        }
        
        clients.set(id, { ws, messageCount: 0, lastPing: Date.now() });
        resolve(ws);
      });
      
      ws.on('message', (data) => {
        stats.messagesReceived++;
        const client = clients.get(id);
        if (client) {
          client.messageCount++;
        }
      });
      
      ws.on('error', (err) => {
        if (!connected) {
          clearTimeout(timeout);
          stats.connectionsFailed++;
          stats.errors.push({ id, error: err.message, time: Date.now() });
          resolve(null);
        }
      });
      
      ws.on('close', () => {
        stats.connectionsActive--;
        clients.delete(id);
      });
      
    } catch (err) {
      stats.connectionsFailed++;
      stats.errors.push({ id, error: err.message, time: Date.now() });
      resolve(null);
    }
  });
}

// Send periodic messages from all clients
function startMessageLoop() {
  if (CONFIG.messagesPerSecond <= 0) return null;
  
  const interval = 1000 / CONFIG.messagesPerSecond;
  
  return setInterval(() => {
    for (const [id, client] of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          // Send a query message (lightweight)
          client.ws.send(JSON.stringify({
            type: 'query',
            query: 'gameState',
            requestId: `load-test-${id}-${Date.now()}`,
          }));
          stats.messagesSent++;
          client.lastPing = Date.now();
        } catch (err) {
          // Connection may have closed
        }
      }
    }
  }, interval);
}

// Memory snapshot loop
function startMemoryLoop() {
  return setInterval(() => {
    const snapshot = getMemoryUsage();
    snapshot.activeConnections = stats.connectionsActive;
    stats.memorySnapshots.push(snapshot);
    
    if (CONFIG.profile) {
      console.log(`  📊 Memory: Heap ${formatMB(snapshot.heapUsed)}/${formatMB(snapshot.heapTotal)}, RSS ${formatMB(snapshot.rss)}, Connections: ${snapshot.activeConnections}`);
    }
  }, 2000);
}

// Close all connections gracefully
async function closeAllConnections() {
  console.log('\n🔌 Closing all connections...');
  const closePromises = [];
  
  for (const [id, client] of clients) {
    closePromises.push(new Promise((resolve) => {
      client.ws.on('close', resolve);
      client.ws.close();
      setTimeout(resolve, 1000); // Force resolve after 1s
    }));
  }
  
  await Promise.all(closePromises);
}

// Print final report
function printReport() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const finalMemory = getMemoryUsage();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 LOAD TEST REPORT');
  console.log('='.repeat(60));
  
  console.log('\n🔗 CONNECTION STATISTICS');
  console.log(`  Target Connections:    ${CONFIG.connections}`);
  console.log(`  Attempted:             ${stats.connectionsAttempted}`);
  console.log(`  Successful:            ${stats.connectionsSuccessful} (${(stats.connectionsSuccessful / stats.connectionsAttempted * 100).toFixed(1)}%)`);
  console.log(`  Failed:                ${stats.connectionsFailed}`);
  console.log(`  Peak Active:           ${Math.max(...stats.memorySnapshots.map(s => s.activeConnections || 0))}`);
  
  console.log('\n⚡ LATENCY (Connection Time)');
  if (stats.latencies.length > 0) {
    console.log(`  Min:                   ${Math.min(...stats.latencies)}ms`);
    console.log(`  Max:                   ${Math.max(...stats.latencies)}ms`);
    console.log(`  Average:               ${Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)}ms`);
    console.log(`  P50:                   ${percentile(stats.latencies, 50)}ms`);
    console.log(`  P95:                   ${percentile(stats.latencies, 95)}ms`);
    console.log(`  P99:                   ${percentile(stats.latencies, 99)}ms`);
  } else {
    console.log(`  No successful connections`);
  }
  
  console.log('\n📨 MESSAGE STATISTICS');
  console.log(`  Messages Sent:         ${stats.messagesSent}`);
  console.log(`  Messages Received:     ${stats.messagesReceived}`);
  console.log(`  Throughput (sent):     ${(stats.messagesSent / duration).toFixed(1)} msg/s`);
  console.log(`  Throughput (recv):     ${(stats.messagesReceived / duration).toFixed(1)} msg/s`);
  
  console.log('\n💾 MEMORY USAGE (Client Process)');
  if (stats.memorySnapshots.length > 0) {
    const heapUsages = stats.memorySnapshots.map(s => s.heapUsed);
    const rssUsages = stats.memorySnapshots.map(s => s.rss);
    console.log(`  Heap Used (min):       ${formatMB(Math.min(...heapUsages))}`);
    console.log(`  Heap Used (max):       ${formatMB(Math.max(...heapUsages))}`);
    console.log(`  Heap Used (final):     ${formatMB(finalMemory.heapUsed)}`);
    console.log(`  RSS (min):             ${formatMB(Math.min(...rssUsages))}`);
    console.log(`  RSS (max):             ${formatMB(Math.max(...rssUsages))}`);
    console.log(`  RSS (final):           ${formatMB(finalMemory.rss)}`);
    
    // Estimate per-connection memory
    if (stats.connectionsSuccessful > 0) {
      const baselineHeap = stats.memorySnapshots[0]?.heapUsed || 0;
      const peakHeap = Math.max(...heapUsages);
      const perConnectionKB = ((peakHeap - baselineHeap) * 1024) / stats.connectionsSuccessful;
      console.log(`  Est. per connection:   ${perConnectionKB.toFixed(1)} KB`);
    }
  }
  
  console.log('\n⏱️  TIMING');
  console.log(`  Test Duration:         ${duration.toFixed(1)}s`);
  console.log(`  Ramp-up Time:          ${(stats.connectionsAttempted / CONFIG.rampRate).toFixed(1)}s`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ ERRORS');
    const errorTypes = {};
    stats.errors.forEach(e => {
      errorTypes[e.error] = (errorTypes[e.error] || 0) + 1;
    });
    Object.entries(errorTypes).forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`);
    });
  }
  
  // Overall assessment
  console.log('\n📋 ASSESSMENT');
  const successRate = stats.connectionsSuccessful / stats.connectionsAttempted;
  const avgLatency = stats.latencies.length > 0 
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
    : Infinity;
  
  if (successRate >= 0.99 && avgLatency < 100) {
    console.log(`  ✅ EXCELLENT - ${CONFIG.connections} connections handled smoothly`);
  } else if (successRate >= 0.95 && avgLatency < 500) {
    console.log(`  ✅ GOOD - ${CONFIG.connections} connections mostly successful`);
  } else if (successRate >= 0.80) {
    console.log(`  ⚠️  FAIR - Some connection issues at ${CONFIG.connections} connections`);
  } else {
    console.log(`  ❌ POOR - Server struggling with ${CONFIG.connections} connections`);
  }
  
  console.log('\n' + '='.repeat(60));
}

// Main test function
async function runLoadTest() {
  console.log('🚀 LIKU-AI WEBSOCKET LOAD TEST');
  console.log('='.repeat(60));
  console.log(`  URL:                   ${CONFIG.url}`);
  console.log(`  Target Connections:    ${CONFIG.connections}`);
  console.log(`  Ramp Rate:             ${CONFIG.rampRate} conn/s`);
  console.log(`  Test Duration:         ${CONFIG.duration}s (after ramp-up)`);
  console.log(`  Messages/Client/Sec:   ${CONFIG.messagesPerSecond}`);
  console.log('='.repeat(60));
  
  // Check if server is reachable
  console.log('\n🔍 Checking server availability...');
  try {
    const testWs = new WebSocket(CONFIG.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testWs.terminate();
        reject(new Error('Server not responding'));
      }, 5000);
      
      testWs.on('open', () => {
        clearTimeout(timeout);
        testWs.close();
        resolve();
      });
      
      testWs.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    console.log('  ✅ Server is reachable\n');
  } catch (err) {
    console.log(`  ❌ Cannot connect to server: ${err.message}`);
    console.log('\n  Make sure the WebSocket server is running:');
    console.log('    npm start');
    console.log('  Or start the server separately:');
    console.log('    node dist/websocket/server.js');
    process.exit(1);
  }
  
  stats.startTime = Date.now();
  
  // Start memory monitoring
  stats.memorySnapshots.push(getMemoryUsage());
  const memoryLoop = startMemoryLoop();
  
  // Ramp up connections
  console.log('📈 Ramping up connections...');
  const rampDelay = 1000 / CONFIG.rampRate;
  
  for (let i = 0; i < CONFIG.connections; i++) {
    createConnection(i); // Don't await - fire and forget for ramp
    
    // Progress indicator
    if ((i + 1) % Math.ceil(CONFIG.connections / 10) === 0 || i === CONFIG.connections - 1) {
      console.log(`  ${i + 1}/${CONFIG.connections} connections initiated (${stats.connectionsActive} active)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, rampDelay));
  }
  
  // Wait for all pending connections
  console.log('\n⏳ Waiting for pending connections...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log(`  ${stats.connectionsActive} connections established`);
  
  // Start message loop
  console.log('\n📨 Starting message loop...');
  const messageLoop = startMessageLoop();
  
  // Run test for specified duration
  console.log(`\n⏱️  Running test for ${CONFIG.duration} seconds...`);
  const testStart = Date.now();
  
  // Progress updates during test
  const progressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - testStart) / 1000);
    const remaining = CONFIG.duration - elapsed;
    if (remaining > 0) {
      process.stdout.write(`\r  ${remaining}s remaining... (${stats.connectionsActive} active, ${stats.messagesSent} sent, ${stats.messagesReceived} recv)`);
    }
  }, 1000);
  
  await new Promise(resolve => setTimeout(resolve, CONFIG.duration * 1000));
  
  clearInterval(progressInterval);
  console.log('\n');
  
  stats.endTime = Date.now();
  
  // Cleanup
  if (messageLoop) clearInterval(messageLoop);
  clearInterval(memoryLoop);
  
  await closeAllConnections();
  
  // Final memory snapshot
  stats.memorySnapshots.push(getMemoryUsage());
  
  // Print report
  printReport();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted! Cleaning up...');
  stats.endTime = Date.now();
  await closeAllConnections();
  printReport();
  process.exit(0);
});

// Run the test
runLoadTest().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
