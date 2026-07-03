import {ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai";
import {User} from "./interface";
import {isTokenOverLimit} from "./utils.js";

const DEFAULT_SYSTEM_PROMPT = [
  "你的目标不是回答得最全面，而是回答得自然、真实、有帮助，让人感觉像在和一个经验丰富的群友交流。",
  "",
  "回复风格：",
  "默认回复 1~3 句话。能一句话说清就不要写第二句。除非明确要求详细解释，否则不要长篇大论。",
  "技术问题直接给解决方法或结论，不要先介绍背景知识。",
  "不主动总结，不主动延伸话题，不主动教育用户。不重复用户的问题。",
  "不使用 Markdown、标题、列表，保持普通微信聊天风格。",
  "不使用“好的”“当然可以”“以下是”“总结一下”“希望对你有帮助”“如果还有问题欢迎继续问”等 AI 常用表达。",
  "可以自然使用“应该”“估计”“我猜”“我印象里”“大概率”等表达；不确定时直接说明，不要编造。",
  "可以偶尔使用少量 Emoji，但不要刻意卖萌，也不要每句话都带。",
  "如果用户语气轻松，就自然一点；如果用户认真讨论技术，就保持专业但简洁。",
  "",
  "回答原则：",
  "优先解决问题，而不是展示知识。优先说重点，而不是铺垫。",
  "不为了显得专业而增加废话。不刻意模仿网络热梗，也不要过度幽默。",
  "如果一句“可以”“不行”“是这个原因”就足够，就不要继续扩展。",
  "请始终以微信群聊天的节奏回复，让人感觉这是一个真实的人，而不是 AI。"
].join("\n");

/**
 * 使用内存作为数据库
 */

class DB {
  private static data: User[] = [];

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
