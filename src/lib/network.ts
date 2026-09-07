// ============================================================
// ASPIRE: WEREWOLF - Realtime Multiplayer Network Engine
// Uses PeerJS (WebRTC) for multi-device internet connectivity
// + BroadcastChannel for same-device multi-tab testing
// ============================================================

import { NetworkMessage } from "@/types/game";

export type MessageHandler = (msg: NetworkMessage) => void;

class NetworkEngine {
  private peer: any = null;
  private connections: Map<string, any> = new Map();
  private hostConnection: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private isHost: boolean = false;
  private roomCode: string = "";
  private myPlayerId: string = "";

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
        console.error("Error in message handler:", err);
      }
    });
  }

  // ── Host initializes room ──────────────────────────────────
  public async initHost(roomCode: string, hostPlayerId: string): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerId = hostPlayerId;

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

    // 2. Setup PeerJS
    if (typeof window !== "undefined") {
      try {
        const { default: Peer } = await import("peerjs");
        const peerId = `aspire-host-${this.roomCode}`;

        this.peer = new Peer(peerId, {
          debug: 1,
        });

        this.peer.on("open", (id: string) => {
          console.log("Host PeerJS ready with ID:", id);
        });

        this.peer.on("connection", (conn: any) => {
          console.log("New player connected to host:", conn.peer);
          conn.on("open", () => {
            this.connections.set(conn.peer, conn);
          });

          conn.on("data", (data: any) => {
            if (data && typeof data === "object") {
              this.dispatchMessage(data as NetworkMessage);
            }
          });

          conn.on("close", () => {
            this.connections.delete(conn.peer);
          });

          conn.on("error", (err: any) => {
            console.warn("Peer connection error:", err);
            this.connections.delete(conn.peer);
          });
        });

        this.peer.on("error", (err: any) => {
          console.warn("Host Peer error (may fallback to local broadcast):", err);
        });
      } catch (err) {
        console.warn("Failed to load PeerJS for host, using BroadcastChannel only:", err);
      }
    }

    return this.roomCode;
  }

  // ── Client joins room ──────────────────────────────────────
  public async joinRoom(roomCode: string, playerId: string, playerName: string): Promise<boolean> {
    this.cleanup();
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerId = playerId;

    // 1. Setup local BroadcastChannel
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.broadcastChannel = new BroadcastChannel(`aspire_room_${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as NetworkMessage;
        if (msg && msg.senderId !== this.myPlayerId) {
          this.dispatchMessage(msg);
        }
      };

      // Announce join via BroadcastChannel
      this.broadcastChannel.postMessage({
        type: "JOIN_ROOM",
        senderId: this.myPlayerId,
        senderName: playerName,
        payload: { id: playerId, name: playerName },
      });
    }

    // 2. Setup PeerJS Client
    if (typeof window !== "undefined") {
      try {
        const { default: Peer } = await import("peerjs");
        const clientPeerId = `aspire-p-${playerId}-${Math.random().toString(36).substring(2, 6)}`;
        this.peer = new Peer(clientPeerId, { debug: 1 });

        this.peer.on("open", () => {
          const targetHostId = `aspire-host-${this.roomCode}`;
          const conn = this.peer.connect(targetHostId, { reliable: true });

          conn.on("open", () => {
            console.log("Connected to Host via WebRTC!");
            this.hostConnection = conn;

            // Send Join Message to Host
            conn.send({
              type: "JOIN_ROOM",
              senderId: this.myPlayerId,
              senderName: playerName,
              payload: { id: playerId, name: playerName },
            });
          });

          conn.on("data", (data: any) => {
            if (data && typeof data === "object") {
              this.dispatchMessage(data as NetworkMessage);
            }
          });

          conn.on("close", () => {
            console.warn("Connection to host closed");
            this.hostConnection = null;
          });

          conn.on("error", (err: any) => {
            console.warn("Host conn error:", err);
          });
        });

        this.peer.on("error", (err: any) => {
          console.warn("Client peer error:", err);
        });
      } catch (err) {
        console.warn("Failed to connect via WebRTC, relying on BroadcastChannel:", err);
      }
    }

    return true;
  }

  // ── Broadcast Message (Host to all clients) ────────────────
  public broadcast(msg: NetworkMessage) {
    // Send via WebRTC to all connected peers
    this.connections.forEach((conn) => {
      if (conn && conn.open) {
        try {
          conn.send(msg);
        } catch (e) {
          console.warn("Error sending to peer:", e);
        }
      }
    });

    // Send via local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (e) {
        console.warn("Error posting to broadcast channel:", e);
      }
    }
  }

  // ── Send to Host (Client to Host) ──────────────────────────
  public sendToHost(msg: NetworkMessage) {
    if (this.hostConnection && this.hostConnection.open) {
      try {
        this.hostConnection.send(msg);
      } catch (e) {
        console.warn("Error sending to host via PeerJS:", e);
      }
    }

    // Always mirror to BroadcastChannel as well
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (e) {
        console.warn("Error posting to broadcast channel:", e);
      }
    }
  }

  // ── Disconnect & Cleanup ───────────────────────────────────
  public cleanup() {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }

    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch {}
      this.hostConnection = null;
    }

    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.connections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.isHost = false;
    this.roomCode = "";
  }
}

export const network = new NetworkEngine();
