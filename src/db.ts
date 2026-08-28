import Database from 'better-sqlite3';

export interface SavedGameState {
  channelId: string;
  gameJson: string;
  streak: number;
  streakId: number | null;
  mapId: string;
  mapName: string;
  roundNumber: number;
}

export interface UserRow {
  userId: string;
  xp: number;
  totalVotes: number;
  correctVotes: number;
}

export interface TopStreakRow {
  id: number;
  number: number;
  mapName: string | null;
  startTs: number;
  endTs: number | null;
  users: string | null;
}

export interface RoundLogRow {
  streakId: number | null;
  channelId: string;
  mapId: string;
  mapName: string;
  roundNumber: number;
  lat: number;
  lng: number;
  actualCode: string | null;
  actualName: string | null;
  winningCode: string | null;
  winningName: string | null;
  isCorrect: boolean;
}

export class BotDb {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        xp INTEGER NOT NULL DEFAULT 0,
        total_votes INTEGER NOT NULL DEFAULT 0,
        correct_votes INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS streaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        map_id TEXT,
        map_name TEXT,
        start_ts INTEGER NOT NULL,
        end_ts INTEGER
      );
      CREATE TABLE IF NOT EXISTS streak_participants (
        streak_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        votes_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (streak_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        streak_id INTEGER,
        channel_id TEXT NOT NULL,
        map_id TEXT,
        round_number INTEGER,
        lat REAL,
        lng REAL,
        actual_code TEXT,
        actual_name TEXT,
        winning_code TEXT,
        winning_name TEXT,
        is_correct INTEGER NOT NULL DEFAULT 0,
        ts INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_rounds (
        round_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        is_correct INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (round_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS hedge_guesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        guess_lat REAL NOT NULL,
        guess_lng REAL NOT NULL,
        distance_meters REAL NOT NULL,
        is_five_k INTEGER NOT NULL DEFAULT 0,
        ts INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS game_state (
        channel_id TEXT PRIMARY KEY,
        game_json TEXT NOT NULL,
        streak INTEGER NOT NULL,
        streak_id INTEGER,
        map_id TEXT NOT NULL,
        map_name TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        updated_ts INTEGER NOT NULL
      );
    `);
    const columns = this.db.prepare(`PRAGMA table_info(rounds)`).all() as { name: string }[];
    if (!columns.some((column) => column.name === 'map_name')) {
      this.db.exec(`ALTER TABLE rounds ADD COLUMN map_name TEXT`);
    }
  }

  // ---------- users / XP ----------

  addXp(userId: string, amount: number): void {
    this.db
      .prepare(
        `INSERT INTO users (user_id, xp) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET xp = xp + excluded.xp`,
      )
      .run(userId, amount);
  }

  recordVote(userId: string, correct: boolean): void {
    this.db
      .prepare(
        `INSERT INTO users (user_id, total_votes, correct_votes) VALUES (?, 1, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           total_votes = total_votes + 1,
           correct_votes = correct_votes + excluded.correct_votes`,
      )
      .run(userId, correct ? 1 : 0);
  }

  getUser(userId: string): UserRow {
    const row = this.db
      .prepare(`SELECT user_id AS userId, xp, total_votes AS totalVotes, correct_votes AS correctVotes
                FROM users WHERE user_id = ?`)
      .get(userId) as UserRow | undefined;
    return row ?? { userId, xp: 0, totalVotes: 0, correctVotes: 0 };
  }

  // ---------- streaks ----------

  startStreak(channelId: string, mapId: string, mapName: string): number {
    const info = this.db
      .prepare(`INSERT INTO streaks (channel_id, number, map_id, map_name, start_ts) VALUES (?, 0, ?, ?, ?)`)
      .run(channelId, mapId, mapName, Date.now());
    return Number(info.lastInsertRowid);
  }

  bumpStreak(streakId: number): number {
    const row = this.db
      .prepare(`UPDATE streaks SET number = number + 1 WHERE id = ? RETURNING number`)
      .get(streakId) as { number: number } | undefined;
    return row?.number ?? 0;
  }

  setStreakNumber(streakId: number, number: number): void {
    this.db.prepare(`UPDATE streaks SET number = ? WHERE id = ?`).run(number, streakId);
  }

  endStreak(streakId: number): void {
    this.db.prepare(`UPDATE streaks SET end_ts = ? WHERE id = ? AND end_ts IS NULL`).run(Date.now(), streakId);
  }

  addParticipantVote(streakId: number, userId: string): void {
    this.db
      .prepare(
        `INSERT INTO streak_participants (streak_id, user_id, votes_count) VALUES (?, ?, 1)
         ON CONFLICT(streak_id, user_id) DO UPDATE SET votes_count = votes_count + 1`,
      )
      .run(streakId, userId);
  }

  topStreaks(limit: number, mapId?: string, userId?: string): TopStreakRow[] {
    const where: string[] = ['s.number > 0'];
    const params: unknown[] = [];
    if (mapId) {
      where.push('s.map_id = ?');
      params.push(mapId);
    }
    if (userId) {
      where.push('EXISTS (SELECT 1 FROM streak_participants sp WHERE sp.streak_id = s.id AND sp.user_id = ?)');
      params.push(userId);
    }
    params.push(limit);
    return this.db
      .prepare(
        `SELECT s.id, s.number, s.map_name AS mapName, s.start_ts AS startTs, s.end_ts AS endTs,
                (SELECT GROUP_CONCAT(sp.user_id) FROM streak_participants sp WHERE sp.streak_id = s.id) AS users
         FROM streaks s
         WHERE ${where.join(' AND ')}
         ORDER BY s.number DESC, s.start_ts ASC
         LIMIT ?`,
      )
      .all(...params) as TopStreakRow[];
  }

  /** A user's best streak per map. */
  personalBests(userId: string): { mapName: string | null; best: number }[] {
    return this.db
      .prepare(
        `SELECT s.map_name AS mapName, MAX(s.number) AS best
         FROM streaks s
         WHERE EXISTS (SELECT 1 FROM streak_participants sp WHERE sp.streak_id = s.id AND sp.user_id = ?)
         GROUP BY s.map_id
         ORDER BY best DESC`,
      )
      .all(userId) as { mapName: string | null; best: number }[];
  }

  /** Accuracy per map for a user (rounds where their vote was correct). */
  accuracyByMap(userId: string): { mapName: string | null; total: number; correct: number; acc: number }[] {
    return this.db
      .prepare(
        `SELECT r.map_name AS mapName, COUNT(*) AS total,
                SUM(CASE WHEN ur.is_correct THEN 1 ELSE 0 END) AS correct,
                ROUND(AVG(CASE WHEN ur.is_correct THEN 100.0 ELSE 0 END), 1) AS acc
         FROM user_rounds ur
         JOIN rounds r ON r.id = ur.round_id
         WHERE ur.user_id = ?
         GROUP BY r.map_id, r.map_name
         ORDER BY total DESC`,
      )
      .all(userId) as { mapName: string | null; total: number; correct: number; acc: number }[];
  }

  /** Accuracy per answered subdivision for a user on a specific map. */
  accuracyBySubdivision(userId: string, mapId: string): { subdivision: string; total: number; correct: number; acc: number }[] {
    return this.db
      .prepare(
        `SELECT r.actual_name AS subdivision, COUNT(*) AS total,
                SUM(CASE WHEN ur.is_correct THEN 1 ELSE 0 END) AS correct,
                ROUND(AVG(CASE WHEN ur.is_correct THEN 100.0 ELSE 0 END), 1) AS acc
         FROM user_rounds ur
         JOIN rounds r ON r.id = ur.round_id
         WHERE ur.user_id = ? AND r.map_id = ? AND r.actual_name IS NOT NULL
         GROUP BY r.actual_code, r.actual_name
         ORDER BY total DESC, subdivision ASC`,
      )
      .all(userId, mapId) as { subdivision: string; total: number; correct: number; acc: number }[];
  }

  /** Rounds played per user (server leaderboard). */
  topRounds(limit: number): { userId: string; rounds: number }[] {
    return this.db
      .prepare(
        `SELECT sp.user_id AS userId, SUM(sp.votes_count) AS rounds
         FROM streak_participants sp
         GROUP BY sp.user_id
         ORDER BY rounds DESC
         LIMIT ?`,
      )
      .all(limit) as { userId: string; rounds: number }[];
  }

  recordHedgeGuess(input: {
    channelId: string;
    roundNumber: number;
    userId: string;
    lat: number;
    lng: number;
    distanceMeters: number;
    isFiveK: boolean;
  }): void {
    this.db.prepare(
      `INSERT INTO hedge_guesses
       (channel_id, round_number, user_id, guess_lat, guess_lng, distance_meters, is_five_k, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.channelId,
      input.roundNumber,
      input.userId,
      input.lat,
      input.lng,
      input.distanceMeters,
      input.isFiveK ? 1 : 0,
      Date.now(),
    );
  }

  topFiveKs(limit: number): { userId: string; fiveKs: number }[] {
    return this.db.prepare(
      `SELECT user_id AS userId, COUNT(*) AS fiveKs
       FROM hedge_guesses
       WHERE is_five_k = 1
       GROUP BY user_id
       ORDER BY fiveKs DESC, MIN(ts) ASC
       LIMIT ?`,
    ).all(limit) as { userId: string; fiveKs: number }[];
  }

  topXp(limit: number): { userId: string; xp: number }[] {
    return this.db.prepare(
      `SELECT user_id AS userId, xp
       FROM users
       WHERE xp > 0
       ORDER BY xp DESC, user_id ASC
       LIMIT ?`,
    ).all(limit) as { userId: string; xp: number }[];
  }

  // ---------- rounds ----------

  logRound(row: RoundLogRow): number {
    const result = this.db
      .prepare(
        `INSERT INTO rounds
           (streak_id, channel_id, map_id, map_name, round_number, lat, lng, actual_code, actual_name, winning_code, winning_name, is_correct, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.streakId,
        row.channelId,
        row.mapId,
        row.mapName,
        row.roundNumber,
        row.lat,
        row.lng,
        row.actualCode,
        row.actualName,
        row.winningCode,
        row.winningName,
        row.isCorrect ? 1 : 0,
        Date.now(),
      );
    return Number(result.lastInsertRowid);
  }

  logUserRound(roundId: number, userId: string, correct: boolean): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO user_rounds (round_id, user_id, is_correct) VALUES (?, ?, ?)`)
      .run(roundId, userId, correct ? 1 : 0);
  }

  // ---------- game state (crash recovery) ----------

  saveGameState(state: SavedGameState): void {
    this.db
      .prepare(
        `INSERT INTO game_state (channel_id, game_json, streak, streak_id, map_id, map_name, round_number, updated_ts)
         VALUES (@channelId, @gameJson, @streak, @streakId, @mapId, @mapName, @roundNumber, @updatedTs)
         ON CONFLICT(channel_id) DO UPDATE SET
           game_json = @gameJson, streak = @streak, streak_id = @streakId,
           map_id = @mapId, map_name = @mapName, round_number = @roundNumber, updated_ts = @updatedTs`,
      )
      .run({ ...state, updatedTs: Date.now() });
  }

  loadGameState(channelId: string): SavedGameState | null {
    const row = this.db
      .prepare(
        `SELECT channel_id AS channelId, game_json AS gameJson, streak, streak_id AS streakId,
                map_id AS mapId, map_name AS mapName, round_number AS roundNumber
         FROM game_state WHERE channel_id = ?`,
      )
      .get(channelId) as SavedGameState | undefined;
    return row ?? null;
  }

  clearGameState(channelId: string): void {
    this.db.prepare(`DELETE FROM game_state WHERE channel_id = ?`).run(channelId);
  }

  close(): void {
    this.db.close();
  }
}
