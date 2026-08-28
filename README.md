# GeoGuessr Country Streaks Bot

A Discord bot for cooperative GeoGuessr country streaks. Work together with other players to achieve the highest possible country streak.

- **Map:** `A Community World` by *MatePotato* (switchable)
- **Game settings:** `NMPZ` (no move, no pan, no zoom)

Once the first player has guessed, the other players have **10 seconds** to make their guesses. The final answer is the country with the most votes at the end of the voting period — in case of a tie, the answer cast first wins. **Guess changing is enabled.** Territories are counted as part of their respective sovereign states.

## Commands

| Command | Description |
| --- | --- |
| `!g <country>` | Vote for a country |
| `!g <country1> or <country2>` | Randomly vote for one of several countries |
| `!g <country>, <subdivision>` | Guess a country with an optional subdivision for double XP |
| `!time` | Extend the voting period by 20 seconds (max 3× per round) |
| `!image` | Display the current location again |
| `!top [map] [me]` | Display the highest streaks, optionally filtered |
| `!switchmap [map]` | List maps or switch to another map |
| `!xp` | View your XP balance |
| `!topxp` / `!xplb` | Server leaderboard of XP balances |
| `!aliases [subdivision]` | List valid subdivisions or aliases for the current subdivision map |
| `!map` / `!cg` | Get the configured ChatGuessr map link for hedge guesses |
| `!top5k` / `!5k` | Server leaderboard of 5K `/w` guesses |
| `!help` | Show the command list |

Admin-only: `!start`, `!skip`, `!fix` (start a fresh game, keeping the streak), `!setstreak <n>`.

## How it works

The bot plays GeoGuessr itself using a dedicated account: it creates NMPZ games, submits a dummy guess each round to reveal the next location, and never looks at GeoGuessr's answer data — correctness is determined by reverse-geocoding the round's coordinates and comparing the (sovereign) country against the players' winning vote.

## Setup

### Prerequisites

1. **Discord bot token**
   - Create an application at the [Discord Developer Portal](https://discord.com/developers/applications), add a bot, and copy its token.
   - Under *Bot → Privileged Gateway Intents*, enable **Message Content Intent**.
   - Invite the bot to your server with the `bot` scope and permission to send messages, embed links, attach files and add reactions.

2. **GeoGuessr account cookie (`NCFA`)**
   - Create/use a dedicated GeoGuessr account (a **Pro subscription is strongly recommended** — free accounts are heavily rate-limited).
   - Log in at [geoguessr.com](https://www.geoguessr.com), open DevTools → *Application → Cookies → https://www.geoguessr.com* and copy the value of the **`_ncfa`** cookie.
   - ⚠️ This uses GeoGuessr's unofficial internal API. It may break at any time and is arguably against their ToS — use a burner account at your own risk.

3. **BigDataCloud API key** (free) for reverse geocoding: <https://www.bigdatacloud.com/>

### Install

```sh
npm install
cp .env.example .env   # fill in your values
```

`.env`:

```ini
DISCORD_TOKEN=your-discord-bot-token
NCFA=your-ncfa-cookie-value
BIGDATACLOUD_API_KEY=your-bigdatacloud-key
ALLOWED_CHANNEL_IDS=1234567890123456789
```

### Verify credentials (optional but recommended)

```sh
npm run smoke
```

This creates a test game, fetches a location, reverse-geocodes it and downloads a panorama — without touching Discord.

### Run

```sh
npm run dev       # development (tsx, no build)
npm run build     # compile to dist/
npm start         # run the compiled bot
```

The bot automatically starts (or restores, after a restart) a game in every allowed channel.

### Tests

```sh
npm test
```

Unit tests cover country resolution & territory rules, vote tallying/tie-breaks, `or`-guesses, XP awards and the full round state machine (with mocked GeoGuessr/geocoder and fake timers).

## Configuration

Gameplay constants live in [src/config.ts](src/config.ts): vote window (10s), `!time` extension (20s, max 3), XP values (5 participation / 25 correct / 100 milestone at streaks 5, 10, 25, 50, 100) and the map registry.

The supplied country maps for Portugal, Argentina, Australia, Brazil, Canada, Chile, Colombia, India, Indonesia, Japan, Kazakhstan, the Philippines, Russia, South Africa and the United States automatically use subdivision streaks. On those maps, `!g <subdivision>` is the answer format; use `!aliases` to see the available ISO 3166-2 subdivisions. World maps continue to use country streaks.

On country streak maps, you may optionally include a subdivision: `!g mexico, tamaulipas`. The country answer is checked normally; an incorrect subdivision does not cause a wrong answer. A correct subdivision doubles that player's XP reward for the round. ISO subdivision names are resolved for all countries, not only the dedicated subdivision maps.

### Hedge guesses

Use `!map` to receive the configured ChatGuessr link. After making a guess there, paste the resulting coordinate guess into Discord as `/w <latitude>, <longitude>` or paste a Google Maps URL containing the coordinates. The bot reports the distance from the round location. A guess within 185 metres counts as a **5K**, awards **+100 XP** by default, and is included in `!top5k`. Each player gets one hedge guess per round. This is only the basic hedge guess flow; speedrun, score and other hedge modes are intentionally not included.

### Custom aliases

Edit [src/data/custom-aliases.ts](src/data/custom-aliases.ts) to add your own aliases, then restart the bot. Country aliases use a two-letter country code; subdivision aliases use the full ISO 3166-2 code:

```ts
export const COUNTRY_ALIASES = {
   US: ['murica'],
};

export const SUBDIVISION_ALIASES = {
   'PT-11': ['lx'],       // Lisboa
   'US-CA': ['cali'],     // California
   'RU-MOW': ['moscow city'],
};
```

## Data

All data (XP, streaks, rounds, game state) is stored in a local SQLite database (`streaks.db` by default). No external services besides Discord, GeoGuessr, BigDataCloud and Google Street View tile servers are used.

## Credits

Architecture inspired by [ccmdi/geoguessr-streakbot](https://github.com/ccmdi/geoguessr-streakbot) and [Saka1zum1/streak-bot](https://github.com/Saka1zum1/streak-bot).
