export interface DiscordBotProfile {
  id: string;
  username: string;
  discriminator?: string;
  bot?: boolean;
}

interface DiscordApiError {
  message?: string;
  code?: number;
}

export async function getDiscordBotProfile(botToken: string): Promise<DiscordBotProfile> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      authorization: `Bot ${botToken}`
    }
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as DiscordApiError;
    throw new Error(error.message ?? `Discord token check failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as DiscordBotProfile;
}

export async function sendDiscordChannelMessage(
  botToken: string,
  channelId: string,
  content: string
): Promise<void> {
  for (const chunk of splitDiscordMessage(content)) {
    const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bot ${botToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: chunk,
        allowed_mentions: { parse: [] }
      })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as DiscordApiError;
      throw new Error(error.message ?? `Discord message failed with HTTP ${response.status}.`);
    }
  }
}

function splitDiscordMessage(content: string): string[] {
  const limit = 1900;
  if (content.length <= limit) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > limit) {
    const boundary = Math.max(remaining.lastIndexOf("\n", limit), remaining.lastIndexOf(" ", limit));
    const splitAt = boundary > 200 ? boundary : limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}
