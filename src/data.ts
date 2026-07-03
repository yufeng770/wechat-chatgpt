import {ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai";
import {GroupMemoryMessage, User} from "./interface";
import {isTokenOverLimit} from "./utils.js";
import {config} from "./config.js";

const DEFAULT_SYSTEM_PROMPT = [
  "你在微信群里像一个熟人群友，不是客服，也不是老师。",
  "你的目标是把话说得自然、直接、有用，有来有回。默认 1~3 句，能一句话说完就一句。",
  "",
  "口吻：",
  "别人正常问问题，你就正常帮忙，少废话。",
  "整体有点 nmbot 和贴吧老哥的味道：短、欠、嘴硬、反应快，像群里一个有脾气但不失控的活人。",
  "别人开玩笑、阴阳怪气或嘴欠，你可以轻微回怼，别急着道歉、安抚、讲大道理。",
  "别人骂你，你不用认错，用贴吧老哥那种暴躁嘴臭风格骂回去，短句、有攻击性、有网感，比如“差不多得了，别搁这犯病”“你先把话说利索再来冲我”“这理解能力也太抽象了”。",
  "骂回去可以带脏话和嘲讽，但不要威胁、歧视、人肉、诅咒现实伤害，也不要攻击种族、地域、性别、疾病、残障等身份。",
  "不要主动升级冲突；对方没骂你时别突然嘴臭。嘴硬可以，别为了嘴硬乱编。",
  "",
  "回复风格：",
  "群聊上下文只是背景，用来判断谁在说什么和话题走向；不要复述上下文，不要逐条总结，直接接当前这句话。",
  "技术问题直接给解决方法或结论，不要先介绍背景知识。",
  "不主动总结，不主动延伸话题，不主动教育用户。不重复用户的问题。",
  "不使用 Markdown、标题、列表、表格、引用、代码块，保持普通微信聊天风格。",
  "不使用“好的”“当然可以”“以下是”“总结一下”“希望对你有帮助”“如果还有问题欢迎继续问”等 AI 常用表达。",
  "可以自然使用“应该”“估计”“我猜”“我印象里”“大概率”等表达；不确定时直接说明，不要编造。",
  "可以偶尔使用少量 Emoji，但不要刻意卖萌，也不要每句话都带。",
  "如果一句“可以”“不行”“是这个原因”就够了，就不要继续扩展。",
  "请始终以微信群聊天的节奏回复，让人感觉这是一个真实的人，而不是 AI。"
].join("\n");

/**
 * 使用内存作为数据库
 */

class DB {
  private static data: User[] = [];
  private static groupMemory: Record<string, GroupMemoryMessage[]> = {};

  /**
   * 添加一个用户, 如果用户已存在则返回已存在的用户
   * @param username
   */
  public addUser(username: string): User {
    let existUser = DB.data.find((user) => user.username === username);
    if (existUser) {
      console.log(`用户${username}已存在`);
      return existUser;
    }
    const newUser: User = {
      username: username,
      chatMessage: [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: DEFAULT_SYSTEM_PROMPT
        }
      ],
    };
    DB.data.push(newUser);
    return newUser;
  }

  /**
   * 根据用户名获取用户, 如果用户不存在则添加用户
   * @param username
   */
  public getUserByUsername(username: string): User {
    return DB.data.find((user) => user.username === username) || this.addUser(username);
  }

  /**
   * 获取用户的聊天记录
   * @param username
   */
  public getChatMessage(username: string): Array<ChatCompletionRequestMessage> {
    return this.getUserByUsername(username).chatMessage;
  }

  /**
   * 设置用户的prompt
   * @param username
   * @param prompt
   */
  public setPrompt(username: string, prompt: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      user.chatMessage.find(
        (msg) => msg.role === ChatCompletionRequestMessageRoleEnum.System
      )!.content = prompt;
    }
  }

  /**
   * 添加用户输入的消息
   * @param username
   * @param message
   */
  public addUserMessage(username: string, message: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      while (isTokenOverLimit(user.chatMessage)){
        // 删除从第2条开始的消息(因为第一条是prompt)
        user.chatMessage.splice(1,1);
      }
      user.chatMessage.push({
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: message,
      });
    }
  }

  /**
   * 添加ChatGPT的回复
   * @param username
   * @param message
   */
  public addAssistantMessage(username: string, message: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      while (isTokenOverLimit(user.chatMessage)){
        // 删除从第2条开始的消息(因为第一条是prompt)
        user.chatMessage.splice(1,1);
      }
      user.chatMessage.push({
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: message,
      });
    }
  }

  public addGroupMemoryMessage(roomKey: string, message: Omit<GroupMemoryMessage, "timestamp">): void {
    const text = message.text.trim();
    if (!text || config.groupMemorySize <= 0) {
      return;
    }
    const messages = DB.groupMemory[roomKey] || [];
    messages.push({
      ...message,
      text,
      timestamp: Date.now(),
    });
    if (messages.length > config.groupMemorySize) {
      messages.splice(0, messages.length - config.groupMemorySize);
    }
    DB.groupMemory[roomKey] = messages;
  }

  public getGroupMemory(roomKey: string): GroupMemoryMessage[] {
    return [...(DB.groupMemory[roomKey] || [])];
  }

  public getGroupMemoryPrompt(roomKey: string): string | undefined {
    const messages = this.getGroupMemory(roomKey);
    if (messages.length === 0) {
      return undefined;
    }
    return [
      "群聊最近上下文，按时间从旧到新。只当背景，不要复述：",
      ...messages.map((message) => `${message.speakerName}: ${message.text}`),
    ].join("\n");
  }

  /**
   * 清空用户的聊天记录, 并将prompt设置为默认值
   * @param username
   */
  public clearHistory(username: string): void {
    const user = this.getUserByUsername(username);
    if (user) {
      user.chatMessage = [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: DEFAULT_SYSTEM_PROMPT
        }
      ];
    }
  }

  public getAllData(): User[] {
    return DB.data;
  }
}
const DBUtils = new DB();
export default DBUtils;
