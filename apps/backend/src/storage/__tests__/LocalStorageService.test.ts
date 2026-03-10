import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageService } from '../LocalStorageService.js';

const silentLog = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// Test setup — real temporary directory, cleaned up after all tests
// ---------------------------------------------------------------------------

let tempRoot: string;
let basePath: string;
let stagingPath: string;
let service: LocalStorageService;

beforeAll(async () => {
  tempRoot = path.join(os.tmpdir(), `ik-test-storage-${Date.now()}`);
  basePath = path.join(tempRoot, 'permanent');
  stagingPath = path.join(tempRoot, 'staging');
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(stagingPath, { recursive: true });
  service = new LocalStorageService(basePath, stagingPath, silentLog);
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// (a) writeStagingFile
// ---------------------------------------------------------------------------

describe('writeStagingFile', () => {
  it('creates the file at {stagingPath}/{uploadId}/{filename} with correct content', async () => {
    const uploadId = 'upload-a1';
    const filename = 'document.pdf';
    const content = Buffer.from('hello staging');

    const returned = await service.writeStagingFile(
      uploadId,
      content,
      filename,
    );

    const expectedPath = path.join(stagingPath, uploadId, filename);
    expect(returned).toBe(expectedPath);

    const written = await fs.readFile(expectedPath);
    expect(written).toEqual(content);
  });

  it('creates the parent directory if it does not exist', async () => {
    const uploadId = 'upload-a2-new-dir';
    const filename = 'file.txt';

    await service.writeStagingFile(uploadId, Buffer.from('x'), filename);

    const dir = path.join(stagingPath, uploadId);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) moveStagingToPermanent
// ---------------------------------------------------------------------------

describe('moveStagingToPermanent', () => {
  it('moves the file to {basePath}/{uploadId}/{filename} and returns the destination path', async () => {
    const uploadId = 'upload-b1';
    const filename = 'photo.jpg';
    const content = Buffer.from('image data');

    await service.writeStagingFile(uploadId, content, filename);
    const dest = await service.moveStagingToPermanent(uploadId, filename);

    const expectedDest = path.join(basePath, uploadId, filename);
    expect(dest).toBe(expectedDest);

    // File is at destination
    const written = await fs.readFile(dest);
    expect(written).toEqual(content);

    // File is gone from staging
    const stillInStaging = await service.fileExists(
      path.join(stagingPath, uploadId, filename),
    );
    expect(stillInStaging).toBe(false);
  });

  it('creates the destination parent directory if it does not exist', async () => {
    const uploadId = 'upload-b2-new-perm-dir';
    const filename = 'doc.pdf';

    await service.writeStagingFile(uploadId, Buffer.from('data'), filename);
    const dest = await service.moveStagingToPermanent(uploadId, filename);

    const dir = path.dirname(dest);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) deleteStagingFile
// ---------------------------------------------------------------------------

describe('deleteStagingFile', () => {
  it('removes the file from the staging path', async () => {
    const uploadId = 'upload-c1';
    const filename = 'to-delete.txt';

    await service.writeStagingFile(uploadId, Buffer.from('data'), filename);
    await service.deleteStagingFile(uploadId, filename);

    const exists = await service.fileExists(
      path.join(stagingPath, uploadId, filename),
    );
    expect(exists).toBe(false);
  });

  it('does not throw when called on a non-existent file', async () => {
    await expect(
      service.deleteStagingFile('upload-c2-ghost', 'no-such-file.txt'),
    ).resolves.toBeUndefined();
  });

  it('does not throw when called twice on the same file', async () => {
    const uploadId = 'upload-c3';
    const filename = 'delete-twice.txt';

    await service.writeStagingFile(uploadId, Buffer.from('x'), filename);
    await service.deleteStagingFile(uploadId, filename);

    await expect(
      service.deleteStagingFile(uploadId, filename),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (d) deletePermanentFile
// ---------------------------------------------------------------------------

describe('deletePermanentFile', () => {
  it('removes the permanent file at the given absolute path', async () => {
    const uploadId = 'upload-d1';
    const filename = 'perm-to-delete.pdf';

    await service.writeStagingFile(uploadId, Buffer.from('data'), filename);
    const dest = await service.moveStagingToPermanent(uploadId, filename);

    await service.deletePermanentFile(dest);

    const exists = await service.fileExists(dest);
    expect(exists).toBe(false);
  });

  it('does not throw when the file does not exist', async () => {
    const ghostPath = path.join(basePath, 'does-not-exist', 'ghost.pdf');

    await expect(
      service.deletePermanentFile(ghostPath),
    ).resolves.toBeUndefined();
  });

  it('does not throw when called twice on the same path', async () => {
    const uploadId = 'upload-d2';
    const filename = 'perm-delete-twice.pdf';

    await service.writeStagingFile(uploadId, Buffer.from('x'), filename);
    const dest = await service.moveStagingToPermanent(uploadId, filename);

    await service.deletePermanentFile(dest);

    await expect(service.deletePermanentFile(dest)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (e) createStagingDirectory and deleteStagingDirectory
// ---------------------------------------------------------------------------

describe('createStagingDirectory', () => {
  it('creates {stagingPath}/{runId} and returns the absolute path', async () => {
    const runId = 'run-e1';

    const returned = await service.createStagingDirectory(runId);

    const expectedPath = path.join(stagingPath, runId);
    expect(returned).toBe(expectedPath);

    const stat = await fs.stat(expectedPath);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('deleteStagingDirectory', () => {
  it('removes the directory and its contents', async () => {
    const runId = 'run-e2';

    await service.createStagingDirectory(runId);
    // Place a file inside to confirm recursive deletion
    await fs.writeFile(path.join(stagingPath, runId, 'inner.txt'), 'content');

    await service.deleteStagingDirectory(runId);

    const exists = await service.fileExists(path.join(stagingPath, runId));
    expect(exists).toBe(false);
  });

  it('does not throw when the directory does not exist', async () => {
    await expect(
      service.deleteStagingDirectory('run-e3-ghost'),
    ).resolves.toBeUndefined();
  });

  it('does not throw when called twice on the same run id', async () => {
    const runId = 'run-e4';

    await service.createStagingDirectory(runId);
    await service.deleteStagingDirectory(runId);

    await expect(
      service.deleteStagingDirectory(runId),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fileExists (supporting utility used in tests above, smoke-tested here)
// ---------------------------------------------------------------------------

describe('fileExists', () => {
  it('returns true for a path that exists', async () => {
    const uploadId = 'upload-fe1';
    const filename = 'exists.txt';

    await service.writeStagingFile(uploadId, Buffer.from('x'), filename);
    const p = path.join(stagingPath, uploadId, filename);

    expect(await service.fileExists(p)).toBe(true);
  });

  it('returns false for a path that does not exist', async () => {
    const p = path.join(stagingPath, 'no-such-dir', 'no-such-file.txt');

    expect(await service.fileExists(p)).toBe(false);
  });
});
