import * as dotenv from "dotenv";
dotenv.config();
import { IConfig, KeywordReply } from "./interface";

const readEnv = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^["']|["']$/g, "") : undefined;
};

const readCsvEnv = (value?: string): string[] => {
  const envValue = readEnv(value);
  return envValue ? envValue.split(",").map((word) => word.trim()).filter(Boolean) : [];
};

const readTemperature = (): number => {
  const temperature = Number.parseFloat(readEnv(process.env.TEMPERATURE) || "");
  return Number.isFinite(temperature) ? temperature : 0.6;
};

const readKeywordReplies = (value?: string): KeywordReply[] => {
  const envValue = readEnv(value);
  if (!envValue) {
    return [];
  }
  return envValue
    .split(";")
    .map((rule) => {
      const [keyword, replies] = rule.split("=");
      return {
        keyword: keyword?.trim(),
        replies: replies?.split("|").map((reply) => reply.trim()).filter(Boolean) || [],
      };
    })
    .filter((rule): rule is KeywordReply => Boolean(rule.keyword && rule.replies.length));
};

export const config: IConfig = {
  api: readEnv(process.env.API) || readEnv(process.env.ENDPOINT),
  openai_api_key: readEnv(process.env.OPENAI_API_KEY) || "123456789",
  openaiUserAgent: readEnv(process.env.OPENAI_USER_AGENT) || "PostmanRuntime/7.45.0",
  model: readEnv(process.env.MODEL) || "gpt-3.5-turbo",
  chatCommandPrefix: readEnv(process.env.CHAT_COMMAND_PREFIX) || "/ai",
  chatPrivateTriggerKeyword: readEnv(process.env.CHAT_PRIVATE_TRIGGER_KEYWORD) || "",
  chatTriggerRule: readEnv(process.env.CHAT_TRIGGER_RULE) || "",
  disableGroupMessage: readEnv(process.env.DISABLE_GROUP_MESSAGE)?.toLowerCase() === "true",
  temperature: readTemperature(),
  blockWords: readCsvEnv(process.env.BLOCK_WORDS),
  chatgptBlockWords: readCsvEnv(process.env.CHATGPT_BLOCK_WORDS),
  keywordReplies: readKeywordReplies(process.env.KEYWORD_REPLIES),
};
