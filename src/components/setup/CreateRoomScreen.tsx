"use client";
import { useState, useMemo } from "react";
import { useGameStore } from "@/store/gameStore";
import { RoleData, SelectedRole } from "@/types/game";
import RoleCard from "@/components/ui/RoleCard";
import rolesJson from "@/data/roles.json";
import {
  calculateCompositionBalance,
  generateBalancedRandomComposition,
  MINIMUM_PLAYERS,
} from "@/lib/gameEngine";

const ALL_ROLES: RoleData[] = rolesJson as RoleData[];
const THEMES = [
  "Dark Fantasy",
  "Horror Gothic",
  "Desa Terpencil",
  "Hutan Terkutuk",
  "Medieval",
  "Misteri Modern",
];
const CATEGORIES = ["Semua", "Village", "Werewolf", "Neutral", "Independent", "Special"];

export default function CreateRoomScreen() {
  const { createRoom, setPhase, myPlayerName } = useGameStore();
  const [hostName, setHostName] = useState(myPlayerName || "");
  const [theme, setTheme] = useState("Dark Fantasy");
  const [gameMode, setGameMode] = useState<
    "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM"
  >("MODE_1_FIXED");

  // Mode 1 & 2 selected roles map
  const [selectedMap, setSelectedMap] = useState<Record<string, number>>({
    "ROLE-023": 2, // 2 Werewolves
    "ROLE-022": 1, // 1 Seer
    "ROLE-028": 1, // 1 Bodyguard
    "ROLE-024": 4, // 4 Villagers (Total 8 players)
  });

  // Mode 3 target count
  const [mode3Count, setMode3Count] = useState(8);

  const [filterCategory, setFilterCategory] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Total role count in pool/fixed
  const totalSelectedRoles = Object.values(selectedMap).reduce((a, b) => a + b, 0);

  // Filtered roles list
  const filteredRoles = useMemo(() => {
    return ALL_ROLES.filter((r) => {
      if (r.entity_type === "Artifact" || r.entity_type === "Utility") return false;
      if (
        r.canonical_name === "Moderator" ||
        r.canonical_name === "Blank Cards" ||
        r.canonical_name.toLowerCase().includes("amulet")
      ) {
        return false;
      }

      const matchCat =
        filterCategory === "Semua" ||
        r.category.toLowerCase() === filterCategory.toLowerCase() ||
        r.team.toLowerCase() === filterCategory.toLowerCase();

      const matchSearch =
        !searchQuery ||
        r.canonical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.description_en && r.description_en.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.description_id && r.description_id.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCat && matchSearch;
    });
  }, [filterCategory, searchQuery]);

  const handleIncrement = (role_id: string) => {
    setSelectedMap((prev) => ({ ...prev, [role_id]: (prev[role_id] || 0) + 1 }));
  };

  const handleDecrement = (role_id: string) => {
    setSelectedMap((prev) => {
      const newCount = Math.max(0, (prev[role_id] || 0) - 1);
      const updated = { ...prev, [role_id]: newCount };
      if (newCount === 0) delete updated[role_id];
      return updated;
    });
  };

  const hasWerewolf = Object.keys(selectedMap).some((id) => {
    const role = ALL_ROLES.find((r) => r.role_id === id);
    return role && (role.team === "Werewolf" || role.category === "Werewolf");
  });

  // Expand selected roles for balance calculation
  const expandedSelectedRoles = useMemo(() => {
    if (gameMode === "MODE_3_RANDOM") {
      try {
        return generateBalancedRandomComposition(mode3Count);
      } catch {
        return [];
      }
    }
    const list: RoleData[] = [];
    for (const [id, count] of Object.entries(selectedMap)) {
      const role = ALL_ROLES.find((r) => r.role_id === id);
      if (role) {
        for (let i = 0; i < count; i++) list.push(role);
      }
    }
    return list;
  }, [gameMode, selectedMap, mode3Count]);

  // Balance metrics
  const balanceMetrics = useMemo(() => {
    return calculateCompositionBalance(expandedSelectedRoles);
  }, [expandedSelectedRoles]);

  // Validation rules
  const canCreate = useMemo(() => {
    if (!hostName.trim()) return false;
    if (gameMode === "MODE_3_RANDOM") {
      return mode3Count >= MINIMUM_PLAYERS;
    }
    return totalSelectedRoles >= MINIMUM_PLAYERS && hasWerewolf;
  }, [hostName, gameMode, mode3Count, totalSelectedRoles, hasWerewolf]);

  const handleCreateRoom = async () => {
    if (!canCreate || isSubmitting) return;
    setIsSubmitting(true);

    let selectedRoles: SelectedRole[] = [];

    if (gameMode === "MODE_3_RANDOM") {
      const generated = generateBalancedRandomComposition(mode3Count);
      const map: Record<string, number> = {};
      for (const r of generated) {
        map[r.role_id] = (map[r.role_id] || 0) + 1;
      }
      selectedRoles = Object.entries(map).map(([role_id, count]) => {
        const roleData = ALL_ROLES.find((r) => r.role_id === role_id)!;
        return { role_id, canonical_name: roleData.canonical_name, count };
      });
    } else {
      selectedRoles = Object.entries(selectedMap)
        .filter(([, count]) => count > 0)
        .map(([role_id, count]) => {
          const roleData = ALL_ROLES.find((r) => r.role_id === role_id)!;
          return { role_id, canonical_name: roleData.canonical_name, count };
        });
    }

    try {
      await createRoom(
        hostName.trim(),
        selectedRoles,
        theme,
        gameMode,
        gameMode === "MODE_3_RANDOM" ? mode3Count : totalSelectedRoles
      );
    } catch (err) {
      console.error(err);
      alert("Gagal membuat room. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-950 to-gray-950 border-b border-purple-900/50 px-4 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => setPhase("HOME")}
              className="text-xs text-gray-400 hover:text-white transition-colors mb-2 flex items-center gap-1 cursor-pointer"
            >
              ← Kembali ke Menu
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-purple-200 flex items-center gap-2">
              <span>👑</span> Buat Room ASPIRE
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm">
              One Village. Many Lies. One Wolf. Minimal {MINIMUM_PLAYERS} pemain.
            </p>
          </div>

          {/* Player Count Badge */}
          <div className="text-right">
            <div className="text-xs text-purple-400 font-bold uppercase tracking-wider">
              {gameMode === "MODE_1_FIXED"
                ? "Target Pemain"
                : gameMode === "MODE_2_POOL"
                ? "Role di Pool"
                : "Target Otomatis"}
            </div>
            <div className="text-3xl font-black text-white">
              {gameMode === "MODE_3_RANDOM" ? mode3Count : totalSelectedRoles}
            </div>
            <div className="text-[11px] text-gray-400">orang</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Game Mode Selector */}
        <div className="bg-gray-900/90 rounded-2xl border border-purple-900/50 p-5 shadow-xl space-y-3">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <span>🎮</span> Pilih Mode Permainan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setGameMode("MODE_1_FIXED")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                gameMode === "MODE_1_FIXED"
                  ? "bg-purple-950 border-purple-500 shadow-lg shadow-purple-950/60"
                  : "bg-gray-800/80 border-gray-700 hover:bg-gray-800"
              }`}
            >
              <div className="font-black text-sm text-white">Mode 1: Fixed</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Komposisi kartu tetap. Jumlah pemain wajib persis sama dengan kartu.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGameMode("MODE_2_POOL")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                gameMode === "MODE_2_POOL"
                  ? "bg-purple-950 border-purple-500 shadow-lg shadow-purple-950/60"
                  : "bg-gray-800/80 border-gray-700 hover:bg-gray-800"
              }`}
            >
              <div className="font-black text-sm text-white">Mode 2: Role Pool</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Tentukan pool kartu. Engine otomatis memilih subset seimbang sesuai pemain yang masuk.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGameMode("MODE_3_RANDOM")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                gameMode === "MODE_3_RANDOM"
                  ? "bg-purple-950 border-purple-500 shadow-lg shadow-purple-950/60"
                  : "bg-gray-800/80 border-gray-700 hover:bg-gray-800"
              }`}
            >
              <div className="font-black text-sm text-white">Mode 3: Full Random</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Open room instan. Engine men-generate komposisi seimbang dari 75 peran database.
              </div>
            </button>
          </div>
        </div>

        {/* Room Info Settings */}
        <div className="bg-gray-900/90 rounded-2xl border border-gray-700/80 p-5 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>⚙️</span> Pengaturan Host & Tema
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">
                Nama Host (Pemilik Room)
              </label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Nama kamu..."
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">
                Tema Narasi AI Moderator (Groq)
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-purple-500 text-sm"
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Composition Balance Indicator */}
        <div className="bg-gray-900/90 rounded-2xl border border-indigo-900/50 p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-800 pb-3">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <span>⚖️</span> Indikator Keseimbangan Komposisi
            </h3>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                balanceMetrics.isBalanced
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-500"
                  : "bg-amber-950 text-amber-300 border border-amber-500"
              }`}
            >
              {balanceMetrics.isBalanced ? "Komposisi Seimbang" : "Perlu Penyesuaian"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
              <div className="text-[11px] text-gray-400">Village Power</div>
              <div className="text-lg font-black text-emerald-400">
                {balanceMetrics.villageScore} pts
              </div>
            </div>
            <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
              <div className="text-[11px] text-gray-400">Wolf Power</div>
              <div className="text-lg font-black text-red-400">
                {balanceMetrics.werewolfScore} pts
              </div>
            </div>
            <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
              <div className="text-[11px] text-gray-400">Neutral Power</div>
              <div className="text-lg font-black text-amber-400">
                {balanceMetrics.neutralScore} pts
              </div>
            </div>
            <div className="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
              <div className="text-[11px] text-gray-400">Balance Weight</div>
              <div className="text-lg font-black text-purple-400 font-mono">
                {balanceMetrics.totalBalanceWeight > 0 ? "+" : ""}
                {balanceMetrics.totalBalanceWeight}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 italic text-center">
            💡 {balanceMetrics.recommendation}
          </p>
        </div>

        {/* Mode 3 Settings: Player Count Slider & Role Preview */}
        {gameMode === "MODE_3_RANDOM" && (
          <div className="bg-gray-900/90 rounded-2xl border border-purple-900/50 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Target Jumlah Pemain</h3>
                <p className="text-xs text-gray-400">
                  Engine akan otomatis membagi dan menyeimbangkan peran untuk jumlah pemain ini.
                </p>
              </div>
              <div className="text-2xl font-black text-purple-300 px-4 py-1 bg-purple-950 rounded-xl border border-purple-600">
                {mode3Count} Pemain
              </div>
            </div>

            <input
              type="range"
              min={5}
              max={25}
              value={mode3Count}
              onChange={(e) => setMode3Count(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />

            <div className="pt-2">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Pratinjau Komposisi Otomatis:
              </div>
              <div className="flex flex-wrap gap-2">
                {expandedSelectedRoles.map((r, i) => (
                  <span
                    key={`${r.role_id}-${i}`}
                    className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200"
                  >
                    {r.canonical_name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mode 1 & 2: Manual Role Selection */}
        {gameMode !== "MODE_3_RANDOM" && (
          <div className="bg-gray-900/90 rounded-2xl border border-gray-700/80 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🎭</span> Pilih Komposisi Peran (75 Role Database)
                </h2>
                <p className="text-xs text-gray-400">
                  {gameMode === "MODE_1_FIXED"
                    ? "Tentukan kartu yang akan dibagikan (jumlah wajib sama persis dengan pemain)."
                    : "Pilih peran kandidat untuk pool (minimal 5 peran)."}
                </p>
              </div>
              <div className="text-xs px-3 py-1 rounded-full bg-purple-900/60 text-purple-300 font-semibold border border-purple-700/60">
                Total: {totalSelectedRoles} Kartu
              </div>
            </div>

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari peran..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                      filterCategory === cat
                        ? "bg-purple-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Roles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pr-1">
              {filteredRoles.map((role) => (
                <RoleCard
                  key={role.role_id}
                  role={role}
                  count={selectedMap[role.role_id] || 0}
                  onIncrement={() => handleIncrement(role.role_id)}
                  onDecrement={() => handleDecrement(role.role_id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Validation Warning */}
        {gameMode !== "MODE_3_RANDOM" && (
          <div className="space-y-1">
            {totalSelectedRoles < MINIMUM_PLAYERS && (
              <p className="text-xs text-red-400 font-medium">
                ⚠️ Minimal {MINIMUM_PLAYERS} kartu pemain dibutuhkan untuk membuat room.
              </p>
            )}
            {!hasWerewolf && (
              <p className="text-xs text-yellow-400 font-medium">
                ⚠️ Room harus memiliki setidaknya 1 peran Werewolf!
              </p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={!canCreate || isSubmitting}
          className={`w-full py-4 rounded-2xl font-black text-base sm:text-lg shadow-xl transition-all flex items-center justify-center gap-2 ${
            canCreate && !isSubmitting
              ? "bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 hover:from-purple-600 hover:to-indigo-500 text-white cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              : "bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          <span>{isSubmitting ? "⏳" : "🚀"}</span>
          <span>
            {isSubmitting
              ? "Membuat Room..."
              : `BUAT ROOM (${gameMode === "MODE_3_RANDOM" ? mode3Count : totalSelectedRoles} PEMAIN)`}
          </span>
        </button>
      </div>
    </div>
  );
}
