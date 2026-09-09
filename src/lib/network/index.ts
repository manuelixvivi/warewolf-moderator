// ============================================================
// ASPIRE: WEREWOLF — Network Layer Barrel Export
// Phase 3: Primary Authoritative WSS Adapter with Legacy MQTT Fallback
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

