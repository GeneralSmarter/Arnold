import type { Provider, ProviderName } from "./types.js";
import { MockProvider } from "./mockProvider.js";
import { CodexCliProvider } from "./codexCliProvider.js";

export function createProvider(name: ProviderName): Provider {
  if (name === "mock") {
    return new MockProvider();
  }
  if (name === "codex-cli") {
    return new CodexCliProvider();
  }
  throw new Error(`Provider not found: ${name}`);
}
