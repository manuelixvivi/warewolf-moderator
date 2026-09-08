# ASPIRE: WEREWOLF — Architecture Specification v1.0
## Production-Grade Social Deduction Engine & Narrative Subsystem

> **System Axiom**: *"Client requests action. Server resolves truth. Engine produces facts. AI crafts the lore."*

---

## 1. Architectural Overview & System Topology

The transition of ASPIRE from a peer-to-peer prototype (SOURCE 6) to an enterprise-ready production platform requires decoupling client presentation from game state authority. The public MQTT broker is replaced by a **Dedicated Authoritative Game Server Cluster** maintaining single-source-of-truth state.

```mermaid
graph TD
    subgraph Clients ["Client Layer (Web / Mobile)"]
        P1["Player A (React / WSS)"]
        P2["Player B (React / WSS)"]
        P3["Player C (Host / Moderator)"]
    end

    subgraph Gateway ["Edge & Gateway Layer"]
        LB["Envoy / NGINX Load Balancer"]
        WSS["WebSocket Gateway (WSS)"]
    end

    subgraph GameCluster ["Authoritative Core (Node.js / Go)"]
        Auth["Session Authenticator (JWT)"]
        FSM["Finite State Machine (FSM)"]
        Engine["Deterministic Game Engine"]
        Contracts["75-Role Contract Matrix"]
        EventBus["Internal Event Sourcing Bus"]
        Sanitizer["Fog-of-War State Masker"]
    end

    subgraph DataStore ["Persistence & Cache Hierarchy"]
        PG[("PostgreSQL: Source of Truth (Append-Only Event Store)")]
        Redis[("Redis: Ephemeral State, Sessions & PubSub")]
    end

    subgraph AIWorker ["AI Lore Layer (Asynchronous Non-Blocking)"]
        Queue["BullMQ Job Queue"]
        LLM["Gemini / Groq LLM Worker"]
        Fallback["Deterministic Template Engine"]
    end

    P1 & P2 & P3 <-->|WSS Encrypted Frames| LB
    LB <--> WSS
    WSS <--> Auth
    Auth --> FSM
    FSM --> Engine
    Engine --> Contracts
    Engine --> EventBus
    EventBus --> PG
    EventBus --> Redis
    Redis -.->|Rehydrate on Crash| PG
    EventBus --> Sanitizer
    Sanitizer -->|Tailored Private/Public State| WSS
    EventBus -.->|Async Non-Blocking Narrative Job| Queue
    Queue --> LLM
    LLM -.->|Markdown Lore Chunk| EventBus
    Queue -.->|On Timeout 3s| Fallback
    Fallback -.->|Instant Fallback Lore| EventBus
```

---

## 2. Authoritative Finite State Machine (FSM) & Lifecycle

The game lifecycle is strictly linear and authoritative. All transitions occur on the server upon event triggers or timer expirations.

```mermaid
stateDiagram-v2
    [*] --> LOBBY : Room Created

    state LOBBY {
        WAITING_PLAYERS --> VALIDATING_POOL : Host clicks START
        VALIDATING_POOL --> WAITING_PLAYERS : Validation Failed (Error Frame)
        VALIDATING_POOL --> ASSIGNING_ROLES : Validation Succeeded
    }

    ASSIGNING_ROLES --> NIGHT_PHASE : Deliver Secret Cards

    state NIGHT_PHASE {
        NIGHT_ACTIVE --> NIGHT_RESOLVING : Timer expires / All actions submitted
        NIGHT_RESOLVING --> NIGHT_CASCADE : Execute Attacks, Defenses, Copies
        NIGHT_CASCADE --> CHECK_WIN_NIGHT : Evaluate Death Cascades
    }

    CHECK_WIN_NIGHT --> GAME_OVER : Win Condition Satisfied
    CHECK_WIN_NIGHT --> DAY_NARRATIVE : Game Continues

    state DAY_PHASE {
        DAY_NARRATIVE --> DAY_DISCUSSION : Lore Delivered
        DAY_DISCUSSION --> DAY_VOTING : Discussion Timer Expired
        DAY_VOTING --> DAY_RESOLVING : Voting Timer Expired / Majority Reached
        DAY_RESOLVING --> DAY_CASCADE : Execute Lynch & Retaliations
        DAY_CASCADE --> CHECK_WIN_DAY : Evaluate Win Conditions
    }

    CHECK_WIN_DAY --> GAME_OVER : Win Condition Satisfied
    CHECK_WIN_DAY --> NIGHT_PHASE : Next Cycle Begins

    GAME_OVER --> [*] : Persist Replay & Archive
```

---

## 3. Append-Only Event Sourcing Model

Every mutation within the engine is represented by an immutable, cryptographically signed `GameEvent`. State is derived deterministically from the history of events.

### 3.1 Event Schema Definition
```typescript
export type GameEventType =
  | "ROOM_CREATED"
  | "PLAYER_CONNECTED"
  | "PLAYER_DISCONNECTED"
  | "PLAYER_RECONNECTED"
  | "CONFIG_UPDATED"
  | "GAME_STARTED"
  | "ROLES_ASSIGNED"
  | "PHASE_TRANSITIONED"
  | "ACTION_SUBMITTED"
  | "ACTION_RESOLVED"
  | "DEATH_CASCADE_TRIGGERED"
  | "ROLE_TRANSFORMED"
  | "VOTE_CAST"
  | "VOTE_RESOLVED"
  | "TIMEOUT_TRIGGERED"
  | "WIN_CONDITION_MET"
  | "NARRATIVE_PUBLISHED";

export interface GameEvent<T = any> {
  eventId: string;           // UUIDv7 (Monotonically increasing time-order)
  roomId: string;            // Alphanumeric Room Code
  sequence: number;          // Global sequential tick counter (0, 1, 2, ...)
  timestamp: number;         // Unix epoch in milliseconds
  type: GameEventType;
  actorId?: string;          // Player ID executing action (if applicable)
  payload: T;                // Event-specific factual data
  serverSignature: string;   // HMAC-SHA256(eventId + sequence + payload, SECRET)
}
```

### 3.2 Canonical Game Reducer Pattern
```typescript
export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "ROLES_ASSIGNED":
      return applyRoleAssignments(state, event.payload);
    case "ACTION_RESOLVED":
      return applyNightResolutions(state, event.payload);
    case "DEATH_CASCADE_TRIGGERED":
      return applyDeathCascade(state, event.payload);
    case "ROLE_TRANSFORMED":
      return applyRoleTransformation(state, event.payload);
    case "VOTE_RESOLVED":
      return applyVoteResults(state, event.payload);
    case "TIMEOUT_TRIGGERED":
      return { ...state, timeoutCount: state.timeoutCount + 1 };
    default:
      return state;
  }
}
```

### 3.3 Persistence Source of Truth Hierarchy
- **PostgreSQL (Historical Source of Truth)**: Persists the immutable, append-only log of all `GameEvent` records and historical match transcripts. In the event of an engine failure, cache eviction, or server migration, the entire match history and canonical state can be reconstructed deterministically by replaying events from PostgreSQL.
- **Redis (Ephemeral State, Fast Cache & Pub/Sub)**: Maintains active room sessions, socket presence, heartbeat TTLs, and distributed lock coordination. Redis is strictly an ephemeral operational layer—never an irreplaceable historical data repository.

---

## 4. Multiplayer Security, Session Auth & Reconnection Protocol

> [!CAUTION]
> **Secrets Isolation Invariant (Zero Client Exposure)**:
> `serverSignature` HMAC-SHA256 secrets, JWT signing private keys, and AI provider API keys MUST reside exclusively in server-side environment variables (`.env`, secret manager). They must NEVER be prefixed with `NEXT_PUBLIC_*`, bundled into frontend client code, exposed to WebSocket frames, or stored in client `localStorage`.

### 4.1 Threat Model & Countermeasures

| Vulnerability | Attack Vector | Authoritative Countermeasure |
| :--- | :--- | :--- |
| **Impersonation** | Spoofing `senderId` in vote or night action | Server assigns secure cryptographically signed `sessionToken` upon join; rejects any frame where `socket.sessionToken.playerId !== payload.actorId`. |
| **Information Leakage** | Sniffing WebSocket packets for secret roles | **Strict Fog-of-War Masking**: Secret roles and wolf chats are partitioned at the server layer. Unprivileged clients receive zero role fields for other players. |
| **Action Exploitation** | Dead players voting or acting out-of-phase | **Server-Side Liveness & Phase Check**: Engine rejects actions from dead, silenced, or non-priority actors. |
| **Replay Attacks** | Resubmitting previously valid packets | Monotonic sequence counters on frames; server discards stale sequence numbers. |

### 4.2 Two-Way Handshake & Reconnection Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Client as Player Client
    participant GW as WSS Gateway
    participant Server as Game Server (Authoritative)
    participant Redis as Redis Cache

    Note over Client, Server: 1. Authentication & Join
    Client->>GW: WSS Connect { roomId, playerName, clientVersion }
    GW->>Server: Handshake Request
    Server->>Server: Generate playerId & sessionToken (JWT)
    Server-->>Client: CONNECT_ACK { playerId, sessionToken, serverSequence: 0 }

    Note over Client, Server: 2. Mid-Game Disconnection & Recovery
    Client--xGW: Connection Drop (Mobile network blip)
    Server->>Server: Mark player.connected = false (Grace period 60s)
    Server->>Redis: Set Heartbeat Timeout

    Note over Client, Server: 3. Seamless Reconnect & Resynchronization
    Client->>GW: WSS Reconnect { roomId, playerId, sessionToken, lastKnownSequence: 42 }
    GW->>Server: Validate Session Token
    Server->>Redis: Fetch Events from sequence 43 to current
    Server-->>Client: RECONNECT_SYNC { publicState, privateState, missedEvents: [43..48] }
    Note over Client: Client updates UI instantaneously with zero desync!
```

---

## 5. 75-Role Contract Ruleset Specification

Rather than fragmented code blocks, all 75 roles operate under an explicit declarative contract.

```typescript
export interface RoleContract {
  role_id: string;
  canonical_name: string;
  team: "Village" | "Werewolf" | "Neutral" | "Vampire" | "Dynamic";
  category: "Village" | "Werewolf" | "Neutral" | "Special" | "Timer" | "Independent";
  seer_result: "Werewolf" | "Villager";
  night_priority: number;
  active_phase: "Night" | "Day" | "Triggered" | "Passive";
  usage_limit: "Nightly" | "Once" | "Passive" | "First Night" | "Varies";
  
  // Execution contracts
  nightActionResolver?: (ctx: ActionContext) => ActionResult;
  voteWeightResolver?: (player: Player) => number;
  deathCascadeTrigger?: (ctx: DeathContext) => CascadeEvent[];
  winConditionEvaluator?: (ctx: WinContext) => WinResult | null;
  transformationTrigger?: (ctx: TriggerContext) => RoleTransformResult | null;
}
```

### 5.1 Authoritative Execution Matrix (Sample Core Archetypes)

```mermaid
classDiagram
    class RoleContract {
        +string role_id
        +string canonical_name
        +string team
        +int night_priority
        +string seer_result
        +resolveNightAction()
        +evaluateWin()
    }

    class WerewolfPack {
        +night_priority = 50
        +action = "Eliminate Victim"
        +team = "Werewolf"
    }
    class Bodyguard {
        +night_priority = 30
        +action = "Protect Player"
        +constraint = "Cannot target self"
    }
    class Hunter {
        +active_phase = "Triggered"
        +trigger = "On Vote Elimination"
        +action = "Retaliation Kill"
    }
    class Hoodlum {
        +team = "Solo"
        +target_count = 2
        +win_condition = "Both targets dead, Hoodlum alive"
    }
    class FatherTime {
        +team = "Neutral"
        +trigger = "3 Timeouts"
        +win_condition = "Instant Victory on 3rd timeout"
    }

    RoleContract <|-- WerewolfPack
    RoleContract <|-- Bodyguard
    RoleContract <|-- Hunter
    RoleContract <|-- Hoodlum
    RoleContract <|-- FatherTime
```

---

## 6. Decoupled AI Storyteller Architecture & Deterministic Fallback

The fundamental boundary is maintained: **Engine computes facts, LLM narrates prose**.

```mermaid
sequenceDiagram
    autonumber
    participant Engine as Authoritative Game Engine
    participant Queue as Narrative Job Queue
    participant LLM as AI Lore Service (Gemini / Groq)
    participant Fallback as Procedural Template Generator
    participant Client as Public Chat Broadcast

    Engine->>Queue: Enqueue Event Batch { phase: "NIGHT", killed: ["Edward"], saved: [], theme: "Gothic" }
    
    par Async AI Generation
        Queue->>LLM: Request Prose (Timeout: 3000ms)
        alt LLM Responds within 3000ms
            LLM-->>Queue: Return Generated Markdown Story
            Queue->>Client: Broadcast AI Lore Narrative
        else LLM Times Out or Fails
            Queue->>Fallback: Trigger Procedural Template
            Fallback-->>Queue: Return Deterministic Narrative
            Queue->>Client: Broadcast Fallback Narrative
        end
    end
```

### 6.1 Asynchronous Non-Blocking Narrative Invariant
The game engine resolves state and produces factual game events synchronously, returning the updated state immediately:
```typescript
const updatedState = resolveNightPhase(currentState, completedActions);

// Non-blocking fire-and-forget job dispatch to BullMQ worker
narrativeQueue.add("GENERATE_LORE", {
  roomId: currentState.roomId,
  factualBatch: extractSanitizedFacts(updatedState),
});

return updatedState; // Match loop proceeds with zero latency!
```
The game engine **NEVER** `await`s the LLM. If the AI worker times out (3000ms threshold) or fails, the deterministic procedural template generator delivers the lore chunk instantly with zero stall to the match lifecycle.

---

## 7. Canonical 8-Phase Production Migration Roadmap

To prevent breaking the mature, verified Golden Engine baseline, migration strictly proceeds through 8 sequential phases:

```mermaid
gantt
    title ASPIRE Production Migration Roadmap (Phase 0 to Phase 8)
    dateFormat  YYYY-MM-DD
    section Phase 0: Baseline Freeze
    Lock Golden Engine Baseline & 75 Roles        :done, 2026-09-08, 1d
    section Phase 1: Contract Lock
    Formalize 12 Canonical Contracts              :done, 2026-09-08, 1d
    section Phase 2: Authoritative Gateway
    Fastify WSS Gateway, Auth & Pipeline          :done, 2026-09-08, 1d
    section Phase 3: Client WSS Adapter
    Client WebSocket Adapter & Optimistic UI      :done, 2026-09-08, 1d
    section Phase 4: PostgreSQL Event Store
    Append-Only Event Store & Crash Replay        :active, 2026-09-08, 1d
    section Phase 5: Redis Cache & Locks
    Redis Ephemeral Presence & Distributed Locks  :2026-09-09, 1d
    section Phase 6: Session Reconnection
    Monotonic Sequence Catchup & Grace Window     :2026-09-10, 1d
    section Phase 7: Decoupled AI Narrative
    BullMQ Async Lore Worker & Instant Fallback   :2026-09-11, 1d
    section Phase 8: Production Hardening
    Docker, 100-Room Load Testing & CI/CD         :2026-09-12, 1d
```

### Canonical Phase Breakdown:
1. **Phase 0 — Baseline Freeze (Golden Reference)**: 🟢 **DONE**
   - 75 roles, 79 abilities, Mode 2 sampling without replacement (`balanceEngine.ts`), cascading death chains, and Father Time timeout pipeline frozen. Zero engine rewrites.
2. **Phase 1 — Canonical Contract Lock**: 🟢 **DONE**
   - Formalized 12 Canonical Contracts (`src/contracts/index.ts`) defining GameState, Commands, Events, Roles, Actions, Death, Vote, Win, Transformation, Fog-of-War, Reconnect, and Narrative. Automated verification via `scripts/test-contracts-validation.ts`.
3. **Phase 2 — Authoritative Server Gateway**: 🟢 **DONE**
   - Standalone Fastify + WebSocket (WSS) gateway with HS256 JWT session issuance, multi-tier command pipeline (Schema -> JWT Auth -> Sender/Room Authorization -> Phase Invariant -> Engine delegation), and Fog-of-War partitioned dispatch.
4. **Phase 3 — Client WebSocket Adapter**: 🟢 **DONE**
   - Client transport adapter enforcing *"optimistic interaction, authoritative state"*, auto-reconnect backoff, and monotonic sequence tracking. Legacy prototype marked `@deprecated` behind feature flag `useAuthoritativeWss: true`.
5. **Phase 4 — PostgreSQL Event Store & Deterministic Replay**: 🟢 **DONE & HARDENED**
   - Append-only `game_events` table with unique `(room_id, sequence)` constraint, deterministic `gameReducer` replay, idempotency deduplication, cryptographic HMAC-SHA256 tamper verification, and total server memory crash recovery.
6. **Phase 5 — Redis Ephemeral Cache & Distributed Locks**: ⚪ **NEXT**
   - Ephemeral session/room cache, socket heartbeat presence, and atomic distributed mutex lock (`lock:room:<roomId>`) to eliminate concurrency race conditions during simultaneous action submissions.
7. **Phase 6 — Mid-Game Session Reconnection & Socket Recovery**: ⚪
   - Monotonic sequence catchup (`missedEvents: [lastSeq+1 .. currentSeq]`) within the 60s disconnection grace period for zero desynchronization.
8. **Phase 7 — Decoupled AI Lore Engine & Procedural Fallback**: ⚪
   - Asynchronous narrative generation via BullMQ worker with 3-second SLA timeout and deterministic procedural template fallback.
9. **Phase 8 — Production Hardening & Enterprise Scale Verification**: ⚪
   - Docker containerization, 100 concurrent rooms load testing, CI/CD pipeline, and deployment guide.

---

## 8. v1.0 Definition of Done (DoD) Checklist

- [x] **Phase 0 — 75 Roles Schema & Registry**: Complete database with 79 abilities, balance engine, and frozen baseline.
- [x] **Phase 1 — Canonical Contract Lock**: 12 formal contracts formalized in `src/contracts/index.ts` with 100% test coverage.
- [x] **Phase 2 — Authoritative Server Gateway**: Fastify HTTP/WSS gateway with JWT session authentication and Fog-of-War state isolation.
- [x] **Phase 3 — Client WebSocket Adapter**: Full client transport adapter enforcing optimistic interaction with authoritative server state.
- [x] **Phase 4 — PostgreSQL Event Store & Replay**: Append-only event store, deterministic replay engine, idempotency deduplication, HMAC tamper detection, and verified total crash recovery.
- [ ] **Phase 5 — Redis Ephemeral Cache & Distributed Locks**: Ephemeral presence TTL, active sockets, and atomic room mutex locking.
- [ ] **Phase 6 — Stateful Reconnection**: Delta event resync and seamless reconnect protocol for dropped connections.
- [ ] **Phase 7 — Decoupled AI Lore Queue**: Background narrative worker with 3-second SLA timeout and procedural fallback templates.
- [ ] **Phase 8 — Full Production Hardening**: Dockerized multi-service stack, load-tested at 100 concurrent rooms with zero state corruption.

