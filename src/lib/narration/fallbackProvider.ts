// ============================================================
// ASPIRE: WEREWOLF - Deterministic Fallback Narrator
// "One Village. Many Lies. One Wolf."
// ============================================================

import { NarrationContext } from "./types";

export function generateFallbackNarrative(context: NarrationContext): string {
  const { phase, dayCount, nightCount, facts } = context;

  // 1. Morning Phase
  if (phase === "MORNING") {
    if (facts.killedPlayerNames.length === 0 && facts.savedPlayerNames.length > 0) {
      const saved = facts.savedPlayerNames.join(", ");
      return `Matahari pagi menembus kabut dingin di Hari ke-${dayCount}. Tadi malam, cakar kegelapan hampir merenggut nyawa ${saved}, namun berkah perlindungan berhasil menyelamatkannya! Tidak ada korban jiwa pagi ini.`;
    }

    if (facts.killedPlayerNames.length === 0) {
      return `Fajar menyingsing di Hari ke-${dayCount}. Angin pagi berhembus tenang di atas desa Aspire. Seluruh warga keluar dari rumah masing-masing dengan selamat tanpa ada pertumpahan darah tadi malam.`;
    }

    if (facts.killedPlayerNames.length === 1) {
      const victim = facts.killedPlayerNames[0];
      return `Lonceng desa berdentang memilukan menyambut fajar Hari ke-${dayCount}. Jeritan histeris memecah keheningan saat jasad ${victim} ditemukan terbujur kaku dengan luka koyakan serigala di alun-alun desa!`;
    }

    const victims = facts.killedPlayerNames.join(" dan ");
    return `Malam penuh horor telah berlalu. Fajar Hari ke-${dayCount} menjadi saksi bisu pembantaian mengerikan. Jasad ${victims} ditemukan tak bernyawa bersimbah darah. Kegelapan semakin mendekati desa!`;
  }

  // 2. Vote Result Phase
  if (phase === "VOTE_RESULT") {
    if (facts.isTieVote) {
      return `Perdebatan sengit di balai desa berakhir dengan kebuntuan! Perolehan suara berimbang, dan para warga tidak mencapai kesepakatan bulat. Tidak ada seorang pun yang dieksekusi hari ini.`;
    }

    if (facts.princeSurvived) {
      return `Tali gantungan telah melingkar di leher Sang Pangeran, namun segel darah bangsawan memancarkan cahaya pusaka! Warga terperangah menyadari garis keturunan mulianya. Sang Pangeran selamat dari hukuman gantung!`;
    }

    if (facts.tannerWon && facts.eliminatedPlayerName) {
      return `Warga bersorak saat ${facts.eliminatedPlayerName} digantung di tiang gantungan. Namun senyuman kepuasan tersungging di bibirnya sebelum ia menghembuskan nafas terakhir! Tanner telah berhasil memenuhi ambisi kematiannya.`;
    }

    if (facts.eliminatedPlayerName) {
      return `Keputusan mutlak telah dijatuhkan oleh pengadilan rakyat! Dengan suara terbanyak, ${facts.eliminatedPlayerName} diseret ke tiang gantungan dan dieksekusi di hadapan seluruh warga desa yang menatap dengan penuh curiga.`;
    }

    return `Matahari terbenam dan voting telah berakhir tanpa ada yang dieksekusi. Ketakutan kembali menyelimuti desa menjelang malam.`;
  }

  // 3. Game Over Phase
  if (phase === "GAME_OVER") {
    if (facts.winnerTeam === "Werewolf") {
      return `Desa Aspire telah runtuh ke dalam kegelapan abadi! Para Werewolf berhasil menguasai desa setelah memangsa sebagian besar penduduk. Lolongan kemenangan serigala menggema di bawah purnama darah.`;
    }

    if (facts.winnerTeam === "Village") {
      return `Cahaya kedamaian kembali menerangi Aspire! Serigala terakhir telah berhasil dieliminasi. Warga desa yang tersisa menangis haru merayakan kemenangan atas teror malam yang panjang.`;
    }

    if (facts.winnerTeam === "Tanner") {
      return `Permainan berakhir dengan kemenangan mengejutkan! Tanner berhasil mengelabui seluruh warga dan tertawa di atas tiang eksekusi.`;
    }

    if (facts.winnerTeam === "Cult Leader") {
      return `Lilin-lilin mistis menyala di seluruh penjuru desa. Sang Cult Leader tersenyum saat seluruh penduduk yang tersisa kini berlutut mengucap sumpah setia kepada sektenya!`;
    }

    return facts.winReason || "Permainan telah berakhir.";
  }

  return "Waktu bergulir di desa Aspire. Rahasia dan dusta terus berputar.";
}
