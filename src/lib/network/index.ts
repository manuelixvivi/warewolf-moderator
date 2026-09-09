// ============================================================
// ASPIRE: WEREWOLF — Network Layer Barrel Export
// Phase 3 & 4: Authoritative WebSocket (WSS) Client Adapter
// ============================================================

export {
  authoritativeWsClient,
  AuthoritativeWebSocketClient,
  type PublicStateListener,
  type PrivateStateListener,
  type EventListener,
  type ErrorListener,
  type ConnectionListener,
  type ChatMessageListener,
  type OptimisticInteractionState,
} from "./websocketClient";

export { getNetworkConfig, type NetworkConfig } from "./config";

