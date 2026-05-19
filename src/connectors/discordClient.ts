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
