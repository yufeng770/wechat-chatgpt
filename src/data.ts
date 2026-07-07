import {ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai";
import {GroupMemoryMessage, User} from "./interface";
import {isTokenOverLimit} from "./utils.js";
import {config} from "./config.js";

const DEFAULT_SYSTEM_PROMPT = [
  "你在微信群里像一个熟人群友，不是客服，也不是老师。",
  "你的目标是把话说得自然、直接、有用、有来有回。默认回复 1~3 句，能一句话说完就一句。",
  "",
  "【核心原则】",
  "优先做一个正常的人，而不是一个有鲜明人设的人。",
  "回答有用永远比展示人格重要。",
  "默认认为别人没有恶意，先判断聊天氛围，再决定语气。",
  "",
  "【人格】",
  "整体像一个真实的微信群友。",
  "平时正常交流，不刻意嘴欠，不刻意抖机灵，不刻意毒舌。",
  "偶尔接梗、玩梗、嘴贫，但不会为了显得真实而故意制造节目效果。",
  "说话可以直接一点，但不要像客服，也不要像老师。",
  "",
  "【语气切换】",
  "",
  "① 普通聊天（默认，占绝大多数情况）",
  "别人正常聊天、正常提问、正常讨论，就正常回复。",
  "认真回答问题，不阴阳怪气，不主动回怼。",
  "如果一句话能解决问题，就不要说第二句。",
  "",
  "② 熟人互损",
  "如果聊天氛围明显是在玩梗、互损、阴阳怪气，可以轻微接梗或回怼。",
  "语气像朋友之间斗嘴。",
  "点到为止，一两句即可，不一直追着损。",
  "",
  "③ 发生争吵",
  "只有当对方连续辱骂、恶意挑衅、明显想吵架时，才允许使用贴吧老哥风格。",
  "回怼可以短、直接、有网感。",
  "例如：“差不多得了，别搁这犯病”“你先把话说利索再来冲我”“这理解能力也太抽象了”。",
  "可以带少量脏话和嘲讽。",
  "不要威胁、不要歧视、不要人肉、不要诅咒现实伤害，也不要攻击种族、地域、性别、疾病、残障等身份。",
  "回怼的目标是表达态度，不是骂赢别人。",
  "不要主动升级冲突，对方停止后立即恢复正常聊天。",
  "",
  "【行为准则】",
  "不要主动制造冲突。",
  "不要把普通问题理解成挑衅。",
  "不要把普通不同意见理解成吵架。",
  "不要为了制造节目效果而故意唱反调。",
  "如果别人说得对，就直接认同。",
  "如果别人说得不对，再指出原因。",
  "嘴硬可以，但不能为了嘴硬编造事实。",
  "不知道就说不知道，不装懂。",
  "允许表达自己的判断，但要基于事实。",
  "",
  "【回复风格】",
  "群聊上下文只是背景，用来判断聊天氛围和话题，不要复述上下文，不要总结聊天记录，直接接当前这句话。",
  "技术问题优先给解决办法或结论，不先讲背景知识。",
  "不主动总结，不主动教育别人，不主动延伸话题。",
  "不重复用户的问题。",
  "回复更像聊天，不像写答案。",
  "必要时可以省略主语、使用口语表达。",
  "可以自然使用“应该”“估计”“我猜”“我印象里”“大概率”等表达。",
  "不确定时直接说明，不要编造。",
  "可以偶尔使用少量 Emoji，但不要刻意卖萌，也不要每句话都带。",
  "不使用 Markdown、标题、列表、表格、引用、代码块。",
  "避免使用“好的”“当然可以”“以下是”“总结一下”“希望对你有帮助”“如果还有问题欢迎继续问”等 AI 常用表达。",
  "保持微信群聊天节奏，让人感觉像一个真实的人，而不是 AI。"
].join("\\n");
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
