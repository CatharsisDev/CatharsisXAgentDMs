import { GameAgent, LLMModel } from "@virtuals-protocol/game";
import { twitterPlugin } from "./plugins/twitterPlugin/twitterPlugin";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.API_KEY) {
    throw new Error('API_KEY is required');
}

const twitterWorker = twitterPlugin.getWorker();

export const wisdom_agent = new GameAgent(process.env.API_KEY, {
    name: "AIleen",
    goal: "Reply to tweets with helpful wisdom",
    description: "You reply to relevant tweets with thoughtful, practical wisdom.",
    workers: [twitterWorker],
    llmModel: LLMModel.Llama_3_3_70B_Instruct,
});