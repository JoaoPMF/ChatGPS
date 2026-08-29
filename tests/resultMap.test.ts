import { describe, expect, it } from 'vitest';
import { renderResultMap } from '../src/resultMap.js';

describe('renderResultMap', () => {
  it('renders a world map for correct country guess', async () => {
    const buffer = await renderResultMap({
      mode: 'country',
      actualCode: 'FR',
      actualName: 'France',
      winningCode: 'FR',
      winningName: 'France',
      isCorrect: true,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });

  it('renders a world map with red guess and green actual for wrong country guess', async () => {
    const buffer = await renderResultMap({
      mode: 'country',
      actualCode: 'FR',
      actualName: 'France',
      winningCode: 'ES',
      winningName: 'Spain',
      isCorrect: false,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });

  it('renders a subdivision map for correct subdivision guess', async () => {
    const buffer = await renderResultMap({
      mode: 'subdivision',
      countryCode: 'PT',
      actualCode: '11',
      actualName: 'Lisbon',
      winningCode: '11',
      winningName: 'Lisbon',
      isCorrect: true,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });

  it('renders a subdivision map with red guess and green actual for wrong subdivision guess', async () => {
    const buffer = await renderResultMap({
      mode: 'subdivision',
      countryCode: 'PT',
      actualCode: '11',
      actualName: 'Lisbon',
      winningCode: '13',
      winningName: 'Porto',
      isCorrect: false,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });

  it('renders a focused subdivision map for Canadian provinces', async () => {
    const buffer = await renderResultMap({
      mode: 'subdivision',
      countryCode: 'CA',
      actualCode: 'MB',
      actualName: 'Manitoba',
      winningCode: 'SK',
      winningName: 'Saskatchewan',
      isCorrect: false,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });

  it('renders a world map with guess pin placed on the guessed subdivision', async () => {
    const buffer = await renderResultMap({
      mode: 'country',
      actualCode: 'FR',
      actualName: 'France',
      actualLat: 48.8566,
      actualLng: 2.3522,
      winningCode: 'US',
      winningName: 'United States',
      winningSubdivisionCode: 'US-CA',
      winningSubdivisionName: 'California',
      isCorrect: false,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(1000);
  });
});
