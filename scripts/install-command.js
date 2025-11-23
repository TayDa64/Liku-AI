import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const homeDir = os.homedir();
const geminiDir = path.join(homeDir, '.gemini');
const commandsDir = path.join(geminiDir, 'commands');
const sourceToml = path.join(process.cwd(), 'commands', 'liku.toml');
const destToml = path.join(commandsDir, 'liku.toml');

try {
  // Ensure .gemini/commands exists
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
    console.log(`Created directory: ${commandsDir}`);
  }

  // Read source
  let content = fs.readFileSync(sourceToml, 'utf-8');

  // Replace ${extensionPath} with current absolute path
  // Use forward slashes for compatibility in TOML strings
  const extensionPath = process.cwd().replace(/\\/g, '/');
  content = content.replace(/\$\{extensionPath\}/g, extensionPath);

  // Write to destination
  fs.writeFileSync(destToml, content, 'utf-8');

  console.log(`✅ Successfully installed /liku command to ${destToml}`);
  console.log(`   Extension path resolved to: ${extensionPath}`);
} catch (error) {
  console.error('❌ Failed to install /liku command:', error);
  process.exit(1);
}
