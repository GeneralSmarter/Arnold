import type { Tool } from "../tools/types.js";

export type ConnectorName = "gmail" | "web";

export interface ConnectorMetadata {
  name: ConnectorName;
  displayName: string;
  description: string;
  tools: string[];
}

export interface ConnectorAuthStatus {
  connector: ConnectorName;
  authenticated: boolean;
  details: string;
}

export interface Connector {
  metadata: ConnectorMetadata;
  tools: Tool[];
}
