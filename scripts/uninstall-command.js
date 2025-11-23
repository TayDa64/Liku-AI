import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const homeDir = os.homedir();
const destToml = path.join(homeDir, '.gemini', 'commands', 'liku.toml');

try {
  if (fs.existsSync(destToml)) {
    fs.unlinkSync(destToml);
    console.log(`✅ Successfully removed /liku command from ${destToml}`);
  } else {
    console.log(`ℹ️  Command file not found at ${destToml}, skipping removal.`);
  }
} catch (error) {
  console.error('❌ Failed to remove /liku command:', error);
  process.exit(1);
}
