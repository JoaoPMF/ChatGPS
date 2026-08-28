/**
 * Smoke test: verifies the GeoGuessr account (NCFA cookie), the default map,
 * and reverse geocoding — without touching Discord.
 *
 * Usage: copy .env.example to .env, fill in NCFA and BIGDATACLOUD_API_KEY, then:
 *   npm run smoke
 */
import { writeFileSync } from 'node:fs';
import { DEFAULT_MAP, env, requireEnv } from '../src/config.js';
import { Geocoder } from '../src/geocode.js';
import { GeoGuessrClient, playableRound } from '../src/geoguessr.js';
import { fetchPanorama } from '../src/pano.js';
import { renderRoundView } from '../src/projection.js';

async function main(): Promise<void> {
  requireEnv();

  const client = new GeoGuessrClient(env.ncfa);

  console.log(`Checking map "${DEFAULT_MAP.name}" (${DEFAULT_MAP.id})...`);
  const mapName = await client.getMapName(DEFAULT_MAP.id);
  console.log(`  -> API reports: ${mapName ?? 'NOT FOUND — check the map id / cookie'}`);

  console.log('Creating an NMPZ game...');
  const game = await client.startGame(DEFAULT_MAP.id);
  const round = playableRound(game);
  console.log(`  -> Playable location: ${round.lat}, ${round.lng} (pano: ${round.panoId ?? 'none'})`);

  console.log('Reverse geocoding...');
  const geocoder = new Geocoder(env.bigDataCloudKey);
  const country = await geocoder.countryAt(round.lat, round.lng);
  console.log(`  -> Country: ${country?.name ?? 'unknown'} (${country?.code ?? '??'})`);

  if (round.panoId) {
    console.log('Fetching panorama image...');
    const pano = await fetchPanorama(round.panoId);
    if (!pano) {
      console.log('  -> FAILED to fetch panorama');
    } else {
      const view = await renderRoundView(pano.image, {
        heading: round.heading,
        pitch: round.pitch,
        zoom: round.zoom,
        photosphere: round.panoId.startsWith('P-'),
        official: pano.official,
      });
      writeFileSync('smoke-view.jpg', view);
      console.log(`  -> official=${pano.official}, panorama ${pano.image.length} bytes, viewport ${view.length} bytes (saved smoke-view.jpg)`);
    }
  }

  console.log('Advancing to the next round...');
  const next = await client.nextRound(game);
  const nextRound = playableRound(next);
  console.log(`  -> Next location: ${nextRound.lat}, ${nextRound.lng}`);

  console.log('\nSmoke test OK ✔');
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});
