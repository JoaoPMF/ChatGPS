import { appendFile } from 'node:fs/promises';

export interface UnknownGuess {
  attemptedAt: string;
  kind: 'country' | 'subdivision';
  input: string;
  channelId: string;
  userId: string;
  mapName: string;
  countryCode: string | null;
}

const LOG_PATH = 'unknown-guesses.log';

/** Append an invalid guess as one JSON line so new aliases are easy to identify. */
export function logUnknownGuess(guess: UnknownGuess): void {
  void appendFile(LOG_PATH, `${JSON.stringify(guess)}\n`, 'utf8').catch((error: unknown) => {
    console.error('Failed to write unknown guess log:', error);
  });
}
