"use client";
import { Suspense, useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import Navbar from "@/components/layout/Navbar";
import HomeScreen from "@/components/home/HomeScreen";
import CreateRoomScreen from "@/components/setup/CreateRoomScreen";
import JoinRoomScreen from "@/components/setup/JoinRoomScreen";
import LobbyScreen from "@/components/lobby/LobbyScreen";
import RoleCardReveal from "@/components/game/RoleCardReveal";
import MultiplayerNight from "@/components/game/MultiplayerNight";
import MultiplayerDay from "@/components/game/MultiplayerDay";
import MultiplayerGameOver from "@/components/game/MultiplayerGameOver";

function GameRouter() {
  const { phase, setPhase } = useGameStore();

  // Auto-detect ?room=... from URL on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam && phase === "HOME") {
        setPhase("JOIN_ROOM");
      }
    }
  }, [phase, setPhase]);

  const renderContent = () => {
    switch (phase) {
      case "HOME":
        return <HomeScreen />;
      case "CREATE_ROOM":
        return <CreateRoomScreen />;
      case "JOIN_ROOM":
        return <JoinRoomScreen />;
      case "LOBBY":
        return <LobbyScreen />;
      case "CARD_REVEAL":
        return <RoleCardReveal />;
      case "NIGHT":
        return <MultiplayerNight />;
      case "DAY_NARRATIVE":
      case "DAY_VOTING":
        return <MultiplayerDay />;
      case "GAME_OVER":
        return <MultiplayerGameOver />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">{renderContent()}</main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Memuat ASPIRE: WEREWOLF...</div>}>
      <GameRouter />
    </Suspense>
  );
}