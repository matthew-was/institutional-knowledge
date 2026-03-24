import { describe, expect, it } from 'vitest';
import {
  AddTermSchema,
  createUploadFormSchema,
  MetadataEditSchema,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// UploadFormSchema
// ---------------------------------------------------------------------------

describe('createUploadFormSchema', () => {
  const schema = createUploadFormSchema(5, [
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.tif',
    '.tiff',
  ]);

  function makeFile(
    name: string,
    sizeBytes: number,
    type = 'application/pdf',
  ): File {
    const content = new Uint8Array(sizeBytes);
    return new File([content], name, { type });
  }

  describe('valid inputs', () => {
    it('passes for a valid PDF under size limit', () => {
      const result = schema.safeParse({
        file: makeFile('document.pdf', 1024),
        date: '2026-03-15',
        description: 'Valid document',
      });
      expect(result.success).toBe(true);
    });

    it('passes for a JPEG file', () => {
      const result = schema.safeParse({
        file: makeFile('photo.jpg', 2048, 'image/jpeg'),
        date: '2000-01-01',
        description: 'A photograph',
      });
      expect(result.success).toBe(true);
    });

    it('passes for a file exactly at the size limit', () => {
      const maxBytes = 5 * 1024 * 1024;
      const result = schema.safeParse({
        file: makeFile('exact.pdf', maxBytes),
        date: '2026-01-01',
        description: 'Exactly at limit',
      });
      expect(result.success).toBe(true);
    });

    it('passes for an uppercase extension (case-insensitive)', () => {
      const result = schema.safeParse({
        file: makeFile('document.PDF', 512),
        date: '2026-03-01',
        description: 'Uppercase extension',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('date validation', () => {
    it('fails for an empty date string', () => {
      const result = schema.safeParse({
        file: makeFile('doc.pdf', 1024),
        date: '',
        description: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('fails for an invalid date format', () => {
      const result = schema.safeParse({
        file: makeFile('doc.pdf', 1024),
        date: '15-03-2026',
        description: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('fails for an invalid calendar date (Feb 30)', () => {
      const result = schema.safeParse({
        file: makeFile('doc.pdf', 1024),
        date: '2026-02-30',
        description: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('description validation', () => {
    it('fails for an empty description', () => {
      const result = schema.safeParse({
        file: makeFile('doc.pdf', 1024),
        date: '2026-03-01',
        description: '',
      });
      expect(result.success).toBe(false);
    });

    it('fails for a whitespace-only description', () => {
      const result = schema.safeParse({
        file: makeFile('doc.pdf', 1024),
        date: '2026-03-01',
        description: '   ',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('file validation', () => {
    it('fails for an unsupported file extension', () => {
      const result = schema.safeParse({
        file: makeFile('archive.zip', 1024, 'application/zip'),
        date: '2026-03-01',
        description: 'Zip file',
      });
      expect(result.success).toBe(false);
    });

    it('fails for an oversized file', () => {
      const tooLargeBytes = 5 * 1024 * 1024 + 1;
      const result = schema.safeParse({
        file: makeFile('large.pdf', tooLargeBytes),
        date: '2026-03-01',
        description: 'Too large',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// MetadataEditSchema
// ---------------------------------------------------------------------------

describe('MetadataEditSchema', () => {
  describe('valid inputs', () => {
    it('passes with full valid data', () => {
      const result = MetadataEditSchema.safeParse({
        date: '2026-03-15',
        description: 'Updated description',
        people: ['Alice Smith', 'Bob Jones'],
        organisations: ['Estate of John'],
        landReferences: ['North Field'],
      });
      expect(result.success).toBe(true);
    });

    it('passes with all fields omitted (all optional)', () => {
      const result = MetadataEditSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('null date pre-population', () => {
    it('passes when date is null', () => {
      const result = MetadataEditSchema.safeParse({ date: null });
      expect(result.success).toBe(true);
    });

    it('passes when date is an empty string', () => {
      const result = MetadataEditSchema.safeParse({ date: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('description validation', () => {
    it('fails when description is whitespace only', () => {
      const result = MetadataEditSchema.safeParse({ description: '   ' });
      expect(result.success).toBe(false);
    });

    it('passes when description is omitted', () => {
      const result = MetadataEditSchema.safeParse({ date: '2026-01-01' });
      expect(result.success).toBe(true);
    });
  });

  describe('comma-separated array inputs', () => {
    it('converts comma-separated people string to array', () => {
      const result = MetadataEditSchema.safeParse({
        people: 'Alice Smith, Bob Jones',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.people).toEqual(['Alice Smith', 'Bob Jones']);
      }
    });

    it('converts comma-separated organisations string to array', () => {
      const result = MetadataEditSchema.safeParse({
        organisations: 'Estate of John, Local Council',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.organisations).toEqual([
          'Estate of John',
          'Local Council',
        ]);
      }
    });

    it('converts comma-separated landReferences string to array', () => {
      const result = MetadataEditSchema.safeParse({
        landReferences: 'North Field, Home Farm',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.landReferences).toEqual([
          'North Field',
          'Home Farm',
        ]);
      }
    });

    it('trims whitespace from split array elements', () => {
      const result = MetadataEditSchema.safeParse({
        people: '  Alice Smith  ,  Bob Jones  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.people).toEqual(['Alice Smith', 'Bob Jones']);
      }
    });

    it('passes through existing string arrays unchanged', () => {
      const result = MetadataEditSchema.safeParse({
        people: ['Alice Smith', 'Bob Jones'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.people).toEqual(['Alice Smith', 'Bob Jones']);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// AddTermSchema
// ---------------------------------------------------------------------------

describe('AddTermSchema', () => {
  describe('valid inputs', () => {
    it('passes with required fields only', () => {
      const result = AddTermSchema.safeParse({
        term: 'Home Farm',
        category: 'land_reference',
      });
      expect(result.success).toBe(true);
    });

    it('passes with all optional fields', () => {
      const result = AddTermSchema.safeParse({
        term: 'Home Farm',
        category: 'land_reference',
        description: 'The main farm holding',
        aliases: ['The Farm', 'Home Place'],
        relationships: [
          {
            targetTermId: '01927c3a-5b2e-7000-8000-000000000001',
            relationshipType: 'broader',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('missing required fields', () => {
    it('fails when term is missing', () => {
      const result = AddTermSchema.safeParse({ category: 'land_reference' });
      expect(result.success).toBe(false);
    });

    it('fails when category is missing', () => {
      const result = AddTermSchema.safeParse({ term: 'Home Farm' });
      expect(result.success).toBe(false);
    });
  });

  describe('UUID validation for targetTermId', () => {
    it('fails when targetTermId is not a valid UUID', () => {
      const result = AddTermSchema.safeParse({
        term: 'Home Farm',
        category: 'land_reference',
        relationships: [
          { targetTermId: 'not-a-uuid', relationshipType: 'broader' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('passes with a valid UUID v4 for targetTermId', () => {
      const result = AddTermSchema.safeParse({
        term: 'Home Farm',
        category: 'land_reference',
        relationships: [
          {
            targetTermId: '550e8400-e29b-41d4-a716-446655440000',
            relationshipType: 'broader',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('passes with a valid UUID v7 for targetTermId', () => {
      const result = AddTermSchema.safeParse({
        term: 'Home Farm',
        category: 'land_reference',
        relationships: [
          {
            targetTermId: '01927c3a-5b2e-7000-8000-000000000001',
            relationshipType: 'broader',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});
