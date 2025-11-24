import OpenAI from 'openai';
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
  
  console.log(`📬 Finding posts to extract commenters from (${dailyDMs}/${MAX_DMS_PER_DAY} DMs today)`);
  
  try {
    // Load target accounts to find their posts
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
    
    // Search for recent posts from this account
    const searchResults = await twitterClient.v2.search(`from:${randomAccount}`, {
      max_results: 10,
      'tweet.fields': ['author_id']
    });
    
    if (!searchResults.data || (searchResults.data as any).length === 0) {
      console.log('No tweets found from this account');
      return;
    }
    
    const tweets = searchResults.data as any;
    const randomTweet = tweets[Math.floor(Math.random() * tweets.length)];
    
    console.log(`📥 Fetching commenters for tweet ${randomTweet.id}`);
    
    // Get replies to this tweet
    const replies = await twitterClient.v2.search(`conversation_id:${randomTweet.id}`, {
      max_results: 20,
      'tweet.fields': ['author_id']
    });
    
    if (!replies.data || (replies.data as any).length === 0) {
      console.log('No replies found for this tweet');
      return;
    }
    
    const replyData = replies.data as any;
    const commenters = new Set<string>();
    
    // Collect unique commenter IDs
    for (const reply of replyData) {
      if (reply.author_id && commenters.size < 5) {
        if (!sentDMs[reply.author_id]) {
          commenters.add(reply.author_id);
        }
      }
    }
    
    console.log(`Found ${commenters.size} new commenters to DM`);
    
    // Send DMs
    for (const userId of commenters) {
      if (dailyDMs >= MAX_DMS_PER_DAY) {
        console.log(`⏰ Hit daily DM limit (${dailyDMs}/${MAX_DMS_PER_DAY})`);
        break;
      }
      
      try {
        await twitterClient.v2.sendDmToParticipant(userId, { text: DM_TEMPLATE });
        
        console.log(`✅ Sent DM to user ${userId}`);
        
        sentDMs[userId] = Date.now();
        dailyDMs++;
        saveSentDMs();
        
        // Rate limit: 2 seconds between DMs
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error: any) {
        console.error(`Error sending DM to ${userId}:`, error.message);
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