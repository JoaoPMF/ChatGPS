import { AttachmentBuilder, type Message } from 'discord.js';
import { CONFIG, env, findMap, MAPS } from './config.js';
import type { BotDb } from './db.js';
import { codeToFlag, leaderboardEmbed, mapListEmbed, xpEmbed } from './embeds.js';
import { SUBDIVISIONS, resolveSubdivision } from './data/subdivisions.js';
import type { SessionManager } from './gameManager.js';
import { logUnknownGuess } from './unknownGuesses.js';

export interface CommandContext {
  sessions: SessionManager;
  db: BotDb;
}

export interface Command {
  handler: (message: Message, args: string, ctx: CommandContext) => Promise<void>;
  admin?: boolean;
}

const switchmapCooldowns = new Map<string, number>();

export function buildCommands(): Map<string, Command> {
  const commands = new Map<string, Command>();

  // !g <country> / !g <c1> or <c2>
  const guess: Command = {
    handler: async (message, args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const input = args.trim();
      if (!input) {
        await message.reply('Usage: `!g <country>` or `!g <country1> or <country2>`');
        return;
      }
      // !g cancel — remove your vote
      if (input.toLowerCase() === 'cancel') {
        const removed = session.cancelVote(message.author.id);
        await (removed
          ? message.react('🗑️').catch(() => {})
          : message.reply('You have no vote to cancel.'));
        return;
      }
      const result = session.registerVote(message.author.id, input);
      if (result.ok) {
        await message.react(codeToFlag(result.code)).catch(() => {});
      } else if (result.reason === 'unknown-country') {
        const status = session.getStatus();
        const kind = status.mode === 'subdivision' ? 'subdivision' : 'country';
        logUnknownGuess({
          attemptedAt: new Date().toISOString(),
          kind,
          input,
          channelId: message.channelId,
          userId: message.author.id,
          mapName: status.mapName,
          countryCode: status.countryCode,
        });
        await message.react('❓').catch(() => {});
        await message.reply(`❓ Unknown ${kind}: *${input}*`).catch(() => {});
      }
      // 'not-open' → silently ignore (no active round / already resolving)
    },
  };
  commands.set('g', guess);
  commands.set('guess', guess);

  // !i <country> — guess instantly, resolving the round without waiting for the timer
  commands.set('i', {
    handler: async (message, args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const input = args.trim();
      if (!input) {
        await message.reply('Usage: `!i <country>`');
        return;
      }
      await message.react('⚡').catch(() => {});
      const result = await session.instantVote(message.author.id, input);
      if (!result.ok && result.reason === 'unknown-country') {
        const status = session.getStatus();
        const kind = status.mode === 'subdivision' ? 'subdivision' : 'country';
        logUnknownGuess({
          attemptedAt: new Date().toISOString(),
          kind,
          input,
          channelId: message.channelId,
          userId: message.author.id,
          mapName: status.mapName,
          countryCode: status.countryCode,
        });
        await message.reply(`❓ Unknown ${kind}: *${input}*`).catch(() => {});
      } else if (!result.ok) {
        await message.react('❌').catch(() => {});
      }
      // success → the round resolves and the result embed is posted via roundResolved
    },
  });

  commands.set('cancel', {
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const removed = session.cancelVote(message.author.id);
      await (removed
        ? message.react('🗑️').catch(() => {})
        : message.reply('You have no vote to cancel.'));
    },
  });

  // !aliases [subdivision] — show valid subdivision aliases for the current country map
  commands.set('aliases', {
    handler: async (message, args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const status = session.getStatus();
      if (status.mode !== 'subdivision' || !status.countryCode) {
        await message.reply('This command is only available on subdivision maps.');
        return;
      }
      const query = args.trim();
      if (query) {
        const subdivision = resolveSubdivision(status.countryCode, query);
        if (!subdivision) {
          await message.reply(`Unknown subdivision: *${query}*`);
          return;
        }
        await message.reply(`**${subdivision.name}**\nAliases: ${subdivision.aliases.join(', ')}`);
        return;
      }
      const subdivisions = SUBDIVISIONS[status.countryCode] ?? [];
      const lines = subdivisions.map((subdivision) => `> **${subdivision.name}** — ${subdivision.aliases.slice(0, 3).join(', ')}`);
      if (lines.length === 0) {
        await message.reply('No subdivision data available.');
        return;
      }

      // Discord limits message content to 2,000 characters.
      const maxContent = 1_800;
      const pages: string[] = [];
      let page = '';
      for (const line of lines) {
        if (page && page.length + line.length + 1 > maxContent) {
          pages.push(page);
          page = '';
        }
        page += `${page ? '\n' : ''}${line}`;
      }
      if (page) pages.push(page);

      for (const [index, content] of pages.entries()) {
        await message.reply(`**Subdivisions — ${status.mapName} (${index + 1}/${pages.length})**\n${content}`);
      }
    },
  });
  commands.set('a', commands.get('aliases')!);

  // !time
  commands.set('time', {
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const result = session.extendTime(message.author.id);
      if (!result.ok) {
        if (result.reason === 'no-active-vote') {
          await message.reply('⏱️ Voting has not started yet — the timer starts on the first guess.');
        } else {
          await message.reply(`⏱️ No more time extensions allowed this round (max ${CONFIG.maxTimeExtensions}).`);
        }
      }
      // success is announced via the timerExtended event
    },
  });
  commands.set('t', commands.get('time')!);

  // !image
  const image: Command = {
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const buffer = await session.getImage();
      if (!buffer) {
        await message.reply('No image available for the current round.');
        return;
      }
      const status = session.getStatus();
      await message.reply({
        content: `📍 Current location — streak: **${status.streak}**`,
        files: [new AttachmentBuilder(buffer, { name: 'round.jpg' })],
      });
    },
  };
  commands.set('image', image);
  commands.set('img', image);
  commands.set('pic', image);

  // !switchmap [map]
  commands.set('switchmap', {
    handler: async (message, args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      if (!args.trim()) {
        await message.reply({ embeds: [mapListEmbed()] });
        return;
      }
      const last = switchmapCooldowns.get(message.channelId) ?? 0;
      const elapsed = Date.now() - last;
      if (elapsed < CONFIG.switchmapCooldownMs) {
        const remaining = Math.ceil((CONFIG.switchmapCooldownMs - elapsed) / 1000);
        await message.reply(`⏱️ You can't switch maps for another **${remaining} seconds**.`);
        return;
      }
      // !switchmap random — pick a random registered map
      let map = findMap(args);
      if (!map && args.trim().toLowerCase() === 'random') {
        const others = MAPS.filter((m) => m.id !== session.mapId);
        map = others[Math.floor(Math.random() * others.length)];
      }
      if (!map) {
        await message.reply('Unknown map. Use `!switchmap` to see the list, or provide a GeoGuessr map ID.');
        return;
      }
      await message.reply(`🗺️ Switching to **${map.name}**... (current streak ends)`);
      try {
        await session.switchMap(map);
        // Only apply the cooldown after a successful switch.
        switchmapCooldowns.set(message.channelId, Date.now());
      } catch {
        // switchMap already falls back + reports; nothing more to do here.
      }
    },
  });

  // !xp
  commands.set('xp', {
    handler: async (message, _args, ctx) => {
      const user = ctx.db.getUser(message.author.id);
      await message.reply({ embeds: [xpEmbed(message.author.id, user)] });
    },
  });

  // !topxp / !xplb — server leaderboard of XP balances
  const topXp: Command = {
    handler: async (message, _args, ctx) => {
      const rows = ctx.db.topXp(10);
      if (rows.length === 0) {
        await message.reply('No XP recorded yet.');
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((row, index) =>
        `> ${medals[index] ?? `**${index + 1}.**`} <@${row.userId}> — **${row.xp} XP**`,
      );
      await message.reply(`**⭐ XP Leaderboard**\n${lines.join('\n')}`);
    },
  };
  commands.set('topxp', topXp);
  commands.set('xplb', topXp);

  // !map / !cg — ChatGuessr map link
  const mapLink: Command = {
    handler: async (message) => {
      await message.reply(
        '🗺️ **ChatGuessr map**\n' + env.chatguessrMapUrl +
          '\n\nUse `/w <latitude>, <longitude>` to submit your guess.',
      );
    },
  };
  commands.set('map', mapLink);
  commands.set('cg', mapLink);

  // ---------- stats / records ----------

  // !streak / !score
  const streak: Command = {
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const status = session.getStatus();
      await message.reply(`🔥 **${status.mapName}** — current streak: **${status.streak}**`);
    },
  };
  commands.set('streak', streak);
  commands.set('score', streak);

  // !votes / !v — current guesses this round
  const votes: Command = {
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const current = session.currentVotes();
      if (current.length === 0) {
        await message.reply('No votes yet this round.');
        return;
      }
      const lines = current.map((v) =>
        `> ${codeToFlag(v.code)} <@${v.userId}> — ${v.name}${v.subdivisionName ? `, ${v.subdivisionName}` : ''}`,
      );
      await message.reply(`**Votes this round**\n${lines.join('\n')}`);
    },
  };
  commands.set('votes', votes);
  commands.set('v', votes);

  // !pb [map] — personal records
  commands.set('pb', {
    handler: async (message, args, ctx) => {
      const bests = ctx.db.personalBests(message.author.id);
      if (bests.length === 0) {
        await message.reply('No records yet. Go play!');
        return;
      }
      const mapArg = args.trim() ? findMap(args) : null;
      const filtered = mapArg ? bests.filter((b) => b.mapName === mapArg.name) : bests;
      const lines = filtered.map((b) => `> **${b.best}** — ${b.mapName ?? 'Unknown'}`);
      await message.reply(`**📈 Personal records**\n${lines.join('\n') || 'No records for that map.'}`);
    },
  });

  // !acc [map] — accuracy per map
  commands.set('acc', {
    handler: async (message, args, ctx) => {
      const rows = ctx.db.accuracyByMap(message.author.id);
      if (rows.length === 0) {
        await message.reply('No guesses recorded yet.');
        return;
      }
      const mapArg = args.trim() ? findMap(args) : null;
      const filtered = mapArg ? rows.filter((r) => r.mapName === mapArg.name) : rows;
      const lines = filtered.map((r) => `> ${r.mapName ?? 'Unknown'} — **${r.acc}%** (${r.correct}/${r.total})`);
      await message.reply(`**🎯 Accuracy**\n${lines.join('\n') || 'No data for that map.'}`);
    },
  });

  // !top [map] [me] — top streaks leaderboard
  const top: Command = {
    handler: async (message, args, ctx) => {
      const parts = args.toLowerCase().split(/\s+/).filter(Boolean);
      const me = parts.includes('me');
      const mapArg = findMap(parts.filter((p) => p !== 'me').join(' '));
      const rows = ctx.db.topStreaks(10, mapArg?.id, me ? message.author.id : undefined);
      await message.reply({ embeds: [leaderboardEmbed(rows)] });
    },
  };
  commands.set('top', top);
  commands.set('record', top);
  // !toprounds / !rounds — most rounds played
  const toprounds: Command = {
    handler: async (message, _args, ctx) => {
      const rows = ctx.db.topRounds(10);
      if (rows.length === 0) {
        await message.reply('No rounds played yet.');
        return;
      }
      const lines = rows.map((r, i) => `> **${i + 1}.** <@${r.userId}> — ${r.rounds} rounds`);
      await message.reply(`**🔁 Most rounds played**\n${lines.join('\n')}`);
    },
  };
  commands.set('toprounds', toprounds);
  commands.set('rounds', toprounds);

  // !top5k / !5k — server leaderboard of perfect hedge guesses
  const top5k: Command = {
    handler: async (message, _args, ctx) => {
      const rows = ctx.db.topFiveKs(10);
      if (rows.length === 0) {
        await message.reply('No 5K guesses recorded yet.');
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((row, index) =>
        `> ${medals[index] ?? `**${index + 1}.**`} <@${row.userId}> — **${row.fiveKs}** 5K${row.fiveKs === 1 ? '' : 's'}`,
      );
      await message.reply(`**🎯 5K Leaderboard**\n*Within ${CONFIG.fiveKDistanceMeters}m of the location*\n${lines.join('\n')}`);
    },
  };
  commands.set('top5k', top5k);
  commands.set('5k', top5k);

  // ---------- admin commands ----------

  // !end / !reset — end the current streak and start fresh
  const end: Command = {
    admin: true,
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      session.setStreak(0);
      await session.startNewGame();
    },
  };
  commands.set('end', end);
  commands.set('reset', end);
  commands.set('start', end);

  commands.set('skip', {
    admin: true,
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      await session.skip();
    },
  });

  commands.set('fix', {
    admin: true,
    handler: async (message, _args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      await session.fix();
    },
  });

  commands.set('setstreak', {
    admin: true,
    handler: async (message, args, ctx) => {
      const session = ctx.sessions.get(message.channelId);
      if (!session) return;
      const n = Number.parseInt(args.trim(), 10);
      if (!Number.isFinite(n) || n < 0) {
        await message.reply('Usage: `!setstreak <number>`');
        return;
      }
      session.setStreak(n);
      await message.reply(`Streak set to **${n}**.`);
    },
  });

  // !help
  const help: Command = {
    handler: async (message) => {
      await message.reply(
        [
          '**🌍 GeoGuessr Country Streaks — Comandos**',
          '',
          '**Jogo**',
          '`!g <país>` — Vota num país (podes mudar enquanto o timer não acabar)',
          '`!g <país>, <subdivisão>` — País + subdivisão; subdivisão correta duplica o XP',
          'Em mapas de país: `!g <subdivisão>` — Vota numa subdivisão',
          '`!g <c1> or <c2>` — O bot escolhe aleatoriamente um dos países',
          '`!g cancel` — Cancela o teu voto',
          '`!image` / `!pic` — Mostra a localização atual  ·  `!!pic` — Reconstrói a imagem',
          '`!time` — Estende a votação em 20s (máx. 3×)',
          '`!votes` — Mostra os votos atuais',
          '`!streak` — Mostra a streak atual',
          '`!aliases [subdivisão]` — Subdivisões e aliases válidos do mapa atual',
          '`!map` — Link para o mapa ChatGuessr',
          '',
          '**Records & stats**',
          '`!pb [mapa]` — Os teus records por mapa',
          '`!acc [mapa]` — A tua precisão por mapa',
          '`!top [mapa] [me]` — Top streaks do servidor',
          '`!toprounds` — Quem jogou mais rondas',
          '`!top5k` / `!5k` — Ranking de guesses hedge a 5K',
          '',
          '**Mapas & conta**',
          '`!switchmap [mapa|random]` — Lista ou muda de mapa',
          '`!xp` — O teu saldo de XP',
          '`!topxp` / `!xplb` — Ranking de XP do servidor',
          '',
          '**Admin**',
          '`!end` / `!skip` / `!fix` / `!setstreak <n>`',
          '',
          '*A votação começa no primeiro `!g` e dura 10s. Ganha o país com mais votos; empate vai para o primeiro votado.*',
        ].join('\n'),
      );
    },
  };
  commands.set('help', help);
  commands.set('info', help);
  commands.set('howto', help);
  commands.set('rules', help);
  commands.set('commands', help);

  return commands;
}
