"use client";
import { useGameStore } from "@/store/gameStore";
import GameSetupScreen from "@/components/setup/GameSetupScreen";
import PlayerNameInput from "@/components/setup/PlayerNameInput";
import NightDashboard from "@/components/game/NightDashboard";
import DayDashboard from "@/components/game/DayDashboard";
import GameOverScreen from "@/components/game/GameOverScreen";

export default function Home() {
  const phase = useGameStore((s) => s.phase);

  switch (phase) {
    case "SETUP":
      return <GameSetupScreen />;
    case "NAME_INPUT":
      return <PlayerNameInput />;
    case "NIGHT":
      return <NightDashboard />;
    case "DAY":
      return <DayDashboard />;
    case "GAME_OVER":
      return <GameOverScreen />;
    default:
      return <GameSetupScreen />;
  }
}