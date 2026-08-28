import { EmbedBuilder } from 'discord.js';
import { CONFIG, MAPS } from './config.js';
import type { RoundResolvedInfo, RoundStartedInfo } from './gameManager.js';
import type { TopStreakRow, UserRow } from './db.js';

/** Convert an ISO alpha-2 code to a regional-indicator flag emoji. */
export function codeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function roundEmbed(info: RoundStartedInfo): EmbedBuilder {
  const answerType = info.mode === 'subdivision' ? 'subdivision' : 'country';
  return new EmbedBuilder()
    .setTitle(`🌍 ${info.mapName}`)
    .setDescription(
      `### Round ${info.roundNumber}\n` +
        `**Streak:** \`${info.streak}\`\n\n` +
        `**Vote** for the ${answerType}\n` +
        `> \`!g <country>\`\n` +
        `> \`!g <c1> or <c2>\` — random pick\n\n` +
        `⏱️ \`!time\` — extend  ·  🖼️ \`!image\` — re-show`,
    )
    .setColor(0x3498db)
    .setImage('attachment://round.jpg');
}

export function resultEmbed(info: RoundResolvedInfo): EmbedBuilder {
  const embed = new EmbedBuilder();
  const flag = codeToFlag(info.actualCountryCode ?? info.actualCode);
  const answer = info.mode === 'subdivision'
    ? `${flag} **${info.actualCountryName ?? 'Unknown country'}** · **${info.actualName ?? 'Unknown subdivision'}**`
    : `${flag} **${info.actualName ?? 'Unknown'}**`;

  if (info.skipped) {
    embed.setTitle('⏭️ Round skipped').setColor(0x95a5a6);
    embed.setDescription(`The answer was ${answer}.`);
    if (info.mapsLink) embed.setURL(info.mapsLink);
    return embed;
  }

  embed
    .setTitle(info.isCorrect ? `✅ ${answer}` : `❌ ${answer}`)
    .setColor(info.isCorrect ? 0x2ecc71 : 0xe74c3c);

  // Location line
  const lines: string[] = [];
  if (info.mode === 'subdivision') {
    if (info.actualCountryName) lines.push(`🌍 **Country:** ${info.actualCountryName}`);
    lines.push(`📍 **Subdivision:** ${info.actualName ?? 'Unknown'}`);
  } else if (info.actualSubdivision) {
    lines.push(`📍 *Subdivision: ${info.actualSubdivision}*`);
  }

  // Outcome line
  if (info.isCorrect) {
    lines.push(`Correct — the streak is now **${info.streak}**.`);
  } else {
    lines.push(`The vote was **${info.winningName}**.`);
    if (info.endedStreak > 0) lines.push(`💔 Streak ended at **${info.endedStreak}**.`);
  }
  if (info.hedgeDistanceMeters !== undefined) {
    const distance = info.hedgeDistanceMeters < 1000
      ? `${Math.round(info.hedgeDistanceMeters)} m`
      : `${(info.hedgeDistanceMeters / 1000).toFixed(1)} km`;
    lines.push(`📍 \`/w\` distance: **${distance}**${info.hedgeDistanceMeters <= 185 ? ' · 🎯 **5K**' : ''}`);
  }

  // Votes
  if (info.tally.length > 0) {
    lines.push('');
    lines.push('**Votes**');
    for (const t of info.tally) {
      const prefix = info.mode === 'country' ? `${codeToFlag(t.code)} ` : '📍 ';
      lines.push(`> ${prefix}${t.name} — \`${t.count}\``);
    }
  }

  // Milestone
  if (info.milestone) {
    lines.push('');
    lines.push(`🏅 **Milestone!** Streak **${info.streak}** — everyone earned +${CONFIG.xp.milestone} XP!`);
  }

  // XP awards
  if (info.awards.size > 0) {
    const awardText = [...info.awards].map(([userId, xp]) => `<@${userId}> \`+${xp}\``).join('  ');
    lines.push('');
    lines.push(awardText);
  }

  embed.setDescription(lines.join('\n'));
  if (info.mapsLink) embed.setURL(info.mapsLink);
  return embed;
}

export function hedgeGuessEmbed(info: {
  isFiveK: boolean;
  distance: string;
  actualCountryCode: string | null;
  actualCountryName: string | null;
  actualSubdivision: string | null;
}): EmbedBuilder {
  const country = `${codeToFlag(info.actualCountryCode)} **${info.actualCountryName ?? 'Unknown'}**`;
  const lines = [
    info.actualSubdivision ? `📍 **Subdivision:** ${info.actualSubdivision}` : '',
    info.isFiveK
      ? `🎯 **5K!** Your guess was **${info.distance}** away.`
      : `Your guess was **${info.distance}** away.`,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle(`${info.isFiveK ? '🎯' : '📍'} ${country}`)
    .setDescription(lines.join('\n'))
    .setColor(info.isFiveK ? 0xf1c40f : 0x3498db);
}

export function leaderboardEmbed(rows: TopStreakRow[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('🏆 Highest Streaks').setColor(0xf1c40f);
  if (rows.length === 0) {
    embed.setDescription('No streaks recorded yet. Go play!');
    return embed;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((row, i) => {
    const rank = medals[i] ?? `**${i + 1}.**`;
    const users = row.users ? row.users.split(',').map((u) => `<@${u}>`).join(', ') : '—';
    const date = new Date(row.startTs).toISOString().slice(0, 10);
    const active = row.endTs === null ? ' *(ongoing)*' : '';
    return `${rank} **${row.number}**${active} — ${users}\n*${row.mapName ?? 'Unknown map'} · ${date}*`;
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

export function xpEmbed(userId: string, user: UserRow): EmbedBuilder {
  const accuracy =
    user.totalVotes > 0 ? Math.round((user.correctVotes / user.totalVotes) * 100) : 0;
  return new EmbedBuilder()
    .setTitle('⭐ XP Balance')
    .setColor(0x9b59b6)
    .setDescription(
      `<@${userId}> has **${user.xp} XP**\n\n` +
        `Votes cast: **${user.totalVotes}**\n` +
        `In winning answers: **${user.correctVotes}** (${accuracy}%)`,
    );
}

export function mapListEmbed(): EmbedBuilder {
  const lines = MAPS.map((m) => `• **${m.name}** — \`!switchmap ${m.aliases[0] ?? m.name}\``);
  return new EmbedBuilder()
    .setTitle('🗺️ Available Maps')
    .setDescription(lines.join('\n') + '\n\nYou can also use any GeoGuessr map ID.')
    .setColor(0x3498db);
}
