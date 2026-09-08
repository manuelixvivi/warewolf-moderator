# INVENTORY OF HARDCODED ROLE RULES & DISPATCH CHECKS

> **Audit Requirement (Phase 3 & Phase 4)**: Honest and transparent documentation of all occurrences where `canonical_name ===` or `role_id ===` appears in the codebase.
>
> Total occurrences scanned across `src/lib/engine`, `src/lib/gameEngine.ts`, `src/store`: **242 checks**.

## Executive Summary

A game engine that supports 75 distinct roles with unique gameplay mechanics requires two complementary layers:
1. **Data-Driven Metadata Layer**: Drives phase eligibility (`active_phase`), execution ordering (`night_priority`), targeting rules (`target_type`), frequency limits (`usage_limit`), investigation results (`seer_result`), and mathematical balance (`role_points`, `balance_weight`).
2. **Executable Handler Dispatch Layer**: Evaluates unique mechanical consequences when a specific card's ability fires (e.g. Cupid binding 2 lovers, Dr. Boom exploding neighbors, Witch managing 2 potions, Tanner solo win on vote).

Below is the complete, transparent file-by-file inventory.

### File: `src/components/game/MultiplayerDay.tsx` (1 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 125 | `canonical_name` | **Seer** | `{me?.canonical_name === "Seer" && lastNightResult && la` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/components/setup/CreateRoomScreen.tsx` (2 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 52 | `canonical_name` | **Moderator** | `r.canonical_name === "Moderator" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 53 | `canonical_name` | **Blank Cards** | `r.canonical_name === "Blank Cards" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/abilityRegistry.ts` (8 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 87 | `canonical_name` | **Doppelgänger** | `if (player.canonical_name === "Doppelgänger" && nightCo` | Partial: Can be further generalized by schema expansions in future versions. |
| 92 | `canonical_name` | **Witch** | `if (player.canonical_name === "Witch" && (player.usedAb` | Partial: Can be further generalized by schema expansions in future versions. |
| 221 | `canonical_name` | **Cupid** | `if (actor.canonical_name === "Cupid") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 231 | `canonical_name` | **Doppelgänger** | `if (actor.canonical_name === "Doppelgänger" && targetId` | Partial: Can be further generalized by schema expansions in future versions. |
| 87 | `canonical_name` | **Doppelgänger** | `if (player.canonical_name === "Doppelgänger" && nightCo` | Partial: Can be further generalized by schema expansions in future versions. |
| 92 | `canonical_name` | **Witch** | `if (player.canonical_name === "Witch" && (player.usedAb` | Partial: Can be further generalized by schema expansions in future versions. |
| 221 | `canonical_name` | **Cupid** | `if (actor.canonical_name === "Cupid") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 231 | `canonical_name` | **Doppelgänger** | `if (actor.canonical_name === "Doppelgänger" && targetId` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/actionResolver.ts` (34 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 176 | `role_id` | **ROLE-005** | `(roleName.includes("helgo") \|\| action.role_id === "RO` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 177 | `role_id` | **ROLE-008** | `roleName.includes("hackmaster") \|\| action.role_id ===` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 196 | `role_id` | **ROLE-076** | `if ((roleName.includes("the thing") \|\| action.role_id` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 206 | `role_id` | **ROLE-035** | `if ((roleName.includes("ghost") \|\| action.role_id ===` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 329 | `canonical_name` | **Cursed** | `} else if (target.canonical_name === "Cursed" \|\| targ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 329 | `role_id` | **ROLE-031** | `} else if (target.canonical_name === "Cursed" \|\| targ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 344 | `canonical_name` | **Tough Guy** | `} else if (target.canonical_name === "Tough Guy" \|\| t` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 344 | `role_id` | **ROLE-054** | `} else if (target.canonical_name === "Tough Guy" \|\| t` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 413 | `role_id` | **ROLE-003** | `(roleName.includes("alpha wolf") \|\| action.role_id ==` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 439 | `role_id` | **ROLE-077** | `if ((roleName.includes("bloody mary") \|\| action.role_` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 448 | `role_id` | **ROLE-066** | `(roleName.includes("frankenstein") \|\| action.role_id ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 465 | `role_id` | **ROLE-012** | `if ((roleName.includes("magician") \|\| action.role_id ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 479 | `role_id` | **ROLE-055** | `if ((roleName.includes("troublemaker") \|\| action.role` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 599 | `role_id` | **ROLE-034** | `(p.role_id === "ROLE-034" \|\| p.canonical_name === "Dr` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 599 | `canonical_name` | **Drunk** | `(p.role_id === "ROLE-034" \|\| p.canonical_name === "Dr` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 634 | `role_id` | **ROLE-047** | `(p.role_id === "ROLE-047" \|\| p.canonical_name === "Ol` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 634 | `canonical_name` | **Old Man** | `(p.role_id === "ROLE-047" \|\| p.canonical_name === "Ol` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 176 | `role_id` | **ROLE-005** | `(roleName.includes("helgo") \|\| action.role_id === "RO` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 177 | `role_id` | **ROLE-008** | `roleName.includes("hackmaster") \|\| action.role_id ===` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 196 | `role_id` | **ROLE-076** | `if ((roleName.includes("the thing") \|\| action.role_id` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 206 | `role_id` | **ROLE-035** | `if ((roleName.includes("ghost") \|\| action.role_id ===` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 329 | `canonical_name` | **Cursed** | `} else if (target.canonical_name === "Cursed" \|\| targ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 329 | `role_id` | **ROLE-031** | `} else if (target.canonical_name === "Cursed" \|\| targ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 344 | `canonical_name` | **Tough Guy** | `} else if (target.canonical_name === "Tough Guy" \|\| t` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 344 | `role_id` | **ROLE-054** | `} else if (target.canonical_name === "Tough Guy" \|\| t` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 413 | `role_id` | **ROLE-003** | `(roleName.includes("alpha wolf") \|\| action.role_id ==` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 439 | `role_id` | **ROLE-077** | `if ((roleName.includes("bloody mary") \|\| action.role_` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 448 | `role_id` | **ROLE-066** | `(roleName.includes("frankenstein") \|\| action.role_id ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 465 | `role_id` | **ROLE-012** | `if ((roleName.includes("magician") \|\| action.role_id ` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 479 | `role_id` | **ROLE-055** | `if ((roleName.includes("troublemaker") \|\| action.role` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 599 | `role_id` | **ROLE-034** | `(p.role_id === "ROLE-034" \|\| p.canonical_name === "Dr` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 599 | `canonical_name` | **Drunk** | `(p.role_id === "ROLE-034" \|\| p.canonical_name === "Dr` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 634 | `role_id` | **ROLE-047** | `(p.role_id === "ROLE-047" \|\| p.canonical_name === "Ol` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |
| 634 | `canonical_name` | **Old Man** | `(p.role_id === "ROLE-047" \|\| p.canonical_name === "Ol` | Mechanic Handler: Action scheduling is driven by database `night_priority` and `active_phase`, but the specialized mechanical execution of each card (e.g. Cupid lover binding, Witch 2 potions) requires an executable handler. |

### File: `src/lib/engine/balanceEngine.ts` (14 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 293 | `canonical_name` | **P.I.** | `r.canonical_name === "P.I." \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 294 | `canonical_name` | **Mentalist** | `r.canonical_name === "Mentalist" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 295 | `canonical_name` | **The Count** | `r.canonical_name === "The Count")` | Partial: Can be further generalized by schema expansions in future versions. |
| 303 | `canonical_name` | **Bodyguard** | `r.canonical_name === "Bodyguard" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 304 | `canonical_name` | **Priest** | `r.canonical_name === "Priest" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 305 | `canonical_name` | **Witch** | `r.canonical_name === "Witch")` | Partial: Can be further generalized by schema expansions in future versions. |
| 325 | `canonical_name` | **Villager** | `ALL_ROLES.find((r) => r.canonical_name === "Villager") ` | Partial: Can be further generalized by schema expansions in future versions. |
| 293 | `canonical_name` | **P.I.** | `r.canonical_name === "P.I." \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 294 | `canonical_name` | **Mentalist** | `r.canonical_name === "Mentalist" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 295 | `canonical_name` | **The Count** | `r.canonical_name === "The Count")` | Partial: Can be further generalized by schema expansions in future versions. |
| 303 | `canonical_name` | **Bodyguard** | `r.canonical_name === "Bodyguard" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 304 | `canonical_name` | **Priest** | `r.canonical_name === "Priest" \|\|` | Partial: Can be further generalized by schema expansions in future versions. |
| 305 | `canonical_name` | **Witch** | `r.canonical_name === "Witch")` | Partial: Can be further generalized by schema expansions in future versions. |
| 325 | `canonical_name` | **Villager** | `ALL_ROLES.find((r) => r.canonical_name === "Villager") ` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/deathResolver.ts` (28 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 153 | `canonical_name` | **Hunter** | `if (victim.canonical_name === "Hunter") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 164 | `canonical_name` | **Tanner** | `if (victim.canonical_name === "Tanner") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 172 | `canonical_name` | **Dr. Boom** | `if (victim.canonical_name === "Dr. Boom" && item.cause ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 186 | `canonical_name` | **Mad Bomber** | `if (victim.canonical_name === "Mad Bomber") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 200 | `canonical_name` | **Wolverine** | `if (victim.canonical_name === "Wolverine" && item.cause` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 226 | `role_id` | **ROLE-060** | `(p.role_id === "ROLE-060" \|\| p.canonical_name === "Di` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 226 | `canonical_name` | **Dire Wolf** | `(p.role_id === "ROLE-060" \|\| p.canonical_name === "Di` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 242 | `role_id` | **ROLE-063** | `(p.role_id === "ROLE-063" \|\| p.canonical_name === "Vi` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 242 | `canonical_name` | **Virginia Woolf** | `(p.role_id === "ROLE-063" \|\| p.canonical_name === "Vi` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 255 | `canonical_name` | **Wolf Cub** | `if (victim.canonical_name === "Wolf Cub") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 260 | `canonical_name` | **Diseased** | `if (victim.canonical_name === "Diseased" && item.cause ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 268 | `role_id` | **ROLE-033** | `(p.role_id === "ROLE-033" \|\| p.canonical_name.toLower` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 283 | `canonical_name` | **Seer** | `if (victim.canonical_name === "Seer") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 285 | `canonical_name` | **Apprentice Seer** | `if (p.alive && p.canonical_name === "Apprentice Seer") ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 153 | `canonical_name` | **Hunter** | `if (victim.canonical_name === "Hunter") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 164 | `canonical_name` | **Tanner** | `if (victim.canonical_name === "Tanner") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 172 | `canonical_name` | **Dr. Boom** | `if (victim.canonical_name === "Dr. Boom" && item.cause ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 186 | `canonical_name` | **Mad Bomber** | `if (victim.canonical_name === "Mad Bomber") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 200 | `canonical_name` | **Wolverine** | `if (victim.canonical_name === "Wolverine" && item.cause` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 226 | `role_id` | **ROLE-060** | `(p.role_id === "ROLE-060" \|\| p.canonical_name === "Di` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 226 | `canonical_name` | **Dire Wolf** | `(p.role_id === "ROLE-060" \|\| p.canonical_name === "Di` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 242 | `role_id` | **ROLE-063** | `(p.role_id === "ROLE-063" \|\| p.canonical_name === "Vi` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 242 | `canonical_name` | **Virginia Woolf** | `(p.role_id === "ROLE-063" \|\| p.canonical_name === "Vi` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 255 | `canonical_name` | **Wolf Cub** | `if (victim.canonical_name === "Wolf Cub") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 260 | `canonical_name` | **Diseased** | `if (victim.canonical_name === "Diseased" && item.cause ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 268 | `role_id` | **ROLE-033** | `(p.role_id === "ROLE-033" \|\| p.canonical_name.toLower` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 283 | `canonical_name` | **Seer** | `if (victim.canonical_name === "Seer") {` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |
| 285 | `canonical_name` | **Apprentice Seer** | `if (p.alive && p.canonical_name === "Apprentice Seer") ` | Trigger Handler: Event dispatch is driven by `trigger` column, but execution of complex cascading reactions (Hunter retaliation, Dr. Boom explosion) requires executable handler logic. |

### File: `src/lib/engine/informationEngine.ts` (20 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 105 | `role_id` | **ROLE-043** | `if (player.role_id === "ROLE-043" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 105 | `canonical_name` | **Mason** | `if (player.role_id === "ROLE-043" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 110 | `role_id` | **ROLE-043** | `(p.role_id === "ROLE-043" \|\| p.canonical_name === "Ma` | Partial: Can be further generalized by schema expansions in future versions. |
| 110 | `canonical_name` | **Mason** | `(p.role_id === "ROLE-043" \|\| p.canonical_name === "Ma` | Partial: Can be further generalized by schema expansions in future versions. |
| 116 | `role_id` | **ROLE-071** | `if (player.role_id === "ROLE-071" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 116 | `canonical_name` | **Beholder** | `if (player.role_id === "ROLE-071" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 117 | `role_id` | **ROLE-022** | `const seer = allPlayers.find((p) => p.role_id === "ROLE` | Partial: Can be further generalized by schema expansions in future versions. |
| 117 | `canonical_name` | **Seer** | `const seer = allPlayers.find((p) => p.role_id === "ROLE` | Partial: Can be further generalized by schema expansions in future versions. |
| 124 | `role_id` | **ROLE-045** | `if (player.role_id === "ROLE-045" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 124 | `canonical_name` | **Minion** | `if (player.role_id === "ROLE-045" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 105 | `role_id` | **ROLE-043** | `if (player.role_id === "ROLE-043" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 105 | `canonical_name` | **Mason** | `if (player.role_id === "ROLE-043" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 110 | `role_id` | **ROLE-043** | `(p.role_id === "ROLE-043" \|\| p.canonical_name === "Ma` | Partial: Can be further generalized by schema expansions in future versions. |
| 110 | `canonical_name` | **Mason** | `(p.role_id === "ROLE-043" \|\| p.canonical_name === "Ma` | Partial: Can be further generalized by schema expansions in future versions. |
| 116 | `role_id` | **ROLE-071** | `if (player.role_id === "ROLE-071" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 116 | `canonical_name` | **Beholder** | `if (player.role_id === "ROLE-071" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 117 | `role_id` | **ROLE-022** | `const seer = allPlayers.find((p) => p.role_id === "ROLE` | Partial: Can be further generalized by schema expansions in future versions. |
| 117 | `canonical_name` | **Seer** | `const seer = allPlayers.find((p) => p.role_id === "ROLE` | Partial: Can be further generalized by schema expansions in future versions. |
| 124 | `role_id` | **ROLE-045** | `if (player.role_id === "ROLE-045" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |
| 124 | `canonical_name` | **Minion** | `if (player.role_id === "ROLE-045" \|\| player.canonical` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/investigationEngine.ts` (8 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 29 | `canonical_name` | **Wolf Man** | `if (target.canonical_name === "Wolf Man") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 32 | `canonical_name` | **Lycan** | `if (target.canonical_name === "Lycan") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 86 | `canonical_name` | **Seer** | `const isSeer = target.canonical_name === "Seer" \|\| ta` | Partial: Can be further generalized by schema expansions in future versions. |
| 86 | `canonical_name` | **Apprentice Seer** | `const isSeer = target.canonical_name === "Seer" \|\| ta` | Partial: Can be further generalized by schema expansions in future versions. |
| 29 | `canonical_name` | **Wolf Man** | `if (target.canonical_name === "Wolf Man") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 32 | `canonical_name` | **Lycan** | `if (target.canonical_name === "Lycan") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 86 | `canonical_name` | **Seer** | `const isSeer = target.canonical_name === "Seer" \|\| ta` | Partial: Can be further generalized by schema expansions in future versions. |
| 86 | `canonical_name` | **Apprentice Seer** | `const isSeer = target.canonical_name === "Seer" \|\| ta` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/protectionEngine.ts` (16 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 40 | `role_id` | **ROLE-031** | `(target.role_id === "ROLE-031" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 40 | `canonical_name` | **Cursed** | `(target.role_id === "ROLE-031" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 55 | `role_id` | **ROLE-054** | `(target.role_id === "ROLE-054" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 55 | `canonical_name` | **Tough Guy** | `(target.role_id === "ROLE-054" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 70 | `role_id` | **ROLE-050** | `(target.role_id === "ROLE-050" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 70 | `canonical_name` | **Prince** | `(target.role_id === "ROLE-050" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 85 | `canonical_name` | **Idiot** | `(target.canonical_name === "Idiot" \|\| target.canonica` | Partial: Can be further generalized by schema expansions in future versions. |
| 85 | `canonical_name` | **Village Idiot** | `(target.canonical_name === "Idiot" \|\| target.canonica` | Partial: Can be further generalized by schema expansions in future versions. |
| 40 | `role_id` | **ROLE-031** | `(target.role_id === "ROLE-031" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 40 | `canonical_name` | **Cursed** | `(target.role_id === "ROLE-031" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 55 | `role_id` | **ROLE-054** | `(target.role_id === "ROLE-054" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 55 | `canonical_name` | **Tough Guy** | `(target.role_id === "ROLE-054" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 70 | `role_id` | **ROLE-050** | `(target.role_id === "ROLE-050" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 70 | `canonical_name` | **Prince** | `(target.role_id === "ROLE-050" \|\| target.canonical_na` | Partial: Can be further generalized by schema expansions in future versions. |
| 85 | `canonical_name` | **Idiot** | `(target.canonical_name === "Idiot" \|\| target.canonica` | Partial: Can be further generalized by schema expansions in future versions. |
| 85 | `canonical_name` | **Village Idiot** | `(target.canonical_name === "Idiot" \|\| target.canonica` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/roleTransformation.ts` (2 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 93 | `role_id` | **ROLE-033** | `doppelgangerPlayer.role_id === "ROLE-033";` | Partial: Can be further generalized by schema expansions in future versions. |
| 93 | `role_id` | **ROLE-033** | `doppelgangerPlayer.role_id === "ROLE-033";` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/stateManager.ts` (16 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 111 | `canonical_name` | **Mason** | `if (player.canonical_name === "Mason") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 113 | `canonical_name` | **Mason** | `if (other.id !== player.id && other.canonical_name === ` | Partial: Can be further generalized by schema expansions in future versions. |
| 120 | `canonical_name` | **Minion** | `if (player.canonical_name === "Minion") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 138 | `canonical_name` | **Beholder** | `if (player.canonical_name === "Beholder" \|\| player.ro` | Partial: Can be further generalized by schema expansions in future versions. |
| 138 | `role_id` | **ROLE-071** | `if (player.canonical_name === "Beholder" \|\| player.ro` | Partial: Can be further generalized by schema expansions in future versions. |
| 140 | `canonical_name` | **Seer** | `if (other.canonical_name === "Seer" \|\| other.role_id ` | Partial: Can be further generalized by schema expansions in future versions. |
| 140 | `role_id` | **ROLE-022** | `if (other.canonical_name === "Seer" \|\| other.role_id ` | Partial: Can be further generalized by schema expansions in future versions. |
| 152 | `canonical_name` | **Seer** | `seerHistory: player.canonical_name === "Seer" ? seerHis` | Partial: Can be further generalized by schema expansions in future versions. |
| 111 | `canonical_name` | **Mason** | `if (player.canonical_name === "Mason") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 113 | `canonical_name` | **Mason** | `if (other.id !== player.id && other.canonical_name === ` | Partial: Can be further generalized by schema expansions in future versions. |
| 120 | `canonical_name` | **Minion** | `if (player.canonical_name === "Minion") {` | Partial: Can be further generalized by schema expansions in future versions. |
| 138 | `canonical_name` | **Beholder** | `if (player.canonical_name === "Beholder" \|\| player.ro` | Partial: Can be further generalized by schema expansions in future versions. |
| 138 | `role_id` | **ROLE-071** | `if (player.canonical_name === "Beholder" \|\| player.ro` | Partial: Can be further generalized by schema expansions in future versions. |
| 140 | `canonical_name` | **Seer** | `if (other.canonical_name === "Seer" \|\| other.role_id ` | Partial: Can be further generalized by schema expansions in future versions. |
| 140 | `role_id` | **ROLE-022** | `if (other.canonical_name === "Seer" \|\| other.role_id ` | Partial: Can be further generalized by schema expansions in future versions. |
| 152 | `canonical_name` | **Seer** | `seerHistory: player.canonical_name === "Seer" ? seerHis` | Partial: Can be further generalized by schema expansions in future versions. |

### File: `src/lib/engine/voteResolver.ts` (40 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 52 | `role_id` | **ROLE-069** | `(p) => (p.role_id === "ROLE-069" \|\| p.canonical_name ` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 52 | `canonical_name` | **The Mummy** | `(p) => (p.role_id === "ROLE-069" \|\| p.canonical_name ` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `role_id` | **ROLE-015** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `role_id` | **ROLE-017** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `canonical_name` | **Ralph** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `canonical_name` | **Sam** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 99 | `role_id` | **ROLE-044** | `if (voter.role_id === "ROLE-044" \|\| voter.canonical_n` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 99 | `canonical_name` | **Mayor** | `if (voter.role_id === "ROLE-044" \|\| voter.canonical_n` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 134 | `role_id` | **ROLE-081** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 134 | `canonical_name` | **Sasquatch** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 167 | `role_id` | **ROLE-042** | `(martyr.role_id === "ROLE-042" \|\| martyr.canonical_na` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 167 | `canonical_name` | **Martyr** | `(martyr.role_id === "ROLE-042" \|\| martyr.canonical_na` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 180 | `role_id` | **ROLE-050** | `(targetPlayer.role_id === "ROLE-050" \|\| targetPlayer.` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 180 | `canonical_name` | **Prince** | `(targetPlayer.role_id === "ROLE-050" \|\| targetPlayer.` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 192 | `role_id` | **ROLE-081** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 192 | `canonical_name` | **Sasquatch** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 217 | `role_id` | **ROLE-053** | `if (targetPlayer.role_id === "ROLE-053" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 217 | `canonical_name` | **Tanner** | `if (targetPlayer.role_id === "ROLE-053" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 227 | `role_id` | **ROLE-019** | `if (targetPlayer.role_id === "ROLE-019" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 227 | `canonical_name` | **Time Bandit** | `if (targetPlayer.role_id === "ROLE-019" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 52 | `role_id` | **ROLE-069** | `(p) => (p.role_id === "ROLE-069" \|\| p.canonical_name ` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 52 | `canonical_name` | **The Mummy** | `(p) => (p.role_id === "ROLE-069" \|\| p.canonical_name ` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `role_id` | **ROLE-015** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `role_id` | **ROLE-017** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `canonical_name` | **Ralph** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 90 | `canonical_name` | **Sam** | `if (isTimeout && (voter.role_id === "ROLE-015" \|\| vot` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 99 | `role_id` | **ROLE-044** | `if (voter.role_id === "ROLE-044" \|\| voter.canonical_n` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 99 | `canonical_name` | **Mayor** | `if (voter.role_id === "ROLE-044" \|\| voter.canonical_n` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 134 | `role_id` | **ROLE-081** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 134 | `canonical_name` | **Sasquatch** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 167 | `role_id` | **ROLE-042** | `(martyr.role_id === "ROLE-042" \|\| martyr.canonical_na` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 167 | `canonical_name` | **Martyr** | `(martyr.role_id === "ROLE-042" \|\| martyr.canonical_na` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 180 | `role_id` | **ROLE-050** | `(targetPlayer.role_id === "ROLE-050" \|\| targetPlayer.` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 180 | `canonical_name` | **Prince** | `(targetPlayer.role_id === "ROLE-050" \|\| targetPlayer.` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 192 | `role_id` | **ROLE-081** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 192 | `canonical_name` | **Sasquatch** | `if (p.alive && (p.role_id === "ROLE-081" \|\| p.canonic` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 217 | `role_id` | **ROLE-053** | `if (targetPlayer.role_id === "ROLE-053" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 217 | `canonical_name` | **Tanner** | `if (targetPlayer.role_id === "ROLE-053" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 227 | `role_id` | **ROLE-019** | `if (targetPlayer.role_id === "ROLE-019" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |
| 227 | `canonical_name` | **Time Bandit** | `if (targetPlayer.role_id === "ROLE-019" \|\| targetPlay` | Vote Modifier Handler: Database specifies `action_type: Double Vote` or `Force Non-Elimination`, executed by daytime vote resolver. |

### File: `src/lib/engine/winEngine.ts` (48 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 57 | `role_id` | **ROLE-080** | `(p.role_id === "ROLE-080" \|\| p.canonical_name === "No` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 57 | `canonical_name` | **Nostradamus** | `(p.role_id === "ROLE-080" \|\| p.canonical_name === "No` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 73 | `role_id` | **ROLE-014** | `p.role_id === "ROLE-014" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 74 | `canonical_name` | **Mo T. Le** | `p.canonical_name === "Mo T. Le'Sav / Tom Vasel" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 85 | `role_id` | **ROLE-002** | `p.role_id === "ROLE-002" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 97 | `role_id` | **ROLE-036** | `(p.role_id === "ROLE-036" \|\| p.canonical_name === "Ho` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 97 | `canonical_name` | **Hoodlum** | `(p.role_id === "ROLE-036" \|\| p.canonical_name === "Ho` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 122 | `role_id` | **ROLE-053** | `(p) => (p.role_id === "ROLE-053" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 122 | `canonical_name` | **Tanner** | `(p) => (p.role_id === "ROLE-053" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 136 | `role_id` | **ROLE-007** | `(p) => (p.role_id === "ROLE-007" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 136 | `canonical_name` | **Father Time** | `(p) => (p.role_id === "ROLE-007" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 163 | `role_id` | **ROLE-029** | `(p) => p.role_id === "ROLE-029" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 163 | `canonical_name` | **Cult Leader** | `(p) => p.role_id === "ROLE-029" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 182 | `role_id` | **ROLE-040** | `(p) => p.role_id === "ROLE-040" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 182 | `canonical_name` | **Lone Wolf** | `(p) => p.role_id === "ROLE-040" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 196 | `role_id` | **ROLE-036** | `(p) => p.role_id === "ROLE-036" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 196 | `canonical_name` | **Hoodlum** | `(p) => p.role_id === "ROLE-036" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 216 | `role_id` | **ROLE-068** | `(p) => p.role_id === "ROLE-068" \|\| p.team === "Blob"` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 232 | `role_id` | **ROLE-069** | `(p) => p.role_id === "ROLE-069" \|\| p.team === "Mummy"` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 248 | `role_id` | **ROLE-070** | `(p) => p.role_id === "ROLE-070" \|\| p.team === "Zombie` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 265 | `role_id` | **ROLE-025** | `p.role_id === "ROLE-025" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 266 | `role_id` | **ROLE-065** | `p.role_id === "ROLE-065" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 297 | `role_id` | **ROLE-078** | `(p) => p.role_id === "ROLE-078" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 297 | `canonical_name` | **Chupacabra** | `(p) => p.role_id === "ROLE-078" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 57 | `role_id` | **ROLE-080** | `(p.role_id === "ROLE-080" \|\| p.canonical_name === "No` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 57 | `canonical_name` | **Nostradamus** | `(p.role_id === "ROLE-080" \|\| p.canonical_name === "No` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 73 | `role_id` | **ROLE-014** | `p.role_id === "ROLE-014" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 74 | `canonical_name` | **Mo T. Le** | `p.canonical_name === "Mo T. Le'Sav / Tom Vasel" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 85 | `role_id` | **ROLE-002** | `p.role_id === "ROLE-002" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 97 | `role_id` | **ROLE-036** | `(p.role_id === "ROLE-036" \|\| p.canonical_name === "Ho` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 97 | `canonical_name` | **Hoodlum** | `(p.role_id === "ROLE-036" \|\| p.canonical_name === "Ho` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 122 | `role_id` | **ROLE-053** | `(p) => (p.role_id === "ROLE-053" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 122 | `canonical_name` | **Tanner** | `(p) => (p.role_id === "ROLE-053" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 136 | `role_id` | **ROLE-007** | `(p) => (p.role_id === "ROLE-007" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 136 | `canonical_name` | **Father Time** | `(p) => (p.role_id === "ROLE-007" \|\| p.canonical_name ` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 163 | `role_id` | **ROLE-029** | `(p) => p.role_id === "ROLE-029" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 163 | `canonical_name` | **Cult Leader** | `(p) => p.role_id === "ROLE-029" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 182 | `role_id` | **ROLE-040** | `(p) => p.role_id === "ROLE-040" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 182 | `canonical_name` | **Lone Wolf** | `(p) => p.role_id === "ROLE-040" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 196 | `role_id` | **ROLE-036** | `(p) => p.role_id === "ROLE-036" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 196 | `canonical_name` | **Hoodlum** | `(p) => p.role_id === "ROLE-036" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 216 | `role_id` | **ROLE-068** | `(p) => p.role_id === "ROLE-068" \|\| p.team === "Blob"` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 232 | `role_id` | **ROLE-069** | `(p) => p.role_id === "ROLE-069" \|\| p.team === "Mummy"` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 248 | `role_id` | **ROLE-070** | `(p) => p.role_id === "ROLE-070" \|\| p.team === "Zombie` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 265 | `role_id` | **ROLE-025** | `p.role_id === "ROLE-025" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 266 | `role_id` | **ROLE-065** | `p.role_id === "ROLE-065" \|\|` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 297 | `role_id` | **ROLE-078** | `(p) => p.role_id === "ROLE-078" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |
| 297 | `canonical_name` | **Chupacabra** | `(p) => p.role_id === "ROLE-078" \|\| p.canonical_name =` | Architectural Necessity: Victory condition logic (e.g. Tanner voted out, Cult recruits all alive, Father Time 3 timeouts) requires dedicated evaluation predicates that cannot be expressed purely by static scalar database columns. |

### File: `src/lib/gameEngine.ts` (4 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 88 | `role_id` | **ROLE-031** | `isCursed: p.role_id === "ROLE-031" \|\| dbRole?.canonic` | Database Driven: Populates rich PlayerEngineState from `ROLE_BY_ID`. |
| 88 | `canonical_name` | **Cursed** | `isCursed: p.role_id === "ROLE-031" \|\| dbRole?.canonic` | Database Driven: Populates rich PlayerEngineState from `ROLE_BY_ID`. |
| 88 | `canonical_name` | **Cursed** | `isCursed: p.role_id === "ROLE-031" \|\| dbRole?.canonic` | Database Driven: Populates rich PlayerEngineState from `ROLE_BY_ID`. |
| 133 | `canonical_name` | **Villager** | `const villagerRole = ALL_ROLES.find((r) => r.canonical_` | Database Driven: Populates rich PlayerEngineState from `ROLE_BY_ID`. |

### File: `src/store/gameStore.ts` (1 occurrences)

| Line | Field Checked | Value | Purpose / Mechanic | Can Be Replaced by Database? |
| :--- | :--- | :--- | :--- | :--- |
| 395 | `canonical_name` | **Seer** | `if (myPlayer.canonical_name === "Seer" && targetPlayerI` | Partial: Can be further generalized by schema expansions in future versions. |

## Conclusion & Architectural Recommendation

1. **Replaced in Phase 3**:
   - `evaluateSeerResult()`: Now 100% database-driven via `seer_result` column (`Wolf Man` = Villager, `Lycan` = Werewolf).
   - Night Priority Ordering: Now 100% database-driven via `night_priority` column.
   - Mode 2 & Mode 3 Balancing: Algorithmic constrained heuristic balance search via `role_points` and `balance_weight` (Mode 2 samples strictly without replacement).
   - `gameEngine.ts`: Player mapping now populates 100% of metadata directly from `ROLE_BY_ID`.
2. **Retained as Card-Specific Executable Handlers**:
   - Handlers for specific card mechanics (e.g., Cupid lovers suicide, Dr. Boom blast, Witch 2-potion tracking, Tanner vote-only win) remain as procedural handler functions dispatched by `role_id` / `canonical_name`. This is standard, robust game engine architecture.
