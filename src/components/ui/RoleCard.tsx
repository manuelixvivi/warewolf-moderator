"use client";
import { RoleData } from "@/types/game";
import Tooltip from "./Tooltip";

interface RoleCardProps {
  role: RoleData;
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

const teamColors: Record<string, string> = {
  Village: "bg-green-800 text-green-200 border-green-600",
  Werewolf: "bg-red-900 text-red-200 border-red-700",
  "Werewolf-aligned": "bg-red-900 text-red-200 border-red-700",
  "Solo Werewolf": "bg-red-900 text-red-200 border-red-700",
  Neutral: "bg-yellow-800 text-yellow-200 border-yellow-600",
  "Dynamic Neutral": "bg-yellow-800 text-yellow-200 border-yellow-600",
  Independent: "bg-blue-800 text-blue-200 border-blue-600",
  Special: "bg-purple-800 text-purple-200 border-purple-600",
};

const teamEmoji: Record<string, string> = {
  Village: "🏘️",
  Werewolf: "🐺",
  "Werewolf-aligned": "🐺",
  "Solo Werewolf": "🐺",
  Neutral: "⚖️",
  "Dynamic Neutral": "⚖️",
  Independent: "🔮",
  Special: "✨",
};

function getTeamClass(team: string): string {
  return teamColors[team] || "bg-gray-700 text-gray-200 border-gray-600";
}

function getTeamEmoji(team: string): string {
  return teamEmoji[team] || "❓";
}

export default function RoleCard({ role, count, onIncrement, onDecrement, disabled }: RoleCardProps) {
  const isSelected = count > 0;
  const tooltipText = role.tooltip_en || role.description_en || "No description available.";

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? "border-purple-500 bg-gray-800 shadow-lg shadow-purple-900/30"
          : "border-gray-700 bg-gray-900 hover:border-gray-600"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{getTeamEmoji(role.team)}</span>
            <h3 className="font-bold text-white text-sm leading-tight truncate">
              {role.canonical_name}
            </h3>
          </div>
          <div className="flex gap-1 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getTeamClass(role.team)}`}
            >
              {role.team}
            </span>
            {role.category !== role.team && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600">
                {role.category}
              </span>
            )}
          </div>
        </div>

        {/* Tooltip Button */}
        <Tooltip
          roleName={role.canonical_name}
          contentId={role.description_id || role.tooltip_id}
          contentEn={role.tooltip_en || role.description_en}
        >
          <button
            type="button"
            className="ml-2 w-7 h-7 rounded-full bg-gray-800 hover:bg-purple-700 text-gray-300 hover:text-white border border-gray-600 hover:border-purple-500 text-xs font-bold flex items-center justify-center transition-all flex-shrink-0 shadow-sm"
          >
            ?
          </button>
        </Tooltip>
      </div>

      {/* Role info */}
      <div className="text-xs text-gray-400 mb-3 space-y-0.5">
        {role.active_phase && (
          <div>
            <span className="text-gray-500">Fase:</span>{" "}
            <span className="text-gray-300">{role.active_phase}</span>
          </div>
        )}
        {role.action_type && (
          <div>
            <span className="text-gray-500">Aksi:</span>{" "}
            <span className="text-gray-300">{role.action_type}</span>
          </div>
        )}
        {role.seer_result && (
          <div>
            <span className="text-gray-500">Seer:</span>{" "}
            <span className={role.seer_result === "Werewolf" ? "text-red-400" : "text-green-400"}>
              {role.seer_result}
            </span>
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onDecrement}
            disabled={count === 0 || disabled}
            className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-lg flex items-center justify-center transition-colors"
          >
            −
          </button>
          <span
            className={`font-bold text-xl w-8 text-center tabular-nums ${
              count > 0 ? "text-purple-400" : "text-gray-500"
            }`}
          >
            {count}
          </span>
          <button
            onClick={onIncrement}
            disabled={disabled}
            className="w-7 h-7 rounded-full bg-purple-700 hover:bg-purple-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-lg flex items-center justify-center transition-colors"
          >
            +
          </button>
        </div>
        {count > 0 && (
          <div className="text-xs text-purple-400 font-medium">✓ Dipilih</div>
        )}
      </div>
    </div>
  );
}