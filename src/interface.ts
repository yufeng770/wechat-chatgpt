import {ChatCompletionRequestMessage} from "openai";

export interface IConfig {
  api?: string;
  openai_api_key: string;
  openaiUserAgent: string;
  model: string;
  chatCommandPrefix: string;
  chatTriggerRule: string;
  disableGroupMessage: boolean;
  temperature: number;
  blockWords: string[];
  chatgptBlockWords: string[];
  chatPrivateTriggerKeyword: string;
}
export interface User {
  username: string,
  chatMessage: Array<ChatCompletionRequestMessage>,
}
