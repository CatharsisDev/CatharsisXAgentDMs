import { GameWorker, GameFunction, ExecutableGameFunctionResponse, ExecutableGameFunctionStatus } from "@virtuals-protocol/game";
import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs';
import * as path from 'path';

interface TargetUser {
  userId: string;
  username: string;
  context?: string;
}

interface TargetUsersFile {
  all: TargetUser[];
}

export function createDMWorker(
  apiKey: string, 
  apiSecret: string, 
  accessToken: string, 
  accessSecret: string
): GameWorker {
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  const findTargetUser = new GameFunction({
    name: "find_target_user",
    description: "Find a target user to send a DM to",
    args: [],
    
    executable: async (args: any, logger?: ((msg: string) => void) | null) => {
      try {
        // Load target users
        const possiblePaths = [
          path.resolve(process.cwd(), 'plugins/dmPlugin/target_accounts.json'),
          path.resolve(process.cwd(), 'plugins/target_accounts.json'),
          path.resolve(process.cwd(), 'target_accounts.json'),
          path.resolve(__dirname, 'target_accounts.json')
        ];
        
        let users: TargetUser[] = [];
        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const parsed: TargetUsersFile = JSON.parse(fileContent);
            users = parsed.all || [];
            break;
          }
        }
        
        if (users.length === 0) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "No target users found."
          );
        }

        const randomUser = users[Math.floor(Math.random() * users.length)];
        console.log(`🎯 Selected target user: ${randomUser.username}`);
        
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Done,
          JSON.stringify({
            userId: randomUser.userId,
            username: randomUser.username,
            context: randomUser.context || "potential connection"
          })
        );
        
      } catch (error: any) {
        console.error('Error in find_target_user:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error: ${error.message}`
        );
      }
    }
  });

  const sendDM = new GameFunction({
    name: "send_dm",
    description: "Send a direct message to a specific user",
    args: [
      { name: "user_id", description: "ID of the user to send DM to" },
      { name: "message_text", description: "Text content of the DM" }
    ],
    executable: async (args: {user_id?: string, message_text?: string}, logger?: ((msg: string) => void) | null) => {
      try {
        const { user_id, message_text } = args;
        
        if (!user_id) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "User ID is required"
          );
        }
        
        if (!message_text) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Message text is required"
          );
        }

        if (message_text.length < 10 || message_text.length > 10000) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            "Message must be between 10 and 10,000 characters"
          );
        }
        
        console.log(`📨 Sending DM to user ${user_id}`);
        if (logger) logger(`Sending DM to user ${user_id}`);
        
        const dmResponse = await twitterClient.v2.sendDmToParticipant(user_id, { text: message_text }) as any;

if (!dmResponse.data) {
  return new ExecutableGameFunctionResponse(
    ExecutableGameFunctionStatus.Failed,
    "Failed to send DM"
  );
}

console.log("✅ DM sent successfully");
if (logger) logger(`DM sent successfully`);

return new ExecutableGameFunctionResponse(
  ExecutableGameFunctionStatus.Done,
  `DM sent successfully`
);
        
      } catch (error: any) {
        console.error('Error sending DM:', error);
        return new ExecutableGameFunctionResponse(
          ExecutableGameFunctionStatus.Failed,
          `Error sending DM: ${error.message}`
        );
      }
    }
  });

  return new GameWorker({
    id: "dm_worker",
    name: "DM Worker",
    description: "Worker that sends direct messages to target users",
    functions: [findTargetUser, sendDM]
  });
}