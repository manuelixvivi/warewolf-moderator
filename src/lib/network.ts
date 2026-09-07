// ============================================================
// ASPIRE: WEREWOLF - High-Reliability Realtime Network Engine
// Uses Secure WebSocket MQTT (WSS) to guarantee cross-network
// connectivity across different Wi-Fi, mobile 4G/5G, and firewalls
// + BroadcastChannel for local instant multi-tab sync
// ============================================================

import { NetworkMessage } from "@/types/game";
import mqtt, { MqttClient } from "mqtt";

export type MessageHandler = (msg: NetworkMessage) => void;

// Public reliable WSS brokers (no auth required, port 443/8084/8884 open worldwide)
const BROKER_URLS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];

class NetworkEngine {
  private client: MqttClient | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private isHost: boolean = false;
  private roomCode: string = "";
  private myPlayerId: string = "";
  private topic: string = "";
  private isConnected: boolean = false;

  public onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  private dispatchMessage(msg: NetworkMessage) {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(msg);
      } catch (err) {
        console.error("Error in network message handler:", err);
      }
    });
  }

  // ── Host initializes room ──────────────────────────────────
  public async initHost(roomCode: string, hostPlayerId: string): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerId = hostPlayerId;
    this.topic = `aspire-werewolf/v1/${this.roomCode}`;

    // 1. Setup local BroadcastChannel for same-device multi-tab testing
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.broadcastChannel = new BroadcastChannel(`aspire_room_${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as NetworkMessage;
        if (msg && msg.senderId !== this.myPlayerId) {
          this.dispatchMessage(msg);
        }
      };
    }

    // 2. Connect to Cloud WSS Broker
    await this.connectMqtt(0);

    return this.roomCode;
  }

  // ── Client joins room ──────────────────────────────────────
  public async joinRoom(roomCode: string, playerId: string, playerName: string): Promise<boolean> {
    this.cleanup();
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerId = playerId;
    this.topic = `aspire-werewolf/v1/${this.roomCode}`;

    // 1. Setup local BroadcastChannel
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.broadcastChannel = new BroadcastChannel(`aspire_room_${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as NetworkMessage;
        if (msg && msg.senderId !== this.myPlayerId) {
          this.dispatchMessage(msg);
        }
      };
    }

    // 2. Connect to Cloud WSS Broker
    await this.connectMqtt(0);

    // 3. Send JOIN_ROOM message with periodic heartbeat until Host acknowledges
    const joinMsg: NetworkMessage = {
      type: "JOIN_ROOM",
      senderId: this.myPlayerId,
      senderName: playerName,
      payload: { id: playerId, name: playerName },
    };

    // Send immediately via local broadcast
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(joinMsg);
      } catch {}
    }

    // Publish to cloud WSS
    this.sendToHost(joinMsg);

    // Heartbeat: re-send join request 1s and 2s later to guarantee delivery over mobile networks
    setTimeout(() => this.sendToHost(joinMsg), 1000);
    setTimeout(() => this.sendToHost(joinMsg), 2500);

    return true;
  }

  // ── Connect to MQTT over WSS ───────────────────────────────
  private connectMqtt(brokerIndex: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve();
        return;
      }

      const brokerUrl = BROKER_URLS[brokerIndex % BROKER_URLS.length];
      const clientId = `aspire_${this.isHost ? "host" : "client"}_${this.myPlayerId}_${Math.random()
        .toString(36)
        .substring(2, 6)}`;

      try {
        this.client = mqtt.connect(brokerUrl, {
          clientId,
          clean: true,
          reconnectPeriod: 2000,
          connectTimeout: 7000,
          keepalive: 30,
        });

        this.client.on("connect", () => {
          this.isConnected = true;
          console.log(`Connected to WSS Broker [${brokerUrl}] for room: ${this.roomCode}`);

          if (this.topic && this.client) {
            this.client.subscribe(this.topic, { qos: 1 }, (err) => {
              if (err) console.warn("Subscribe error:", err);
              resolve();
            });
          } else {
            resolve();
          }
        });

        this.client.on("message", (recvTopic, payload) => {
          if (recvTopic === this.topic) {
            try {
              const msgStr = payload.toString();
              const msg = JSON.parse(msgStr) as NetworkMessage;
              if (msg && msg.senderId !== this.myPlayerId) {
                this.dispatchMessage(msg);
              }
            } catch (err) {
              console.warn("Failed to parse network message:", err);
            }
          }
        });

        this.client.on("error", (err) => {
          console.warn("WSS Broker error:", err);
          // Try next fallback broker if connection failed
          if (!this.isConnected && brokerIndex + 1 < BROKER_URLS.length) {
            try {
              this.client?.end(true);
            } catch {}
            this.connectMqtt(brokerIndex + 1).then(resolve);
          } else {
            resolve();
          }
        });

        this.client.on("close", () => {
          this.isConnected = false;
        });

        // Timeout fallback
        setTimeout(() => {
          resolve();
        }, 3000);
      } catch (err) {
        console.warn("MQTT connect exception:", err);
        resolve();
      }
    });
  }

  // ── Broadcast Message (Host to all players) ─────────────────
  public broadcast(msg: NetworkMessage) {
    const raw = JSON.stringify(msg);

    // 1. Send via Cloud WSS Broker
    if (this.client && this.client.connected && this.topic) {
      try {
        this.client.publish(this.topic, raw, { qos: 1 });
      } catch (err) {
        console.warn("Error publishing to MQTT:", err);
      }
    }

    // 2. Send via local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn("Error posting to broadcast channel:", err);
      }
    }
  }

  // ── Send to Host (Client to Host) ───────────────────────────
  public sendToHost(msg: NetworkMessage) {
    const raw = JSON.stringify(msg);

    // 1. Send via Cloud WSS Broker
    if (this.client && this.client.connected && this.topic) {
      try {
        this.client.publish(this.topic, raw, { qos: 1 });
      } catch (err) {
        console.warn("Error publishing to MQTT:", err);
      }
    }

    // 2. Mirror to BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn("Error posting to broadcast channel:", err);
      }
    }
  }

  // ── Status Check ───────────────────────────────────────────
  public isNetworkConnected(): boolean {
    return this.isConnected;
  }

  // ── Disconnect & Cleanup ───────────────────────────────────
  public cleanup() {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }

    if (this.client) {
      try {
        if (this.topic) {
          this.client.unsubscribe(this.topic);
        }
        this.client.end(true);
      } catch {}
      this.client = null;
    }

    this.isHost = false;
    this.roomCode = "";
    this.topic = "";
    this.isConnected = false;
  }
}

export const network = new NetworkEngine();
