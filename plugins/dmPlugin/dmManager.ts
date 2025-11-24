import { createDMWorker } from './dmPlugin';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SENT_DMS_FILE = '/app/data/sent_dms.json';

let sentDMs: Record<string, number> = {};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const dmWorker = createDMWorker(
  process.env.TWITTER_API_KEY as string,
  process.env.TWITTER_API_SECRET as string,
  process.env.TWITTER_ACCESS_TOKEN as string,
  process.env.TWITTER_ACCESS_SECRET as string
);

function loadSentDMs() {
  try {
    if (fs.existsSync(SENT_DMS_FILE)) {
      const data = fs.readFileSync(SENT_DMS_FILE, 'utf8');
      sentDMs = JSON.parse(data);
      console.log(`Loaded ${Object.keys(sentDMs).length} sent DMs from file`);
    } else {
      console.log('No sent DMs file found, starting fresh');
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
    fs.writeFileSync(SENT_DMS_FILE, JSON.stringify(sentDMs, null, 2));
    console.log(`Saved ${Object.keys(sentDMs).length} sent DMs to file`);
  } catch (error) {
    console.error('Error saving sent DMs:', error);
  }
}

function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function findAndSendDM() {
  console.log(`📬 Running scheduled DM check`);
  
  try {
    const findResult = await dmWorker.functions
      .find(f => f.name === 'find_target_user')
      ?.executable({}, (msg: string) => console.log(`[Find User] ${msg}`));
    
    if (!findResult || findResult.status !== 'done') {
      console.error('Failed to find target user:', findResult?.feedback || 'Unknown error');
      return;
    }

    const userInfo = JSON.parse(findResult.feedback);
    console.log(`Found user: ${userInfo.username} (${userInfo.userId})`);
    
    if (sentDMs[userInfo.userId]) {
      console.log(`Already sent DM to user ${userInfo.userId}, skipping`);
      return;
    }

    console.log('Generating DM content with OpenAI...');
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Write a friendly, personalized DM to @${userInfo.username} who is a ${userInfo.context}.

Your message should:
- Be warm and genuine
- Show you appreciate their work
- Be 2-3 sentences
- NOT be salesy or pushy
- NOT ask for anything
- Sound human and natural

Keep it under 280 characters.`
        }]
      });

      let dmText = response.choices[0].message.content?.trim() || '';
      
      console.log('OpenAI response:', dmText);

      if (dmText.length < 10) {
        console.log("⚠️ Invalid DM content, skipping:", dmText);
        return;
      }

      const sendResult = await dmWorker.functions
        .find(f => f.name === 'send_dm')
        ?.executable({ 
          user_id: userInfo.userId,
          message_text: dmText
        }, (msg: string) => console.log(`[Send DM] ${msg}`));
      
      if (!sendResult || sendResult.status !== 'done') {
        console.error('Failed to send DM:', sendResult?.feedback || 'Unknown error');
        return;
      }
      
      console.log('DM sent successfully:', sendResult.feedback);
      
      sentDMs[userInfo.userId] = Date.now();
      saveSentDMs();
      
    } catch (error) {
      console.error('Error generating or sending DM:', error);
    }
    
  } catch (error) {
    console.error('Error in find and send DM process:', error);
  }
}

export function startDMCampaign(intervalMinutes: number = 0) {
  if (intervalMinutes === 0) {
    console.log(`📬 Running one-time DM send`);
    loadSentDMs();
    return findAndSendDM();
  }
  
  console.log(`📬 Starting DM campaign every ${intervalMinutes} minutes`);
  loadSentDMs();
  findAndSendDM();
  
  return setInterval(() => {
    findAndSendDM();
  }, intervalMinutes * 60 * 1000);
}

export async function initializeDMManager() {
  console.log('DM worker ready (using OpenAI for message generation)');
}

export const dmManager = {
  startDMCampaign,
  initialize: initializeDMManager,
  worker: dmWorker
};