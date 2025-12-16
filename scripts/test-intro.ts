/**
 * Test the intro video player
 * 
 * Usage: npx tsx scripts/test-intro.ts <agent-id>
 * 
 * Example: npx tsx scripts/test-intro.ts claude-opus-4.5
 * 
 * Make sure you have a video file at: media/intros/<agent-id>.mp4 or .gif
 */

import { AGENTS, playIntroVideo, notifyIntroPlaying } from '../src/intro/IntroPlayer.js';

async function main() {
  const agentId = process.argv[2];
  
  if (!agentId) {
    console.log('AI Intro Video Tester');
    console.log('=====================\n');
    console.log('Usage: npx tsx scripts/test-intro.ts <agent-id>\n');
    console.log('Available agents:');
    for (const [id, agent] of Object.entries(AGENTS)) {
      console.log(`  ${id.padEnd(20)} - ${agent.name}`);
    }
    console.log('\nExample:');
    console.log('  npx tsx scripts/test-intro.ts claude-opus-4.5\n');
    console.log('Video files should be placed in:');
    console.log('  media/intros/<agent-id>.mp4  (preferred)');
    console.log('  media/intros/<agent-id>.gif  (fallback)\n');
    process.exit(1);
  }
  
  const agent = AGENTS[agentId];
  if (!agent) {
    console.log(`Unknown agent: ${agentId}`);
    console.log('Available agents:', Object.keys(AGENTS).join(', '));
    process.exit(1);
  }
  
  console.log(`\n🎬 Testing intro for: ${agent.name}`);
  console.log(`   Tagline: "${agent.tagline}"`);
  console.log(`   Expected video: ${agent.introVideo}`);
  console.log(`   Duration: ${agent.introDuration}s\n`);
  
  const { pid, duration } = playIntroVideo(agent);
  
  if (pid || duration > 0) {
    notifyIntroPlaying(agent, pid, duration);
    console.log(`✅ Video launched! Will auto-close in ${duration} seconds.`);
    console.log(`   Check likubuddy-state.txt for the INTRO notification.\n`);
  } else {
    console.log('❌ No video file found.');
    console.log(`   Please add: media/intros/${agentId}.mp4 or .gif\n`);
  }
}

main().catch(console.error);
