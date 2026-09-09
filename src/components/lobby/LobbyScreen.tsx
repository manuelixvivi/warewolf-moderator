"use client";
import { useGameStore } from "@/store/gameStore";
import { useState, useMemo } from "react";
import rolesJson from "@/data/roles.json";
import { RoleData, SelectedRole } from "@/types/game";
import ChatBox from "@/components/chat/ChatBox";

const ALL_ROLES = rolesJson as RoleData[];
const CATEGORIES = ["Semua", "Village", "Werewolf", "Neutral"];

export default function LobbyScreen() {
  const { room, players, myPlayerId, startGame, updateRoomConfig } = useGameStore();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Host Edit Room State
  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<"MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM">("MODE_1_FIXED");
  const [editSelectedMap, setEditSelectedMap] = useState<Record<string, number>>({});
  const [editCategory, setEditCategory] = useState("Semua");
  const [editSearch, setEditSearch] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const isHost = room?.hostId === myPlayerId;
  const gameMode = room?.gameMode || "MODE_1_FIXED";
  const targetCount = room?.targetPlayerCount;
  const joinedCount = players.length;

  const hasMinPlayers = joinedCount >= 5;
  const isExactFull = targetCount ? joinedCount === targetCount : false;

  // Mode 2 pool wolf check
  const poolRoleIds = room?.selectedRolePool || (room?.selectedRoles ? room.selectedRoles.map((r) => r.role_id) : []);
  const poolHasWolf = poolRoleIds.some((rid) => {
    const r = ALL_ROLES.find((x) => x.role_id === rid);
    return (
      r?.team === "Werewolf" ||
      r?.team === "Solo Werewolf" ||
      r?.team === "Werewolf-aligned" ||
      r?.category === "Werewolf"
    );
  });

  // Mode 1 requires exact count match.
  // Mode 2 requires at least 5 players and at least 1 wolf in pool.
  // Mode 3 requires at least 5 players.
  const canStart =
    gameMode === "MODE_1_FIXED"
      ? isExactFull && hasMinPlayers
      : gameMode === "MODE_2_POOL"
      ? hasMinPlayers && poolHasWolf
      : hasMinPlayers;

  const handleCopyCode = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!room?.code || typeof window === "undefined") return;
    const url = `${window.location.origin}/?room=${encodeURIComponent(room.code)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenEdit = () => {
    const currentMode =
      room?.gameMode === "MODE_2_POOL"
        ? "MODE_2_POOL"
        : room?.gameMode === "MODE_3_RANDOM"
        ? "MODE_3_RANDOM"
        : "MODE_1_FIXED";
    setEditMode(currentMode);

    const map: Record<string, number> = {};
    if (currentMode === "MODE_1_FIXED" && room?.selectedRoles) {
      for (const sr of room.selectedRoles) {
        map[sr.role_id] = sr.count;
      }
    } else if (currentMode === "MODE_2_POOL") {
      const pool = room?.selectedRolePool || room?.selectedRoles?.map((r) => r.role_id) || [];
      for (const rid of pool) {
        map[rid] = 1;
      }
    }
    setEditSelectedMap(map);
    setEditError(null);
    setIsEditing(true);
  };

  // Filter roles for edit modal
  const filteredEditRoles = useMemo(() => {
    return ALL_ROLES.filter((r) => {
      const matchCat =
        editCategory === "Semua" ||
        r.category.toLowerCase() === editCategory.toLowerCase() ||
        r.team.toLowerCase() === editCategory.toLowerCase();
      const matchSearch =
        !editSearch ||
        r.canonical_name.toLowerCase().includes(editSearch.toLowerCase()) ||
        (r.description_id && r.description_id.toLowerCase().includes(editSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [editCategory, editSearch]);

  const editTotalRolesCount = useMemo(() => {
    return Object.values(editSelectedMap).reduce((s, c) => s + c, 0);
  }, [editSelectedMap]);

  const editMode2SelectedPool = useMemo(() => {
    return Object.entries(editSelectedMap)
      .filter(([, c]) => c > 0)
      .map(([rid]) => rid);
  }, [editSelectedMap]);

  const editHasWerewolf = useMemo(() => {
    return Object.entries(editSelectedMap).some(([rid, count]) => {
      if (!count) return false;
      const r = ALL_ROLES.find((x) => x.role_id === rid);
      return (
        r?.team === "Werewolf" ||
        r?.team === "Solo Werewolf" ||
        r?.team === "Werewolf-aligned" ||
        r?.category === "Werewolf"
      );
    });
  }, [editSelectedMap]);

  const handleEditIncrement = (role_id: string) => {
    if (editMode === "MODE_2_POOL") {
      setEditSelectedMap((prev) => ({
        ...prev,
        [role_id]: prev[role_id] ? 0 : 1,
      }));
      return;
    }
    setEditSelectedMap((prev) => ({
      ...prev,
      [role_id]: (prev[role_id] || 0) + 1,
    }));
  };

  const handleEditDecrement = (role_id: string) => {
    if (editMode === "MODE_2_POOL") {
      setEditSelectedMap((prev) => {
        const copy = { ...prev };
        delete copy[role_id];
        return copy;
      });
      return;
    }
    setEditSelectedMap((prev) => {
      const current = prev[role_id] || 0;
      if (current <= 1) {
        const copy = { ...prev };
        delete copy[role_id];
        return copy;
      }
      return { ...prev, [role_id]: current - 1 };
    });
  };

  const handleSaveConfig = () => {
    setEditError(null);

    if (editMode === "MODE_1_FIXED") {
      const totalRoles = editTotalRolesCount;
      if (totalRoles < joinedCount) {
        setEditError(
          `Jumlah pemain target (${totalRoles}) tidak boleh lebih kecil dari jumlah pemain yang sudah bergabung (${joinedCount}).`
        );
        return;
      }
      if (totalRoles < 5) {
        setEditError("Minimal 5 peran dibutuhkan untuk memulai permainan.");
        return;
      }
      if (!editHasWerewolf) {
        setEditError("Komposisi peran wajib memiliki minimal 1 peran di pihak Werewolf.");
        return;
      }

      const roles: SelectedRole[] = Object.entries(editSelectedMap)
        .filter(([, count]) => count > 0)
        .map(([role_id, count]) => ({
          role_id,
          canonical_name: ALL_ROLES.find((r) => r.role_id === role_id)?.canonical_name || role_id,
          count,
        }));

      updateRoomConfig({
        gameMode: "MODE_1_FIXED",
        targetPlayerCount: totalRoles,
        selectedRoles: roles,
        selectedRolePool: undefined,
      });
    } else if (editMode === "MODE_2_POOL") {
      const pool = editMode2SelectedPool;
      if (pool.length === 0) {
        setEditError("Role pool tidak boleh kosong. Silakan pilih minimal 1 peran.");
        return;
      }
      if (!editHasWerewolf) {
        setEditError("Role pool wajib memiliki minimal 1 peran di pihak Werewolf.");
        return;
      }

      updateRoomConfig({
        gameMode: "MODE_2_POOL",
        targetPlayerCount: undefined,
        selectedRoles: undefined,
        selectedRolePool: pool,
      });
    } else {
      updateRoomConfig({
        gameMode: "MODE_3_RANDOM",
        targetPlayerCount: undefined,
        selectedRoles: undefined,
        selectedRolePool: undefined,
      });
    }

    setIsEditing(false);
  };

  const modeLabel =
    gameMode === "MODE_1_FIXED"
      ? "Mode 1: Fixed Composition (Exact Match)"
      : gameMode === "MODE_2_POOL"
      ? "Mode 2: Role Pool (Dynamic Count)"
      : "Mode 3: Full Random (Auto Balanced)";

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Room Header & Invitation */}
        <div className="bg-gradient-to-r from-purple-950/70 via-gray-900 to-indigo-950/70 border border-purple-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4 relative overflow-hidden">
          <div className="space-y-1">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
              Lobby Ruang Tunggu Permainan
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {room?.code}
            </h1>
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              <span className="px-3 py-1 rounded-full bg-purple-900/60 border border-purple-700/60 text-purple-200 text-xs font-semibold">
                {modeLabel}
              </span>
              <span className="text-xs text-gray-400">
                Tema: <strong className="text-purple-300">{room?.storyTheme || "Dark Fantasy"}</strong>
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="px-3 py-1 bg-purple-700 hover:bg-purple-600 border border-purple-500 rounded-full text-xs font-bold text-white flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                >
                  <span>⚙️</span> Edit Room
                </button>
              )}
            </div>
          </div>

          {/* Quick Copy Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>📋</span> {copiedCode ? "Kode Tersalin!" : "Salin Kode Room"}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-4 py-2 bg-purple-800 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-950 flex items-center gap-2 cursor-pointer"
            >
              <span>🔗</span> {copiedLink ? "Link Tersalin!" : "Salin Link Undangan"}
            </button>
          </div>

          {/* Capacity Meter */}
          <div className="pt-3 max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-gray-300">
                Pemain Bergabung:{" "}
                <span className="text-purple-300 font-bold">{joinedCount}</span>
                {gameMode === "MODE_1_FIXED" && targetCount ? (
                  <span> / <span className="text-white font-bold">{targetCount}</span></span>
                ) : (
                  <span> (Minimal 5)</span>
                )}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                  canStart
                    ? "bg-green-950 border border-green-500 text-green-300 animate-pulse"
                    : "bg-yellow-950 border border-yellow-600 text-yellow-300"
                }`}
              >
                {canStart
                  ? "SIAP DIMULAI!"
                  : joinedCount < 5
                  ? `Kurang ${5 - joinedCount} Pemain Lagi`
                  : gameMode === "MODE_1_FIXED" && targetCount
                  ? `Kurang ${targetCount - joinedCount} Pemain`
                  : !poolHasWolf
                  ? "Butuh Serigala di Pool"
                  : "Menunggu Pemain"}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  canStart
                    ? "bg-gradient-to-r from-emerald-500 to-green-400"
                    : "bg-gradient-to-r from-purple-600 to-indigo-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    gameMode === "MODE_1_FIXED" && targetCount
                      ? (joinedCount / targetCount) * 100
                      : (joinedCount / 5) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Players List Grid */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
              <span>👥</span> Daftar Pemain di Room ({joinedCount})
            </h2>
            <span className="text-xs text-gray-500">
              {canStart ? "Jumlah pemain mencukupi" : "Menunggu pemain lain masuk..."}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {players.map((p, idx) => {
              const isMe = p.id === myPlayerId;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isMe
                      ? "bg-purple-950/60 border-purple-500/80 shadow-md shadow-purple-950/40"
                      : "bg-gray-800/80 border-gray-700"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-indigo-900 flex items-center justify-center font-bold text-sm text-white shrink-0 border border-purple-400/40">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-white text-sm truncate">{p.name}</span>
                      {p.isHost && (
                        <span className="text-xs shrink-0" title="Pemilik Room (Host)">👑</span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 block truncate">
                      {isMe ? "Kamu" : `Pemain #${idx + 1}`}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Empty slots placeholders for Mode 1 */}
            {gameMode === "MODE_1_FIXED" && targetCount &&
              Array.from({ length: Math.max(0, targetCount - joinedCount) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 text-gray-600"
                >
                  <div className="w-9 h-9 rounded-full border border-dashed border-gray-800 flex items-center justify-center text-xs shrink-0 font-mono">
                    {joinedCount + i + 1}
                  </div>
                  <span className="text-xs italic">Menunggu pemain...</span>
                </div>
              ))}
          </div>
        </div>

        {/* Roles Preview */}
        {gameMode === "MODE_2_POOL" && poolRoleIds.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎭</span> Role Pool (Peran yang Diizinkan - {poolRoleIds.length} Peran)
            </h3>
            <div className="flex flex-wrap gap-2">
              {poolRoleIds.map((rid) => {
                const roleDef = ALL_ROLES.find((r) => r.role_id === rid);
                return (
                  <div
                    key={rid}
                    className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1 text-xs"
                  >
                    <span className="text-white font-medium">{roleDef?.canonical_name || rid}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 italic">
              *Engine akan memilih subset seimbang dari pool di atas secara otomatis sesuai jumlah pemain aktual yang bergabung ({joinedCount} pemain).
            </p>
          </div>
        )}

        {gameMode === "MODE_1_FIXED" && room?.selectedRoles && room.selectedRoles.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎭</span> Peran yang Tersedia di Room Ini
            </h3>
            <div className="flex flex-wrap gap-2">
              {room.selectedRoles.map((sr) => (
                <div
                  key={sr.role_id}
                  className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1 text-xs"
                >
                  <span className="text-white font-medium">{sr.canonical_name}</span>
                  <span className="bg-purple-700 text-purple-100 text-[10px] rounded-full px-1.5 py-0.2 font-bold">
                    ×{sr.count}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 italic">
              *Setiap pemain akan mendapatkan salah satu peran di atas secara acak ketika permainan dimulai.
            </p>
          </div>
        )}

        {/* Lobby Chat */}
        <ChatBox
          channel="LOBBY"
          title="Obrolan Ruang Tunggu (Lobby Chat)"
          subtitle="Sapa teman-temanmu selagi menunggu!"
          placeholder="Ketik pesan untuk menyapa teman di lobby..."
          maxHeight="h-44 sm:h-52"
        />

        {/* Start Game Footer Action */}
        <div className="pt-2">
          {isHost ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={startGame}
                disabled={!canStart}
                className={`w-full py-4 rounded-2xl font-black text-lg sm:text-xl shadow-2xl transition-all flex items-center justify-center gap-3 ${
                  canStart
                    ? "bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                    : "bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                <span>{canStart ? "🚀" : "🔒"}</span>
                <span>
                  {canStart
                    ? `START GAME (${joinedCount} PEMAIN)`
                    : joinedCount < 5
                    ? `Menunggu Minimal 5 Pemain (${joinedCount}/5)`
                    : gameMode === "MODE_2_POOL" && !poolHasWolf
                    ? "Pool Wajib Memiliki Peran Serigala!"
                    : gameMode === "MODE_1_FIXED" && targetCount
                    ? `Menunggu Room Penuh (${joinedCount}/${targetCount})`
                    : "Menunggu Pemain"}
                </span>
              </button>

              {!canStart && (
                <p className="text-center text-xs text-yellow-400 font-medium">
                  {joinedCount < 5
                    ? "⚠️ Game ASPIRE: WEREWOLF memerlukan minimal 5 pemain untuk menjaga keseimbangan permainan."
                    : gameMode === "MODE_2_POOL" && !poolHasWolf
                    ? "⚠️ Role pool tidak memiliki peran di pihak Werewolf. Host tidak dapat memulai game tanpa serigala!"
                    : gameMode === "MODE_1_FIXED" && targetCount
                    ? `⚠️ Mode 1 memerlukan semua ${targetCount} kursi terisi sebelum bisa dimulai.`
                    : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center p-4 rounded-2xl bg-gray-900 border border-gray-800 space-y-1">
              <p className="text-sm font-bold text-purple-300">
                {canStart
                  ? "Jumlah pemain mencukupi! Menunggu Host menekan Start Game..."
                  : joinedCount < 5
                  ? `Menunggu minimal 5 pemain (saat ini ${joinedCount})...`
                  : gameMode === "MODE_2_POOL"
                  ? "Menunggu Host menekan Start Game..."
                  : targetCount
                  ? `Menunggu room penuh (${joinedCount}/${targetCount})...`
                  : "Menunggu Host..."}
              </p>
              <p className="text-xs text-gray-500">
                Hanya pemilik room (👑 {room?.hostName}) yang dapat memulai permainan.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Host Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-purple-800/80 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>⚙️</span> Edit Konfigurasi Room
                </h3>
                <p className="text-xs text-gray-400">
                  Ubah mode atau komposisi kartu selagi di lobby.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {editError && (
              <div className="p-3 bg-red-950/80 border border-red-700 text-red-200 text-xs rounded-xl font-medium">
                ⚠️ {editError}
              </div>
            )}

            {/* Mode Switcher */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Mode Permainan
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEditMode("MODE_1_FIXED")}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    editMode === "MODE_1_FIXED"
                      ? "bg-purple-950 border-purple-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  Mode 1: Fixed
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode("MODE_2_POOL")}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    editMode === "MODE_2_POOL"
                      ? "bg-purple-950 border-purple-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  Mode 2: Pool
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode("MODE_3_RANDOM")}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    editMode === "MODE_3_RANDOM"
                      ? "bg-purple-950 border-purple-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  Mode 3: Random
                </button>
              </div>
            </div>

            {/* Mode 1 & 2 Role Selection Controls */}
            {editMode !== "MODE_3_RANDOM" ? (
              <div className="space-y-4">
                {/* Stats bar */}
                <div className="flex items-center justify-between bg-gray-800/80 p-3 rounded-xl text-xs">
                  <div>
                    {editMode === "MODE_1_FIXED" ? (
                      <span>
                        Target Pemain:{" "}
                        <strong className="text-purple-300 text-sm">
                          {editTotalRolesCount}
                        </strong>{" "}
                        (Minimal {Math.max(5, joinedCount)})
                      </span>
                    ) : (
                      <span>
                        Peran di Pool:{" "}
                        <strong className="text-purple-300 text-sm">
                          {editMode2SelectedPool.length}
                        </strong>{" "}
                        peran
                      </span>
                    )}
                  </div>
                  <div>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md ${
                        editHasWerewolf
                          ? "bg-green-950 text-green-300 border border-green-700/60"
                          : "bg-red-950 text-red-300 border border-red-700/60"
                      }`}
                    >
                      {editHasWerewolf ? "✓ Ada Serigala" : "✗ Butuh Serigala"}
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Cari peran..."
                    value={editSearch}
                    onChange={(e) => setEditSearch(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEditCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                          editCategory === cat
                            ? "bg-purple-800 text-white"
                            : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Roles List */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {filteredEditRoles.map((role) => {
                    const count = editSelectedMap[role.role_id] || 0;
                    const isSelected = count > 0;
                    return (
                      <div
                        key={role.role_id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                          isSelected
                            ? "bg-purple-950/40 border-purple-600/60"
                            : "bg-gray-800/50 border-gray-700/60"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white truncate">
                              {role.canonical_name}
                            </span>
                            <span className="text-[10px] text-gray-400 bg-gray-700/60 px-1.5 py-0.2 rounded">
                              {role.category}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate">
                            {role.description_id || role.description_en}
                          </p>
                        </div>

                        {/* Control buttons */}
                        {editMode === "MODE_1_FIXED" ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditDecrement(role.role_id)}
                              disabled={count <= 0}
                              className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold text-white text-xs">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditIncrement(role.role_id)}
                              className="w-6 h-6 rounded bg-purple-700 hover:bg-purple-600 text-white font-bold flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleEditIncrement(role.role_id)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-purple-700 text-white"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            }`}
                          >
                            {isSelected ? "✓ Aktif" : "+ Tambah"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-2xl text-xs text-gray-300 space-y-2">
                <p className="font-bold text-purple-300">
                  🎲 Mode 3: Komposisi Otomatis Dinamis
                </p>
                <p>
                  Sistem akan mengundi komposisi seimbang secara otomatis dari seluruh database 75 peran
                  sesuai jumlah pemain aktual saat Start Game ditekan. Tidak perlu memilih kartu secara manual.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-950"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
