// ============================================================
// ASPIRE: WEREWOLF — Client Network Configuration & Feature Flags
// Phase 3: Authoritative WebSocket Transport Adapter
// ============================================================

export interface NetworkConfig {
  useAuthoritativeWss: boolean;
  serverWsUrl: string;
  serverHttpUrl: string;
  reconnectMaxAttempts: number;
  reconnectInitialDelayMs: number;
  reconnectMaxDelayMs: number;
}

export function getNetworkConfig(): NetworkConfig {
  const isBrowser = typeof window !== "undefined";

  // Feature Flag: Authoritative WSS (default true, can be toggled via localStorage or env)
  let useAuthoritativeWss = true;
  if (isBrowser) {
    const override = localStorage.getItem("aspire_use_authoritative_wss");
    if (override !== null) {
      useAuthoritativeWss = override === "true";
    }
  }

  const serverWsUrl =
    (isBrowser && (window as any).__ASPIRE_WS_URL__) ||
    process.env.NEXT_PUBLIC_WS_URL ||
    "ws://localhost:4000/ws";

  const serverHttpUrl =
    (isBrowser && (window as any).__ASPIRE_HTTP_URL__) ||
    process.env.NEXT_PUBLIC_HTTP_URL ||
    "http://localhost:4000";

  return {
    useAuthoritativeWss,
    serverWsUrl,
    serverHttpUrl,
    reconnectMaxAttempts: 10,
    reconnectInitialDelayMs: 1000,
    reconnectMaxDelayMs: 10000,
  };
}
