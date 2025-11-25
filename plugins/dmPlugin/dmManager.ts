import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterApi } from '@virtuals-protocol/game-twitter-node';

dotenv.config();

const SENT_DMS_FILE = '/app/data/sent_dms.json';
const TARGET_ACCOUNTS_FILE = '/app/data/dm_target_accounts.json';
const MAX_DMS_PER_DAY = 30;

let sentDMs: Record<string, number> = {};
let dailyDMs = 0;
let lastDMResetDate = '';

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

const DM_TEMPLATE = `Hey! 👋 Noticed you're into mindfulness and self-development.
We're building something you might vibe with: daily insights, and a new kind of self-growth experience.
Check out our posts and if you're curious, we've just opened our program for early users of our app. Would love to hear what you think!`;

function loadSentDMs() {
  try {
    if (fs.existsSync(SENT_DMS_FILE)) {
      const data = fs.readFileSync(SENT_DMS_FILE, 'utf8');
      const saved = JSON.parse(data);
      sentDMs = saved.sentDMs || {};
      dailyDMs = saved.dailyDMs || 0;
      lastDMResetDate = saved.lastDMResetDate || '';
      console.log(`Loaded ${Object.keys(sentDMs).length} sent DMs, ${dailyDMs} today`);
    } else {
      ensureDirExists(path.dirname(SENT_DMS_FILE));
      saveSentDMs();
    }
  } catch (error) {
    console.error('Error loading sent DMs:', error);
    sentDMs = {};
  }
}

function saveSentDMs() {
  try {
    fs.writeFileSync(SENT_DMS_FILE, JSON.stringify({
      sentDMs,
      dailyDMs,
      lastDMResetDate
    }, null, 2));
    console.log(`Saved DM state: ${dailyDMs}/30 today`);
  } catch (error) {
    console.error('Error saving sent DMs:', error);
  }
}

function resetDailyDMsIfNeeded() {
  const today = new Date().toISOString().split('T')[0];
  if (lastDMResetDate !== today) {
    dailyDMs = 0;
    lastDMResetDate = today;
    console.log(`📊 Daily DM counter reset. Date: ${today}`);
    saveSentDMs();
  }
}

function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function findAndDMCommenters() {
  resetDailyDMsIfNeeded();
  
  if (dailyDMs >= MAX_DMS_PER_DAY) {
    console.log(`✅ Daily DM limit reached (${dailyDMs}/${MAX_DMS_PER_DAY})`);
    return;
  }
  
  console.log(`📬 Finding commenters to DM (${dailyDMs}/${MAX_DMS_PER_DAY} today)`);
  
  try {
    // Load target accounts
    const possiblePaths = [
      path.resolve(process.cwd(), 'plugins/dm_target_accounts.json'),
      path.resolve(process.cwd(), 'dm_target_accounts.json'),
      path.resolve(__dirname, 'dm_target_accounts.json'),
      TARGET_ACCOUNTS_FILE
    ];
    
    let targetAccounts: string[] = [];
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        targetAccounts = data.accounts || [];
        console.log(`Loaded ${targetAccounts.length} target accounts from ${filePath}`);
        break;
      }
    }
    
    if (targetAccounts.length === 0) {
      console.log('⚠️ No target accounts configured');
      return;
    }
    
    // Pick random account
    const randomAccount = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
    console.log(`🎯 Selected account: ${randomAccount}`);
    
    // Get user ID
    const userResponse = await twitterClient.v2.userByUsername(randomAccount);
    if (!userResponse.data) {
      console.log('Could not find user');
      return;
    }
    
    const userId = userResponse.data.id;
    console.log(`📥 Fetching mentions for user ${userId}`);
    
    // Get people who mentioned this user
    const mentions = await twitterClient.v2.userMentionTimeline(userId, {
      max_results: 10,
      'tweet.fields': ['author_id']
    });
    
const mentionsArray: any[] = [];
if (mentions.tweets && mentions.tweets.length > 0) {
  mentionsArray.push(...mentions.tweets);
}

if (mentionsArray.length === 0) {
  console.log('No mentions found');
  return;
}
    
    const commenters = new Set<string>();
    
    for (const mention of mentionsArray) {
      if (mention.author_id && commenters.size < 1) {
        if (!sentDMs[mention.author_id] && mention.author_id !== userId) {
          commenters.add(mention.author_id);
        }
      }
    }
   
    console.log(`Found ${commenters.size} new commenters to DM`);
    
    // Send DMs
    for (const commenterId of commenters) {
      if (dailyDMs >= MAX_DMS_PER_DAY) {
        console.log(`⏰ Hit daily DM limit (${dailyDMs}/${MAX_DMS_PER_DAY})`);
        break;
      }
      
      try {
        await twitterClient.v2.sendDmToParticipant(commenterId, { text: DM_TEMPLATE });
        
        console.log(`✅ Sent DM to user ${commenterId}`);
        
        sentDMs[commenterId] = Date.now();
        dailyDMs++;
        saveSentDMs();
        
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        
    } catch (error: any) {
  console.error(`Full error for ${commenterId}:`, {
    code: error.code,
    message: error.message,
    data: error.data,
    rateLimit: error.rateLimit,
    headers: error.headers
  });
  continue;
}
    }
    
  } catch (error: any) {
    console.error('Error in DM campaign:', error.message);
  }
}

export function startDMCampaign(intervalMinutes: number = 0) {
  if (intervalMinutes === 0) {
    console.log(`📬 Running one-time DM campaign`);
    loadSentDMs();
    return findAndDMCommenters();
  }
  
  console.log(`📬 Starting DM campaign every ${intervalMinutes} minutes`);
  loadSentDMs();
  findAndDMCommenters();
  
  return setInterval(() => {
    findAndDMCommenters();
  }, intervalMinutes * 60 * 1000);
}

export async function initializeDMManager() {
  console.log('DM campaign manager ready');
}

export const dmManager = {
  startDMCampaign,
  initialize: initializeDMManager
};