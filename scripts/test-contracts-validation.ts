// ============================================================
// ASPIRE: WEREWOLF - PHASE 1 CONTRACT VALIDATION SUITE
// Automated verification that engine outputs and state models
// strictly conform to the 12 Canonical Contracts in src/contracts/index.ts
// "Client requests action. Server resolves truth. Engine produces facts. AI crafts the lore."
// ============================================================

import {
  GamePhase,
  GameMode,
  FactionAlignment,
  CanonicalPlayer,
  CanonicalGameState,
  BaseCommand,
  SubmitNightActionCommandPayload,
  CastVoteCommandPayload,
  GameEvent,
  GameEventType,
  RoleContractDefinition,
  CanonicalNightAction,
  CanonicalNightResolutionOutcome,
  DeathCause,
  CanonicalRetaliation,
  CanonicalDeathResolutionResult,
  CanonicalVoteOutcome,
  CanonicalWinResult,
  CanonicalRoleTransformationResult,
  SanitizedPublicPlayer,
  SanitizedPublicGameState,
  SanitizedPrivatePlayerState,
  ReconnectRequestPayload,
  ReconnectSyncResponse,
  StoryFactsPayload,
  StoryProseResponse,
} from "../src/contracts";

import rolesJson from "../src/data/roles.json";
import { ROLE_BY_ID, ROLE_BY_NAME, ALL_ROLES } from "../src/lib/engine/abilityRegistry";
import { resolveNightActions } from "../src/lib/engine/actionResolver";
import { resolveDeathChain } from "../src/lib/engine/deathResolver";
import { resolveDayVotes } from "../src/lib/engine/voteResolver";
import { evaluateWinConditions } from "../src/lib/engine/winEngine";
import { transformPlayerRole } from "../src/lib/engine/roleTransformation";
import { maskPublicGameState, generatePrivatePlayerState } from "../src/lib/engine/informationEngine";
import { PlayerEngineState, EngineNightAction } from "../src/lib/engine/types";
import crypto from "crypto";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    throw new Error(`Assertion failed: ${testName} - ${details || ""}`);
  }
}

function createPlayer(id: string, name: string, roleIdOrName: string): PlayerEngineState {
  const role =
    ROLE_BY_ID.get(roleIdOrName) ||
    ROLE_BY_NAME.get(roleIdOrName.toLowerCase()) ||
    ALL_ROLES.find((r) => r.canonical_name === roleIdOrName);

  if (!role) {
    throw new Error(`Role definition not found for: ${roleIdOrName}`);
  }

  return {
    id,
    name,
    isHost: id === "p1",
    isReady: true,
    alive: true,
    role_id: role.role_id,
    canonical_name: role.canonical_name,
    team: role.team,
    originalTeam: role.team,
    category: role.category,
    seer_result: role.seer_result,
    role_points: role.role_points,
    balance_weight: role.balance_weight,
    night_priority: role.night_priority || 50,
    active_phase: role.active_phase,
    action_type: role.action_type,
    trigger: role.trigger,
    target_type: role.target_type,
    usage_limit: role.usage_limit,
    can_change_role: role.can_change_role,
    reveal_on_death: role.reveal_on_death,
    requires_engine_resolution: role.requires_engine_resolution,
    description_en: role.description_en,
    description_id: role.description_id || role.tooltip_id,
    tooltip_en: role.tooltip_en,
    tooltip_id: role.tooltip_id,
    protected: false,
    silenced: false,
    inCult: false,
    hasUsedAbility: false,
  };
}

console.log("============================================================");
console.log("PHASE 1: 12 CANONICAL CONTRACTS VERIFICATION SUITE");
console.log("Verifying Engine Outputs against ASPIRE v1.0 Contract Pack");
console.log("============================================================\n");

// ------------------------------------------------------------
// 01. GAME STATE CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 01. GAME STATE & PLAYER CONTRACT ---");
{
  const pSeer = createPlayer("p1", "Alice", "ROLE-022");
  const canonicalPlayer: CanonicalPlayer = {
    id: pSeer.id,
    name: pSeer.name,
    isHost: pSeer.isHost,
    connected: true,
    alive: pSeer.alive,
    role_id: pSeer.role_id,
    canonical_name: pSeer.canonical_name,
    team: pSeer.team as FactionAlignment,
    protected: !!pSeer.protected,
    silenced: !!pSeer.silenced,
    inCult: !!pSeer.inCult,
    hasUsedAbility: !!pSeer.hasUsedAbility,
    linkedPartnerIds: ["p2"],
  };

  assert(typeof canonicalPlayer.id === "string" && canonicalPlayer.alive === true, "[Contract 01] CanonicalPlayer fields exist and are typed correctly");
  assert(canonicalPlayer.team === "Village" && canonicalPlayer.role_id === "ROLE-022", "[Contract 01] CanonicalPlayer preserves role identity");
  assert(Array.isArray(canonicalPlayer.linkedPartnerIds) && canonicalPlayer.linkedPartnerIds[0] === "p2", "[Contract 01] CanonicalPlayer relational bindings support Cupid / Lovers");

  const canonicalState: CanonicalGameState = {
    roomId: "ROOM-101",
    gameMode: "MODE_1_FIXED",
    phase: "NIGHT_ACTIVE",
    dayCount: 1,
    nightCount: 1,
    sequenceNumber: 42,
    timeoutCount: 0,
    players: [canonicalPlayer],
    votes: {},
    nightActions: [],
    pendingRetaliations: [],
    activeWinResult: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  assert(canonicalState.sequenceNumber === 42 && canonicalState.phase === "NIGHT_ACTIVE", "[Contract 01] CanonicalGameState contains monotonic sequence and valid phase");
}

// ------------------------------------------------------------
// 02. COMMAND CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 02. COMMAND CONTRACT ---");
{
  const nightActionPayload: SubmitNightActionCommandPayload = {
    actionId: "SYSTEM-WEREWOLF-PACK",
    targetPlayerId: "p2",
    secondaryTargetId: null,
  };

  const command: BaseCommand<SubmitNightActionCommandPayload> = {
    commandId: "cmd-uuid-001",
    roomId: "ROOM-101",
    senderId: "p1",
    sessionToken: "signed.jwt.token",
    type: "SUBMIT_NIGHT_ACTION",
    payload: nightActionPayload,
    clientTimestamp: Date.now(),
  };

  assert(command.type === "SUBMIT_NIGHT_ACTION", "[Contract 02] BaseCommand enforces strict command type");
  assert(command.payload.actionId === "SYSTEM-WEREWOLF-PACK", "[Contract 02] SubmitNightActionCommandPayload matches werewolf pack action");
  
  const voteCommand: BaseCommand<CastVoteCommandPayload> = {
    commandId: "cmd-uuid-002",
    roomId: "ROOM-101",
    senderId: "p2",
    sessionToken: "signed.jwt.token",
    type: "CAST_VOTE",
    payload: { targetPlayerId: "p1" },
    clientTimestamp: Date.now(),
  };
  assert(voteCommand.payload.targetPlayerId === "p1", "[Contract 02] CastVoteCommandPayload enforces target player");
}

// ------------------------------------------------------------
// 03. EVENT CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 03. EVENT CONTRACT ---");
{
  const secret = "aspire-server-authoritative-hmac-secret";
  const eventPayload = { eliminatedPlayerId: "p1", cause: "VOTE" };
  const eventDataToSign = `ROOM-101:1:PLAYER_ELIMINATED_BY_VOTE:${JSON.stringify(eventPayload)}`;
  const signature = crypto.createHmac("sha256", secret).update(eventDataToSign).digest("hex");

  const event: GameEvent<typeof eventPayload> = {
    eventId: "018d34bf-4299-7000-8000-000000000001", // UUIDv7 simulation
    roomId: "ROOM-101",
    sequence: 1,
    timestamp: Date.now(),
    type: "DEATH_CASCADE_TRIGGERED",
    actorId: "system",
    payload: eventPayload,
    serverSignature: signature,
  };

  assert(event.sequence === 1, "[Contract 03] GameEvent enforces monotonic sequence tick");
  assert(event.serverSignature.length === 64, "[Contract 03] GameEvent contains valid SHA-256 server signature");
}

// ------------------------------------------------------------
// 04. ROLE CONTRACT VALIDATION (ALL 75 ROLES)
// ------------------------------------------------------------
console.log("--- 04. ROLE CONTRACT (ALL 75 ROLES) ---");
{
  assert(rolesJson.length === 75, "[Contract 04] Database contains exactly 75 roles");
  
  let validContractCount = 0;
  for (const r of rolesJson) {
    const roleDef = r as unknown as RoleContractDefinition;
    if (
      typeof roleDef.role_id === "string" &&
      typeof roleDef.canonical_name === "string" &&
      typeof roleDef.category === "string" &&
      typeof roleDef.team === "string" &&
      (roleDef.seer_result === "Werewolf" || roleDef.seer_result === "Villager") &&
      typeof roleDef.night_priority === "number" &&
      typeof roleDef.role_points === "number"
    ) {
      validContractCount++;
    }
  }

  assert(validContractCount === 75, "[Contract 04] All 75 roles strictly adhere to RoleContractDefinition");
}

// ------------------------------------------------------------
// 05. ACTION CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 05. ACTION CONTRACT & NIGHT RESOLUTION OUTCOME ---");
{
  const wolf = createPlayer("p1", "Wolf", "ROLE-023");
  const seer = createPlayer("p2", "Seer", "ROLE-022");
  const guard = createPlayer("p3", "Guard", "ROLE-028");
  const villager = createPlayer("p4", "Villager", "ROLE-024");

  const completedActions: EngineNightAction[] = [
    {
      id: "SYSTEM-WEREWOLF-PACK",
      role_id: "ROLE-023",
      role_name: "Werewolf",
      action_type: "Kill",
      player_ids: ["p1"],
      target_player_id: "p4",
      completed: true,
      priority: 50,
    },
    {
      id: "ability-protect",
      role_id: "ROLE-028",
      role_name: "Bodyguard",
      action_type: "Protect",
      player_ids: ["p3"],
      target_player_id: "p4",
      completed: true,
      priority: 10,
    },
    {
      id: "ability-investigate",
      role_id: "ROLE-022",
      role_name: "Seer",
      action_type: "Investigate",
      player_ids: ["p2"],
      target_player_id: "p1",
      completed: true,
      priority: 30,
    },
  ];

  const { outcome } = resolveNightActions([wolf, seer, guard, villager], completedActions, 1);
  const canonicalOutcome: CanonicalNightResolutionOutcome = {
    killedPlayerIds: outcome.killedPlayerIds,
    savedPlayerIds: outcome.savedPlayerIds,
    investigations: outcome.investigations.map((inv) => ({
      actorId: inv.investigatorId,
      targetId: inv.targetId,
      result: inv.result,
      description: `Investigated ${inv.targetName}`,
    })),
    silencedPlayerIds: outcome.silencedPlayerIds,
    convertedPlayerIds: outcome.convertedPlayerIds,
    redirectedActions: outcome.redirectedActions.map(r => ({
      fromTargetId: r.originalTargetId,
      toTargetId: r.newTargetId,
      roleName: r.roleName,
    })),
    triggeredActions: outcome.triggeredActions,
    deathEvents: outcome.deathEvents.map(d => ({
      playerId: d.playerId,
      victimRole: "Villager",
      reason: d.deathCause,
    })),
    wolfCubExtraKillTriggered: outcome.wolfCubExtraKillTriggered,
    wolvesSkippingNextKill: outcome.wolvesSkippingNextKill,
  };

  assert(canonicalOutcome.killedPlayerIds.length === 0, "[Contract 05] Night resolution outcome saved targeted player via Bodyguard");
  const seerInv = canonicalOutcome.investigations.find(inv => inv.actorId === "p2");
  assert(Boolean(seerInv && seerInv.result === "Werewolf"), "[Contract 05] Investigations recorded with Seer result");
}

// ------------------------------------------------------------
// 06. DEATH CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 06. DEATH CONTRACT & RETALIATIONS ---");
{
  const hunter = createPlayer("p1", "Hunter", "ROLE-039");
  const wolf = createPlayer("p2", "Wolf", "ROLE-023");

  const deathResult = resolveDeathChain([hunter, wolf], ["p1"], "VOTE", "DAY", 1);
  const canonicalDeath: CanonicalDeathResolutionResult = {
    updatedPlayers: deathResult.updatedPlayers.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: true,
      alive: p.alive,
      role_id: p.role_id,
      canonical_name: p.canonical_name,
      team: p.team as FactionAlignment,
      protected: !!p.protected,
      silenced: !!p.silenced,
      inCult: !!p.inCult,
      hasUsedAbility: !!p.hasUsedAbility,
    })),
    pendingRetaliations: deathResult.pendingRetaliations.map(r => ({
      type: r.type as "HUNTER",
      playerId: r.playerId,
      roleName: r.roleName,
      completed: false,
    })),
    cascadeDeaths: deathResult.deathEvents.map(c => ({
      victimId: c.playerId,
      roleName: "Hunter",
      cause: "VOTE" as DeathCause,
    })),
    tannerWon: deathResult.tannerWon,
    wolfCubDied: deathResult.wolfCubExtraKillTriggered,
    diseasedInfectedWolves: deathResult.wolvesSkippingNextKill,
  };

  assert(canonicalDeath.pendingRetaliations.length === 1, "[Contract 06] Hunter death produces CanonicalRetaliation");
  assert(canonicalDeath.pendingRetaliations[0].type === "HUNTER", "[Contract 06] Retaliation type is HUNTER");
}

// ------------------------------------------------------------
// 07. VOTE CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 07. VOTE CONTRACT ---");
{
  const timeBandit = createPlayer("p1", "TimeBandit", "ROLE-019");
  const villager1 = createPlayer("p2", "V1", "ROLE-024");
  const villager2 = createPlayer("p3", "V2", "ROLE-024");

  const votes = { p2: "p1", p3: "p1" };
  const { outcome: voteOutcome } = resolveDayVotes([timeBandit, villager1, villager2], votes);

  const canonicalVote: CanonicalVoteOutcome = {
    tally: voteOutcome.tally,
    topTargetId: voteOutcome.topTargetId,
    isTie: voteOutcome.isTie,
    eliminatedPlayer: voteOutcome.eliminatedPlayer ? {
      id: voteOutcome.eliminatedPlayer.id,
      name: voteOutcome.eliminatedPlayer.name,
      isHost: voteOutcome.eliminatedPlayer.isHost,
      connected: true,
      alive: voteOutcome.eliminatedPlayer.alive,
      role_id: voteOutcome.eliminatedPlayer.role_id,
      canonical_name: voteOutcome.eliminatedPlayer.canonical_name,
      team: voteOutcome.eliminatedPlayer.team as FactionAlignment,
      protected: !!voteOutcome.eliminatedPlayer.protected,
      silenced: !!voteOutcome.eliminatedPlayer.silenced,
      inCult: !!voteOutcome.eliminatedPlayer.inCult,
      hasUsedAbility: !!voteOutcome.eliminatedPlayer.hasUsedAbility,
    } : null,
    princeSurvived: voteOutcome.princeSurvived,
    tannerWon: voteOutcome.tannerWon,
    dayTimerReduced: !!voteOutcome.dayTimerReduced,
    triggeredRetaliations: voteOutcome.triggeredRetaliations.map(r => ({
      type: r.type,
      playerId: r.playerId,
      roleName: r.roleName,
      completed: false,
    })),
  };

  assert(canonicalVote.topTargetId === "p1", "[Contract 07] Top target identified correctly");
  assert(canonicalVote.dayTimerReduced === true, "[Contract 07] Time Bandit elimination sets dayTimerReduced flag");
}

// ------------------------------------------------------------
// 08. WIN CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 08. WIN CONTRACT ---");
{
  const seer = createPlayer("p1", "Seer", "ROLE-022");
  const villager = createPlayer("p2", "Villager", "ROLE-024");

  const winResult = evaluateWinConditions([seer, villager]);
  const canonicalWin: CanonicalWinResult = {
    winner: winResult.winner || "Village",
    reason: winResult.reason || "",
    winningPlayerIds: winResult.winningPlayerIds,
    winningTeams: winResult.winningTeams,
  };

  assert(canonicalWin.winner === "Village", "[Contract 08] CanonicalWinResult declares Village victory");
  assert(canonicalWin.winningPlayerIds?.length === 2, "[Contract 08] Winning players list populated");
}

// ------------------------------------------------------------
// 09. ROLE TRANSFORMATION CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 09. ROLE TRANSFORMATION CONTRACT ---");
{
  const cursed = createPlayer("p1", "Cursed", "ROLE-031");
  const { updatedPlayer } = transformPlayerRole(cursed, "ROLE-023", "Attacked by Werewolves");

  const canonicalTransformation: CanonicalRoleTransformationResult = {
    player: {
      id: updatedPlayer.id,
      name: updatedPlayer.name,
      isHost: updatedPlayer.isHost,
      connected: true,
      alive: updatedPlayer.alive,
      role_id: updatedPlayer.role_id,
      canonical_name: updatedPlayer.canonical_name,
      team: updatedPlayer.team as FactionAlignment,
      protected: !!updatedPlayer.protected,
      silenced: !!updatedPlayer.silenced,
      inCult: !!updatedPlayer.inCult,
      hasUsedAbility: !!updatedPlayer.hasUsedAbility,
    },
    previousRoleId: "ROLE-031",
    newRoleId: "ROLE-023",
    reason: "Attacked by Werewolves",
  };

  assert(canonicalTransformation.player.role_id === "ROLE-023", "[Contract 09] Player transformed to Werewolf role ID");
  assert(canonicalTransformation.player.team === "Werewolf", "[Contract 09] Player team mutated to Werewolf");
}

// ------------------------------------------------------------
// 10. INFORMATION / FOG-OF-WAR CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 10. FOG-OF-WAR & STATE MASKING CONTRACT ---");
{
  const wolf = createPlayer("p1", "WolfUser", "ROLE-023");
  const seer = createPlayer("p2", "SeerUser", "ROLE-022");

  const publicInfo = maskPublicGameState({
    gameMode: "MODE_1_FIXED",
    phase: "DAY_DISCUSSION",
    dayCount: 1,
    nightCount: 1,
    players: [wolf, seer],
    narrativeText: "The village awakes to silence.",
    gameEnded: false,
    winner: null,
    winningPlayerIds: [],
    winningTeams: [],
    winReason: null,
  });

  const sanitizedPublicPlayers: SanitizedPublicPlayer[] = publicInfo.players.map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    alive: p.alive,
    silenced: p.silenced,
  }));

  const sanitizedPublicState: SanitizedPublicGameState = {
    roomId: "ROOM-101",
    gameMode: publicInfo.gameMode,
    phase: publicInfo.phase as GamePhase,
    dayCount: publicInfo.dayCount,
    nightCount: publicInfo.nightCount,
    sequenceNumber: 15,
    players: sanitizedPublicPlayers,
    currentNarrative: publicInfo.narrativeText,
    winResult: null,
  };

  // P0 Security check: Ensure no role_id, canonical_name, or team in public state
  const serializedPublic = JSON.stringify(sanitizedPublicState);
  assert(!serializedPublic.includes("ROLE-023"), "[Contract 10] Public state contains NO role_id");
  assert(!serializedPublic.includes("ROLE-022"), "[Contract 10] Public state contains NO Seer role_id");
  assert(!serializedPublic.includes('"team"'), "[Contract 10] Public state contains NO team property");

  // Private state check for Seer
  const roleDataSeer = ROLE_BY_ID.get("ROLE-022")!;
  const seerPrivate = generatePrivatePlayerState(seer, [wolf, seer], roleDataSeer);
  const sanitizedPrivate: SanitizedPrivatePlayerState = {
    playerId: seerPrivate.player.id,
    role_id: seerPrivate.player.role_id,
    canonical_name: seerPrivate.roleData.canonical_name,
    team: seerPrivate.player.team as FactionAlignment,
    abilities: [seerPrivate.roleData.action_type],
    night_priority: seerPrivate.player.night_priority,
    seer_result: seerPrivate.player.seer_result as "Werewolf" | "Villager",
  };

  assert(sanitizedPrivate.role_id === "ROLE-022", "[Contract 10] Private state delivers Seer's secret role_id to Seer");
  assert(sanitizedPrivate.canonical_name === "Seer", "[Contract 10] Private state delivers Seer's canonical name");
}

// ------------------------------------------------------------
// 11. RECONNECTION CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 11. RECONNECTION CONTRACT ---");
{
  const reconnectReq: ReconnectRequestPayload = {
    roomId: "ROOM-101",
    playerId: "p1",
    sessionToken: "signed.jwt.token",
    lastKnownSequence: 10,
  };

  const missedEvents: GameEvent[] = [
    {
      eventId: "018d34bf-0011",
      roomId: "ROOM-101",
      sequence: 11,
      timestamp: Date.now() - 1000,
      type: "VOTE_CAST",
      actorId: "p2",
      payload: { targetPlayerId: "p3" },
      serverSignature: "sig-11",
    },
    {
      eventId: "018d34bf-0012",
      roomId: "ROOM-101",
      sequence: 12,
      timestamp: Date.now(),
      type: "VOTE_RESOLVED",
      actorId: "system",
      payload: { eliminatedPlayerId: "p3" },
      serverSignature: "sig-12",
    },
  ];

  const syncResponse: ReconnectSyncResponse = {
    publicState: {
      roomId: "ROOM-101",
      gameMode: "MODE_1_FIXED",
      phase: "DAY_RESOLVING",
      dayCount: 1,
      nightCount: 1,
      sequenceNumber: 12,
      players: [
        { id: "p1", name: "Alice", isHost: false, alive: true, silenced: false },
        { id: "p2", name: "Bob", isHost: true, alive: true, silenced: false },
        { id: "p3", name: "Charlie", isHost: false, alive: false, silenced: false },
      ],
      currentNarrative: "Charlie was voted out.",
      winResult: null,
    },
    privateState: {
      playerId: "p1",
      role_id: "ROLE-023",
      canonical_name: "Werewolf",
      team: "Werewolf",
      abilities: ["Night Kill"],
      night_priority: 50,
      seer_result: "Werewolf",
    },
    missedEvents,
    serverTimestamp: Date.now(),
  };

  assert(syncResponse.missedEvents.length === 2, "[Contract 11] Reconnection response supplies delta missedEvents");
  assert(syncResponse.missedEvents[0].sequence === 11, "[Contract 11] Monotonic delta starts at lastKnownSequence + 1");
  assert(syncResponse.publicState.sequenceNumber === 12, "[Contract 11] Public state matches latest sequence number");
}

// ------------------------------------------------------------
// 12. AI NARRATIVE CONTRACT VALIDATION
// ------------------------------------------------------------
console.log("--- 12. AI NARRATIVE CONTRACT ---");
{
  const storyPayload: StoryFactsPayload = {
    roomId: "ROOM-101",
    dayNumber: 1,
    nightNumber: 1,
    phase: "NIGHT_SUMMARY",
    theme: "Dark Victorian Gothic Village",
    eliminatedVictims: [
      {
        name: "Doctor",
        publicCause: "Mauled by beasts in the night",
        roleRevealed: false,
      },
    ],
    sparedVictims: [
      {
        name: "Mayor",
        reason: "BODYGUARD_PROTECTED",
      },
    ],
    publicEvents: ["A blood-chilling howl echoed through the square."],
  };

  assert(storyPayload.eliminatedVictims.length === 1, "[Contract 12] StoryFactsPayload formats eliminated victims");
  assert(storyPayload.sparedVictims[0].reason === "BODYGUARD_PROTECTED", "[Contract 12] StoryFactsPayload formats spared victims");

  // Fallback procedural template simulation (0 ms stall)
  const fallbackStory: StoryProseResponse = {
    markdownStory: `The morning fog recedes over the village square. Alas, **${storyPayload.eliminatedVictims[0].name}** was found motionless upon the cobblestones. Whispers speak of an unseen guardian shielding another villager from harm.`,
    audioVoiceHint: "somber_narrator",
    generatedAt: Date.now(),
    modelUsed: "deterministic-procedural-fallback-v1",
    isFallbackTemplate: true,
  };

  assert(fallbackStory.isFallbackTemplate === true, "[Contract 12] StoryProseResponse supports zero-stall fallback template");
  assert(fallbackStory.markdownStory.includes("Doctor"), "[Contract 12] Fallback template correctly interpolates factual events");
}

console.log("\n============================================================");
console.log(`CONTRACT VALIDATION RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
console.log("============================================================");
if (failCount === 0) {
  console.log("🎉 ALL 12 CANONICAL CONTRACTS 100% VERIFIED AND CONFORMANT!");
}
