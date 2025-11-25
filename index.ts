import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { dmManager } from './plugins/dmPlugin/dmManager';

const DMS_PER_DAY_TARGET = 30; // Conservative: 60/hour limit
const DM_INTERVAL = 5 * 60 * 1000; // 24 minutes (60 per day)

let lastDMTime = 0;
let dailyDMs = 0;
let lastResetDate = '';

const STATE_FILE = '/app/data/dm_state.json';

function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      lastDMTime,
      dailyDMs,
      lastResetDate
    }, null, 2));
    
    console.log('💾 State saved');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      lastDMTime = state.lastDMTime || 0;
      dailyDMs = state.dailyDMs || 0;
      lastResetDate = state.lastResetDate || '';
      
      console.log('✅ State loaded:', { dailyDMs });
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

function resetDailyCounterIfNeeded(): void {
  const today = new Date().toISOString().split('T')[0];
  if (lastResetDate !== today) {
    dailyDMs = 0;
    lastResetDate = today;
    console.log(`📊 Daily counter reset. Date: ${today}`);
    saveState();
  }
}

async function attemptDM(): Promise<void> {
  const now = Date.now();
  const timeSinceLastDM = now - lastDMTime;
  
  resetDailyCounterIfNeeded();
  
  if (timeSinceLastDM < DM_INTERVAL) {
    const minutesRemaining = Math.round((DM_INTERVAL - timeSinceLastDM) / 60000);
    console.log(`⏰ Next DM in ${minutesRemaining} minutes`);
    return;
  }
  
  if (dailyDMs >= DMS_PER_DAY_TARGET) {
    console.log(`✅ Daily DM target reached (${dailyDMs}/${DMS_PER_DAY_TARGET})`);
    return;
  }
  
  console.log(`📨 Time to send DM (${dailyDMs}/${DMS_PER_DAY_TARGET} today)`);
  
  try {
    await dmManager.startDMCampaign(0);
    dailyDMs++;
    lastDMTime = Date.now();
    saveState();
    console.log("✅ DM sent successfully!");
  } catch (error: any) {
    console.log(`⚠️ DM failed:`, error.message);
  }
}

const server = http.createServer((request, response) => {
  if (request.url === '/') {
    const minutesSinceDM = Math.round((Date.now() - lastDMTime) / 60000);
    const minutesUntilNext = Math.max(0, Math.round((DM_INTERVAL - (Date.now() - lastDMTime)) / 60000));
    
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end(`AIleen DM Agent

Status: Running
DMs per day target: ${DMS_PER_DAY_TARGET}
DM interval: ${DM_INTERVAL / 60000} minutes

Stats:
- DMs Today: ${dailyDMs}/${DMS_PER_DAY_TARGET}

Timing:
- Last DM: ${minutesSinceDM} minutes ago
- Next DM: in ${minutesUntilNext} minutes
`);
    return;
  }
  
  if (request.url === '/send-dm') {
    attemptDM()
      .then(() => {
        response.writeHead(200, {'Content-Type': 'text/plain'});
        response.end('DM attempt completed');
      })
      .catch(err => {
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('Error: ' + err.message);
      });
    return;
  }
  
  if (request.url === '/reset') {
    dailyDMs = 0;
    saveState();
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end('Counter reset');
    return;
  }
  
  response.writeHead(404, {'Content-Type': 'text/plain'});
  response.end('Not found');
});

async function runScheduler(): Promise<void> {
  try {
    await attemptDM();
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  }
  
  setTimeout(runScheduler, 5 * 60 * 1000);
}

async function main(): Promise<void> {
  console.log("=========================================");
  console.log("🚀 AIleen DM Agent Starting...");
  console.log("=========================================");
  
  loadState();
  
  console.log("Environment check:");
  console.log("- OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY ? "✅" : "❌");
  console.log("- TWITTER_API_KEY:", !!process.env.TWITTER_API_KEY ? "✅" : "❌");
  console.log(`\n📊 Config: ${DMS_PER_DAY_TARGET} DMs/day (every ${DM_INTERVAL / 60000} minutes)\n`);
  
  try {
    console.log("Initializing DM manager...");
    await dmManager.initialize();
    console.log("✅ DM manager initialized!");
  } catch (error) {
    console.error("❌ Failed to initialize:", error);
    process.exit(1);
  }
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });
  
  console.log("⏰ Starting scheduler...");
  runScheduler();
  
  console.log("✅ DM agent running!");
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  saveState();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  saveState();
});

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});