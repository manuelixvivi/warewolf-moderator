// ============================================================
// ASPIRE: WEREWOLF — Authoritative WebSocket Client Adapter
// Phase 3: Canonical Client Transport Adapter
// "Optimistic interaction. Authoritative state."
// ============================================================

import {
  BaseCommand,
  CommandType,
  GameEvent,
  SanitizedPublicGameState,
  SanitizedPrivatePlayerState,
  ReconnectRequestPayload,
  ReconnectSyncResponse,
} from "@/contracts";
import { getNetworkConfig } from "./config";

export type PublicStateListener = (state: SanitizedPublicGameState) => void;
export type PrivateStateListener = (state: SanitizedPrivatePlayerState) => void;
export type EventListener = (event: GameEvent) => void;
export type ErrorListener = (error: { code?: string; message: string }) => void;
export type ConnectionListener = (connected: boolean) => void;

export interface OptimisticInteractionState {
  isPending: boolean;
  lastCommandType: CommandType | null;
  lastCommandId: string | null;
  submittedAt: number | null;
}

export class AuthoritativeWebSocketClient {
  private socket: WebSocket | null = null;
  private serverWsUrl: string = "";
  private sessionToken: string = "";
  private roomId: string = "";
  private playerId: string = "";
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: any = null;
  private isExplicitlyClosed: boolean = false;

  // Track latest sequence for catch-up reconnects
  private lastKnownSequence: number = 0;

  // Optimistic interaction state (purely for visual UI feedback)
  private optimisticState: OptimisticInteractionState = {
    isPending: false,
    lastCommandType: null,
    lastCommandId: null,
    submittedAt: null,
  };

  // Listeners
  private publicStateListeners = new Set<PublicStateListener>();
  private privateStateListeners = new Set<PrivateStateListener>();
  private eventListeners = new Set<EventListener>();
  private errorListeners = new Set<ErrorListener>();
  private connectionListeners = new Set<ConnectionListener>();

  constructor() {
    const config = getNetworkConfig();
    this.serverWsUrl = config.serverWsUrl;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getLastKnownSequence(): number {
    return this.lastKnownSequence;
  }

  public getOptimisticState(): Readonly<OptimisticInteractionState> {
    return this.optimisticState;
  }

  // ------------------------------------------------------------
  // Subscriptions
  // ------------------------------------------------------------
  public onPublicState(listener: PublicStateListener): () => void {
    this.publicStateListeners.add(listener);
    return () => this.publicStateListeners.delete(listener);
  }

  public onPrivateState(listener: PrivateStateListener): () => void {
    this.privateStateListeners.add(listener);
    return () => this.privateStateListeners.delete(listener);
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  // ------------------------------------------------------------
  // Connection Lifecycle
  // ------------------------------------------------------------
  public connect(sessionToken: string, roomId: string, playerId: string, customWsUrl?: string): void {
    this.sessionToken = sessionToken;
    this.roomId = roomId;
    this.playerId = playerId;
    this.isExplicitlyClosed = false;

    if (customWsUrl) {
      this.serverWsUrl = customWsUrl;
    }

    this.initiateSocket();
  }

  private initiateSocket(): void {
    if (typeof WebSocket === "undefined") {
      return; // Non-browser environment
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const wsUrl = `${this.serverWsUrl}?roomId=${encodeURIComponent(this.roomId)}&token=${encodeURIComponent(this.sessionToken)}`;
    
    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnection(true);

        // If reconnecting, send catch-up sync request
        if (this.lastKnownSequence > 0) {
          this.requestCatchUpSync();
        }
      };

      this.socket.onmessage = (event) => {
        this.handleIncomingMessage(event.data);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyConnection(false);

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        this.notifyError({ message: "WebSocket connection error occurred." });
      };
    } catch (err: any) {
      this.notifyError({ message: err.message || "Failed to initialize WebSocket connection." });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const config = getNetworkConfig();
    if (this.reconnectAttempts >= config.reconnectMaxAttempts || this.isExplicitlyClosed) {
      return;
    }

    const delay = Math.min(
      config.reconnectInitialDelayMs * Math.pow(1.5, this.reconnectAttempts),
      config.reconnectMaxDelayMs
    );

    this.reconnectAttempts += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.initiateSocket();
    }, delay);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.notifyConnection(false);
  }

  // ------------------------------------------------------------
  // Outgoing Commands (Strict BaseCommand Format)
  // ------------------------------------------------------------
  public async sendCommand<T = any>(
    type: CommandType,
    payload: T
  ): Promise<{ commandId: string }> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot send command: WebSocket is not connected to authoritative server.");
    }

    const commandId = "cmd-" + Math.random().toString(36).substring(2, 9);
    const clientTimestamp = Date.now();

    const command: BaseCommand<T> = {
      commandId,
      roomId: this.roomId,
      senderId: this.playerId,
      sessionToken: this.sessionToken,
      type,
      payload,
      clientTimestamp,
    };

    // Optimistic Interaction: Set pending visual flag (Does NOT alter game truth)
    this.optimisticState = {
      isPending: true,
      lastCommandType: type,
      lastCommandId: commandId,
      submittedAt: clientTimestamp,
    };

    this.socket.send(JSON.stringify(command));
    return { commandId };
  }

  // ------------------------------------------------------------
  // Incoming Message Ingestion
  // ------------------------------------------------------------
  private handleIncomingMessage(raw: string): void {
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      this.notifyError({ message: "Received unparseable message from server." });
      return;
    }

    if (!message || typeof message !== "object") return;

    // Reset optimistic pending state upon any server response
    this.optimisticState = {
      ...this.optimisticState,
      isPending: false,
    };

    switch (message.type) {
      case "PUBLIC_STATE_UPDATE": {
        const publicState = message.state as SanitizedPublicGameState;
        if (publicState.sequenceNumber >= this.lastKnownSequence) {
          this.lastKnownSequence = publicState.sequenceNumber;
        }
        this.notifyPublicState(publicState);
        break;
      }

      case "PRIVATE_STATE_UPDATE": {
        const privateState = message.state as SanitizedPrivatePlayerState;
        this.notifyPrivateState(privateState);
        break;
      }

      case "GAME_EVENT": {
        const event = message.event as GameEvent;
        if (event.sequence >= this.lastKnownSequence) {
          this.lastKnownSequence = event.sequence;
        }
        this.notifyEvent(event);
        break;
      }

      case "COMMAND_REJECTED": {
        this.notifyError({
          code: "COMMAND_REJECTED",
          message: message.error || "Command rejected by authoritative server.",
        });
        break;
      }

      case "ERROR": {
        this.notifyError({
          code: message.code || "SERVER_ERROR",
          message: message.message || "An error occurred on the authoritative server.",
        });
        break;
      }

      default:
        // Ignore unhandled frame types
        break;
    }
  }

  private requestCatchUpSync(): void {
    const catchUpPayload: ReconnectRequestPayload = {
      roomId: this.roomId,
      playerId: this.playerId,
      sessionToken: this.sessionToken,
      lastKnownSequence: this.lastKnownSequence,
    };

    this.sendCommand("RECONNECT", catchUpPayload).catch(() => {
      // Reconnect request will retry on next heartbeat
    });
  }

  // ------------------------------------------------------------
  // Notifiers
  // ------------------------------------------------------------
  private notifyPublicState(state: SanitizedPublicGameState): void {
    this.publicStateListeners.forEach((l) => {
      try {
        l(state);
      } catch (err) {
        console.error("Error in publicStateListener:", err);
      }
    });
  }

  private notifyPrivateState(state: SanitizedPrivatePlayerState): void {
    this.privateStateListeners.forEach((l) => {
      try {
        l(state);
      } catch (err) {
        console.error("Error in privateStateListener:", err);
      }
    });
  }

  private notifyEvent(event: GameEvent): void {
    this.eventListeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.error("Error in eventListener:", err);
      }
    });
  }

  private notifyError(error: { code?: string; message: string }): void {
    this.errorListeners.forEach((l) => {
      try {
        l(error);
      } catch (err) {
        console.error("Error in errorListener:", err);
      }
    });
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((l) => {
      try {
        l(connected);
      } catch (err) {
        console.error("Error in connectionListener:", err);
      }
    });
  }
}

export const authoritativeWsClient = new AuthoritativeWebSocketClient();
