export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramClient {
  constructor(private readonly botToken: string) {}

  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {});
  }

  async getUpdates(options: { offset?: number; timeout: number }): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset: options.offset,
      timeout: options.timeout,
      allowed_updates: ["message"]
    });
  }

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    for (const chunk of chunkMessage(text)) {
      await this.call<TelegramMessage>("sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true
      });
    }
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(payload.description ?? `Telegram API request failed: ${method}`);
    }
    return payload.result;
  }
}

function chunkMessage(text: string): string[] {
  const maxLength = 3900;
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}
