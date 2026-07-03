import {
  Configuration,
  ChatCompletionRequestMessageRoleEnum,
  CreateImageRequestResponseFormatEnum,
  CreateImageRequestSizeEnum,
  OpenAIApi
} from "openai";
import fs from "fs";
import DBUtils from "./data.js";
import {config} from "./config.js";

const configuration = new Configuration({
  apiKey: config.openai_api_key,
  basePath: config.api,
  baseOptions: {
    headers: {
      "User-Agent": config.openaiUserAgent,
    },
  },
});
const openai = new OpenAIApi(configuration);

interface ChatGPTOptions {
  historyMessage?: string;
  transientContext?: string;
}

function safeJson(value: any): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseMaybeJson(value: any): any {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function redactSensitive(value: any): any {
  if (!value || typeof value !== "object") {
    return typeof value === "string"
      ? value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***REDACTED***")
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey === "authorization" ||
        normalizedKey === "api-key" ||
        normalizedKey === "x-api-key" ||
        normalizedKey === "apikey" ||
        normalizedKey.includes("api_key")
      ) {
        return [key, "***REDACTED***"];
      }
      return [key, redactSensitive(item)];
    })
  );
}

function formatOpenAIError(error: any): string {
  const status = error?.response?.status;
  const statusText = error?.response?.statusText;
  const data = error?.response?.data;
  const method = error?.config?.method?.toUpperCase();
  const url = error?.config?.url;
  const responseMessage = typeof data === "string" ? data : data?.error?.message;
  const responseData = safeJson(data);
  return [
    `api=${config.api || "https://api.openai.com/v1"}`,
    `model=${config.model}`,
    `userAgent=${config.openaiUserAgent}`,
    status ? `status=${status}` : undefined,
    statusText ? `statusText=${statusText}` : undefined,
    method ? `method=${method}` : undefined,
    url ? `url=${url}` : undefined,
    responseMessage ? `message=${responseMessage}` : error?.message,
    responseData ? `response=${responseData}` : undefined,
  ].filter(Boolean).join(" ");
}

function logOpenAIError(error: any): void {
  const details = {
    message: error?.message,
    code: error?.code,
    request: {
      method: error?.config?.method?.toUpperCase(),
      url: error?.config?.url,
      timeout: error?.config?.timeout,
      headers: redactSensitive(error?.config?.headers),
      data: redactSensitive(parseMaybeJson(error?.config?.data)),
    },
    response: {
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      headers: redactSensitive(error?.response?.headers),
      data: redactSensitive(error?.response?.data),
    },
  };
  console.error(`ChatGPT request failed: ${formatOpenAIError(error)}`);
  console.error(`ChatGPT request failed details: ${safeJson(details)}`);
}

/**
 * Get completion from OpenAI
 * @param username
 * @param message
 */
async function chatgpt(username:string,message: string, options: ChatGPTOptions = {}): Promise<string> {
  // 先将用户输入的消息添加到数据库中
  DBUtils.addUserMessage(username, options.historyMessage || message);
  const messages = DBUtils.getChatMessage(username);
  const requestMessages = options.transientContext
    ? [
      ...messages.slice(0, -1),
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: [
          options.transientContext,
          "当前要回复的消息：",
          message,
          "直接输出要发到群里的回复，不要复述上下文，不要加人名冒号。",
        ].join("\n"),
      },
    ]
    : messages;
  console.log(`ChatGPT request: api=${config.api || "https://api.openai.com/v1"} model=${config.model} userAgent=${config.openaiUserAgent} messages=${requestMessages.length} temperature=${config.temperature} promptLength=${message.length} contextLength=${options.transientContext?.length || 0}`);
  const response = await openai.createChatCompletion({
    model: config.model,
    messages: requestMessages,
    temperature: config.temperature,
  }).catch((error) => {
    logOpenAIError(error);
    return undefined;
  });
  if (!response) {
    return "";
  }
  let assistantMessage = "";
  try {
    if (response.status === 200) {
      assistantMessage = response.data.choices[0]?.message?.content?.replace(/^\n+|\n+$/g, "") || "";
    }else{
      console.log(`Something went wrong,Code: ${response.status}, ${response.statusText}`)
    }
  }catch (e:any) {
    if (e.request){
      console.log("请求出错");
    }
  }
  return assistantMessage;
}

/**
 * Get image from Dall·E
 * @param username
 * @param prompt
 */
async function dalle(username:string,prompt: string) {
  const response = await openai.createImage({
    prompt: prompt,
    n:1,
    size: CreateImageRequestSizeEnum._256x256,
    response_format: CreateImageRequestResponseFormatEnum.Url,
    user: username
  }).then((res) => res.data).catch((err) => console.log(err));
  if (response) {
    return response.data[0].url;
  }else{
    return "Generate image failed"
  }
}

/**
 * Speech to text
 * @param username
 * @param videoPath
 */
async function whisper(username:string,videoPath: string): Promise<string> {
  const file:any= fs.createReadStream(videoPath);
  const response = await openai.createTranscription(file,"whisper-1")
    .then((res) => res.data).catch((err) => console.log(err));
  if (response) {
    return response.text;
  }else{
    return "Speech to text failed"
  }
}

export {chatgpt,dalle,whisper};
