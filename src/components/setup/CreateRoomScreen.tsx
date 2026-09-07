"use client";
import { useState, useMemo } from "react";
import { useGameStore } from "@/store/gameStore";
import { RoleData, SelectedRole } from "@/types/game";
import RoleCard from "@/components/ui/RoleCard";
import rolesJson from "@/data/roles.json";

const ALL_ROLES: RoleData[] = rolesJson as RoleData[];
const THEMES = ["Dark Fantasy", "Horror Gothic", "Desa Terpencil", "Hutan Terkutuk", "Medieval", "Misteri Modern"];
const CATEGORIES = ["Semua", "Village", "Werewolf", "Neutral", "Independent", "Special"];

export default function CreateRoomScreen() {
  const { createRoom, setPhase, myPlayerName } = useGameStore();
  const [hostName, setHostName] = useState(myPlayerName || "");
  const [theme, setTheme] = useState("Dark Fantasy");
  const [selectedMap, setSelectedMap] = useState<Record<string, number>>({
    "ROLE-023": 2, // 2 Werewolves by default
    "ROLE-022": 1, // 1 Seer
    "ROLE-028": 1, // 1 Bodyguard
    "ROLE-024": 4, // 4 Villagers (Total 8 players)
  });
  const [filterCategory, setFilterCategory] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalPlayers = Object.values(selectedMap).reduce((a, b) => a + b, 0);

  const filteredRoles = useMemo(() => {
    return ALL_ROLES.filter((r) => {
      if (r.entity_type === "Artifact" || r.entity_type === "Utility") return false;
      if (r.canonical_name === "Moderator" || r.canonical_name === "Blank Cards" || r.canonical_name.toLowerCase().includes("amulet")) {
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

  const canCreate = hostName.trim().length > 0 && totalPlayers >= 3 && hasWerewolf;

  const handleCreateRoom = async () => {
    if (!canCreate || isSubmitting) return;
    setIsSubmitting(true);

    const selectedRoles: SelectedRole[] = Object.entries(selectedMap)
      .filter(([, count]) => count > 0)
      .map(([role_id, count]) => {
        const roleData = ALL_ROLES.find((r) => r.role_id === role_id)!;
        return { role_id, canonical_name: roleData.canonical_name, count };
      });

    try {
      await createRoom(hostName.trim(), selectedRoles, theme);
    } catch (err) {
      console.error(err);
      alert("Gagal membuat room. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-950 to-gray-950 border-b border-purple-900/50 px-4 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => setPhase("HOME")}
              className="text-xs text-gray-400 hover:text-white transition-colors mb-2 flex items-center gap-1"
            >
              ← Kembali ke Menu
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-purple-200 flex items-center gap-2">
              <span>👑</span> Buat Room Baru
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm">
              Tentukan komposisi peran & jumlah pemain. Pemilik room dapat memulai saat room full.
            </p>
          </div>

          {/* Player Count Badge */}
          <div className="text-right">
            <div className="text-xs text-purple-400 font-bold uppercase tracking-wider">Target Pemain</div>
            <div className="text-3xl font-black text-white">{totalPlayers}</div>
            <div className="text-[11px] text-gray-400">orang</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Room Info Settings */}
        <div className="bg-gray-900/90 rounded-2xl border border-gray-700/80 p-5 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>⚙️</span> Pengaturan Room
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
                Tema Cerita AI Moderator
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-purple-500 text-sm"
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Role Selection */}
        <div className="bg-gray-900/90 rounded-2xl border border-gray-700/80 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🎭</span> Pilih Komposisi Peran
              </h2>
              <p className="text-xs text-gray-400">
                Atur berapa jumlah kartu untuk setiap peran yang akan diacak ke pemain.
              </p>
            </div>
            <div className="text-xs px-3 py-1 rounded-full bg-purple-900/60 text-purple-300 font-semibold border border-purple-700/60">
              Total: {totalPlayers} Pemain
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
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    filterCategory === cat
                      ? "bg-purple-600 text-white shadow-md shadow-purple-900/60"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Roles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
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

        {/* Selected Roles Summary */}
        {totalPlayers > 0 && (
          <div className="bg-gray-900/90 rounded-2xl border border-gray-700/80 p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-2">📋 Ringkasan Peran yang Dimainkan ({totalPlayers} Pemain)</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(selectedMap)
                .filter(([, count]) => count > 0)
                .map(([role_id, count]) => {
                  const role = ALL_ROLES.find((r) => r.role_id === role_id);
                  return (
                    <div
                      key={role_id}
                      className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs"
                    >
                      <span className="text-white font-medium">{role?.canonical_name}</span>
                      <span className="bg-purple-600 text-white text-[11px] rounded-full px-1.5 py-0.2 font-bold">
                        ×{count}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-800">
          <div className="text-xs text-yellow-400">
            {!hasWerewolf && "⚠ Harus ada minimal 1 Werewolf dalam permainan."}
            {totalPlayers < 3 && " ⚠ Minimal butuh 3 pemain."}
            {!hostName.trim() && " ⚠ Masukkan nama host."}
          </div>
          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={!canCreate || isSubmitting}
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base shadow-xl shadow-purple-950 transition-all flex items-center justify-center gap-2"
          >
            <span>{isSubmitting ? "⏳ Menyiapkan Room..." : "👑 Buat Room & Buka Lobby →"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
