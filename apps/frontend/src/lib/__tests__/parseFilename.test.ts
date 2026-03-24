import { describe, expect, it } from 'vitest';
import { parseFilename } from '../parseFilename.js';

describe('parseFilename', () => {
  describe('conforming filenames', () => {
    it('returns date and description for a well-formed stem', () => {
      const result = parseFilename('2026-03-15 - Family reunion');
      expect(result).toEqual({
        date: '2026-03-15',
        description: 'Family reunion',
      });
    });

    it('returns date and description when description contains spaces', () => {
      const result = parseFilename(
        '1987-06-15 - Wedding photograph of the family',
      );
      expect(result).toEqual({
        date: '1987-06-15',
        description: 'Wedding photograph of the family',
      });
    });

    it('returns date and description when description contains hyphens', () => {
      const result = parseFilename('2000-01-01 - New Year - 2000');
      expect(result).toEqual({
        date: '2000-01-01',
        description: 'New Year - 2000',
      });
    });
  });

  describe('valid calendar dates', () => {
    it('returns the ISO date string for a valid calendar date', () => {
      const result = parseFilename('2024-02-29 - Leap year document');
      expect(result).not.toBeNull();
      expect(result?.date).toBe('2024-02-29');
    });

    it('accepts a date at the start of a month', () => {
      const result = parseFilename('1950-01-01 - First record');
      expect(result?.date).toBe('1950-01-01');
    });
  });

  describe('invalid calendar dates', () => {
    it('returns null date and extracted description for an invalid calendar date', () => {
      const result = parseFilename('2026-02-30 - Impossible date');
      expect(result).toEqual({ date: null, description: 'Impossible date' });
    });

    it('returns null date for February 29 in a non-leap year', () => {
      const result = parseFilename('2023-02-29 - Not a leap year');
      expect(result).toEqual({ date: null, description: 'Not a leap year' });
    });

    it('returns null date for month 13', () => {
      const result = parseFilename('2026-13-01 - Invalid month');
      expect(result).toEqual({ date: null, description: 'Invalid month' });
    });

    it('returns null date for day 00', () => {
      const result = parseFilename('2026-01-00 - Invalid day');
      expect(result).toEqual({ date: null, description: 'Invalid day' });
    });
  });

  describe('non-conforming filenames', () => {
    it('returns null for an empty string', () => {
      expect(parseFilename('')).toBeNull();
    });

    it('returns null for an extension-only string', () => {
      expect(parseFilename('.pdf')).toBeNull();
    });

    it('returns null when the separator is missing', () => {
      expect(parseFilename('2026-03-15 Family reunion')).toBeNull();
    });

    it('returns null when the date portion is absent', () => {
      expect(parseFilename('Family reunion document')).toBeNull();
    });

    it('returns null when the description segment is empty', () => {
      // Pattern requires non-empty description after " - "
      expect(parseFilename('2026-03-15 - ')).toBeNull();
    });

    it('returns null for a filename with no pattern at all', () => {
      expect(parseFilename('IMG_2048')).toBeNull();
    });
  });
});
