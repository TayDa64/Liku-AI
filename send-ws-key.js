
import WebSocket from 'ws';

const port = 3847;
const ws = new WebSocket(`ws://localhost:${port}`);

const key = process.argv[2];
if (!key) {
  console.error('Usage: node send-ws-key.js <key>');
  process.exit(1);
}

ws.on('open', () => {
  console.log(`Connected to LikuBuddy on port ${port}`);
  
  const command = {
    type: 'key',
    payload: { key: key },
    requestId: 'cmd-' + Date.now()
  };

  ws.send(JSON.stringify(command));
  console.log(`Sent key: ${key}`);
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  if (response.type === 'ack' || response.type === 'error') {
    console.log('Response:', response);
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
