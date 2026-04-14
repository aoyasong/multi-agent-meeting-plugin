import { describe, expect, it } from 'vitest';

import {
  generateAgendaId,
  generateId,
  generateMeetingId,
  generateNoteId,
  generateSpeakingId,
  generateVotingId,
} from '../../src/utils/id-generator.js';

describe('ID generator utils', () => {
  it('should generate unique ids with the provided prefix', () => {
    const first = generateId('custom');
    const second = generateId('custom');

    expect(first).toMatch(/^custom_/);
    expect(second).toMatch(/^custom_/);
    expect(first).not.toBe(second);
  });

  it('should generate ids for each domain helper with the correct prefix', () => {
    expect(generateMeetingId()).toMatch(/^meeting_/);
    expect(generateAgendaId()).toMatch(/^agenda_/);
    expect(generateVotingId()).toMatch(/^voting_/);
    expect(generateNoteId()).toMatch(/^note_/);
    expect(generateSpeakingId()).toMatch(/^speak_/);
  });
});
