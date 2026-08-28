import { AttachmentBuilder, Client, GatewayIntentBits, PermissionFlagsBits, type SendableChannels } from 'discord.js';
import { buildCommands } from './commands.js';
import { CONFIG, DEFAULT_MAP, env, requireEnv } from './config.js';
import { BotDb } from './db.js';
import { resultEmbed, roundEmbed } from './embeds.js';
import { Geocoder } from './geocode.js';
import { GeoGuessrClient } from './geoguessr.js';
import { SessionManager, type SessionEvents } from './gameManager.js';
import { isUsablePanoId } from './geoguessr.js';
import { fetchPanorama, resolvePanoId } from './pano.js';
import { BASE_FOV, renderRoundView } from './projection.js';

function makeChannelEvents(channel: SendableChannels): SessionEvents {
  return {
    roundStarted: async (info) => {
      if (info.image) {
        await channel.send({
          embeds: [roundEmbed(info)],
          files: [new AttachmentBuilder(info.image, { name: 'round.jpg' })],
        });
      } else {
        await channel.send({ embeds: [roundEmbed(info)] });
      }
    },
    voteAccepted: async (info) => {
      if (info.firstVote && info.deadline !== null) {
        const seconds = Math.round((info.deadline - Date.now()) / 1000);
        await channel.send(
          `🗳️ <@${info.userId}> voted **${info.countryName}** — ⏱️ **${seconds} seconds** remaining!`,
        );
        return;
      }
      if (info.options) {
        await channel.send(
          `🎲 <@${info.userId}> let fate decide: **${info.countryName}** (from ${info.options.join(' / ')})`,
        );
        return;
      }
      if (info.changed) {
        await channel.send(`🔄 <@${info.userId}> changed their vote to **${info.countryName}**`);
      }
    },
    timerExtended: async (info) => {
      await channel.send(
        `⏱️ <@${info.userId}> extended the voting time! **${Math.round(info.remainingMs / 1000)} seconds** remaining ` +
          `(${info.extensionsLeft} extension${info.extensionsLeft === 1 ? '' : 's'} left).`,
      );
    },
    roundResolved: async (info) => {
      await channel.send({ embeds: [resultEmbed(info)] });
    },
    error: async (info) => {
      await channel.send(`⚠️ ${info.message}`);
    },
  };
}

async function main(): Promise<void> {
  requireEnv();

  const db = new BotDb(env.dbPath);
  const client = new GeoGuessrClient(env.ncfa);
  const geocoder = new Geocoder(env.bigDataCloudKey);
  const sessions = new SessionManager({
    client,
    geocoder,
    db,
    imageProvider: async (round) => {
      // Some maps return no panoId (AI Generated World) or an unusable protobuf token
      // (Famous Places) — resolve the nearest real pano from the coordinates instead.
      const panoId = isUsablePanoId(round.panoId) ? round.panoId : await resolvePanoId(round.lat, round.lng);
      if (!panoId) {
        console.warn(`[image] round ${round.lat},${round.lng} has no usable panoId and none could be resolved`);
        return null;
      }
      const pano = await fetchPanorama(panoId);
      if (!pano) {
        console.warn(`[image] pano fetch failed for panoId=${panoId} (${round.lat},${round.lng})`);
        return null;
      }
      const camera = {
        heading: round.heading,
        pitch: round.pitch,
        zoom: round.zoom,
        photosphere: panoId.startsWith('P-'),
        official: pano.official,
        drivingDirection: pano.drivingDirection,
      };
      const view = await renderRoundView(pano.image, camera);
      console.log(
        `[image] rendered view for panoId=${panoId} official=${pano.official} grid=${pano.grid} dd=${pano.drivingDirection} (${view.length} bytes)`,
      );
      return view;
    },
  });

  const discord = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  const commands = buildCommands();
  const ctx = { sessions, db };

  discord.once('ready', async () => {
    console.log(`Logged in as ${discord.user?.tag} (camera: authored-heading v3, fov ${BASE_FOV}°)`);

    // Verify the default map is reachable with the provided account.
    const mapName = await client.getMapName(DEFAULT_MAP.id).catch(() => null);
    if (mapName) {
      console.log(`Default map verified: ${mapName}`);
    } else {
      console.warn(`Could not verify the default map (${DEFAULT_MAP.id}). Check the NCFA cookie and map ID.`);
    }

    for (const channelId of env.allowedChannelIds) {
      const channel = await discord.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        console.error(`Channel ${channelId} is not a text channel or is not reachable — skipping.`);
        continue;
      }
      await sessions.start(channelId, makeChannelEvents(channel as SendableChannels));
    }
  });

  discord.on('messageCreate', async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
      if (!env.allowedChannelIds.includes(message.channelId)) return;

      // ChatGuessr hedge guesses are pasted as plain `/w ...` messages.
      const hedgeMatch = message.content.match(/^\/w(?:\s+(.+))?$/i);
      if (hedgeMatch) {
        const session = sessions.get(message.channelId);
        if (!session) return;
        const result = await session.submitHedgeGuess(message.author.id, hedgeMatch[1] ?? '');
        if (!result.ok) {
          const text = result.reason === 'invalid-coordinates'
            ? 'Use `/w <latitude>, <longitude>`.'
            : result.reason === 'unrecognized-location'
              ? 'Those coordinates could not be matched to a country or subdivision.'
            : result.reason === 'already-guessed'
              ? 'You have already submitted a hedge guess this round.'
              : 'There is no active round.';
          await message.reply(`📍 ${text}`);
        } else {
          // The normal roundResolved event now posts the result embed, including the distance.
          await message.react(result.isFiveK ? '🎯' : '✅').catch(() => {});
        }
        return;
      }

      if (!message.content.startsWith(CONFIG.prefix)) return;

      let body = message.content.slice(CONFIG.prefix.length);
      // `!!<cmd>` forces a rebuild/short-timer variant (e.g. !!pic).
      const forced = body.startsWith('!');
      if (forced) body = body.slice(1);

      const [raw, ...rest] = body.trim().split(/\s+/);
      if (!raw) return;
      const command = commands.get(raw.toLowerCase());
      if (!command) return;

      // Forced rebuild of the current image: !!pic / !!image / !!round
      if (forced && ['pic', 'image', 'img', 'round'].includes(raw.toLowerCase())) {
        const session = sessions.get(message.channelId);
        if (!session) return;
        const buffer = await session.rebuildImage();
        if (!buffer) {
          await message.reply('Could not rebuild the image for this round.');
          return;
        }
        const status = session.getStatus();
        await message.reply({
          content: `🖼️ Rebuilt location — streak: **${status.streak}**`,
          files: [new AttachmentBuilder(buffer, { name: 'round.jpg' })],
        });
        return;
      }

      if (command.admin && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await message.reply('⛔ This command is admin-only.');
        return;
      }

      await command.handler(message, rest.join(' '), ctx);
    } catch (err) {
      console.error('Command error:', err);
      await message.reply('⚠️ Something went wrong processing that command.').catch(() => {});
    }
  });

  const shutdown = (): void => {
    console.log('Shutting down, saving state...');
    sessions.persistAll();
    db.close();
    discord.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await discord.login(env.discordToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
