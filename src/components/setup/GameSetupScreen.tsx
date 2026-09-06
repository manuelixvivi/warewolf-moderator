"use client";
import { useState, useMemo } from "react";
import { useGameStore } from "@/store/gameStore";
import { RoleData, SelectedRole } from "@/types/game";
import RoleCard from "@/components/ui/RoleCard";
import rolesJson from "@/data/roles.json";

const ALL_ROLES: RoleData[] = rolesJson as RoleData[];

const THEMES = ["Dark Fantasy", "Horror Gothic", "Medieval", "Modern", "Cosmic Horror", "Custom"];
const STYLES = ["Dramatic", "Atmospheric", "Brief", "Comic", "Mysterious"];
const CATEGORIES = ["Semua", "Village", "Werewolf", "Neutral", "Independent", "Special"];

export default function GameSetupScreen() {
  const { config, setConfig, initPlayers } = useGameStore();
  const [selectedMap, setSelectedMap] = useState<Record<string, number>>({});
  const [filterCategory, setFilterCategory] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  const totalPlayers = Object.values(selectedMap).reduce((a, b) => a + b, 0);

  const filteredRoles = useMemo(() => {
    return ALL_ROLES.filter((r) => {
      // Filter out non-playable roles, artifacts, and utilities
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

  const handleContinue = () => {
    const selectedRoles: SelectedRole[] = Object.entries(selectedMap)
      .filter(([, count]) => count > 0)
      .map(([role_id, count]) => {
        const roleData = ALL_ROLES.find((r) => r.role_id === role_id)!;
        return { role_id, canonical_name: roleData.canonical_name, count };
      });

    setConfig({ selectedRoles });
    initPlayers([]); // triggers NAME_INPUT phase
  };

  const canContinue =
    config.gameName.trim().length > 0 &&
    totalPlayers >= 3 &&
    Object.keys(selectedMap).some((id) => {
      const role = ALL_ROLES.find((r) => r.role_id === id);
      return role && (role.team === "Werewolf" || role.category === "Werewolf");
    });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-950 to-gray-950 border-b border-purple-900/50 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-purple-300 mb-1">🐺 Werewolf Moderator</h1>
          <p className="text-gray-400 text-sm">Alat bantu moderator permainan Werewolf</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Game Config */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
          <h2 className="text-lg font-bold text-white mb-4">⚙️ Pengaturan Permainan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm text-gray-400 mb-1">Nama Permainan</label>
              <input
                type="text"
                value={config.gameName}
                onChange={(e) => setConfig({ gameName: e.target.value })}
                placeholder="The Curse of Blackwood"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tema Cerita</label>
              <select
                value={config.storyTheme}
                onChange={(e) => setConfig({ storyTheme: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gaya Narasi</label>
              <select
                value={config.narrationStyle}
                onChange={(e) => setConfig({ narrationStyle: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Role Selection */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">🎭 Pilih Role</h2>
            <div
              className={`text-sm font-semibold px-3 py-1 rounded-full ${
                totalPlayers >= 3 ? "bg-purple-900 text-purple-300" : "bg-gray-800 text-gray-400"
              }`}
            >
              {totalPlayers} Pemain
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari role..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterCategory === cat
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Role Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

        {/* Selected Summary */}
        {totalPlayers > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
            <h2 className="text-lg font-bold text-white mb-3">📋 Ringkasan Role Dipilih</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(selectedMap)
                .filter(([, count]) => count > 0)
                .map(([role_id, count]) => {
                  const role = ALL_ROLES.find((r) => r.role_id === role_id);
                  return (
                    <div
                      key={role_id}
                      className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"
                    >
                      <span className="text-white font-medium text-sm">{role?.canonical_name}</span>
                      <span className="bg-purple-700 text-purple-200 text-xs rounded-full px-2 py-0.5 font-bold">
                        ×{count}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-end">
          {!canContinue && totalPlayers > 0 && (
            <p className="text-yellow-400 text-sm mr-4 self-center">
              {!config.gameName.trim() ? "⚠ Masukkan nama permainan." : "⚠ Butuh minimal 1 Werewolf & 3 pemain."}
            </p>
          )}
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-lg shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50"
          >
            LANJUTKAN →
          </button>
        </div>
      </div>
    </div>
  );
}