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
  type OptimisticInteractionState,
} from "./websocketClient";

export { getNetworkConfig, type NetworkConfig } from "./config";

/**
 * @deprecated Legacy prototype network broker (MQTT / PeerJS / BroadcastChannel).
 * Scheduled for decommissioning after Phase 8 load & hardening tests.
 * Use `authoritativeWsClient` for all authoritative match lifecycle actions.
 */
export { network as legacyNetwork } from "../network";
