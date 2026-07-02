import * as dotenv from "dotenv";
dotenv.config();
import { IConfig } from "./interface";

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

export const config: IConfig = {
  api: readEnv(process.env.API) || readEnv(process.env.ENDPOINT),
  openai_api_key: readEnv(process.env.OPENAI_API_KEY) || "123456789",
  model: readEnv(process.env.MODEL) || "gpt-3.5-turbo",
  chatPrivateTriggerKeyword: readEnv(process.env.CHAT_PRIVATE_TRIGGER_KEYWORD) || "",
  chatTriggerRule: readEnv(process.env.CHAT_TRIGGER_RULE) || "",
  disableGroupMessage: readEnv(process.env.DISABLE_GROUP_MESSAGE)?.toLowerCase() === "true",
  temperature: readTemperature(),
  blockWords: readCsvEnv(process.env.BLOCK_WORDS),
  chatgptBlockWords: readCsvEnv(process.env.CHATGPT_BLOCK_WORDS),
};
