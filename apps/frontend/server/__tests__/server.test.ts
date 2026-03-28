import { describe, expect, it } from 'vitest';
import { createTestRequest, testConfig } from './testHelpers';

const { request } = createTestRequest();

describe('Hono server', () => {
  it('smoke: POST /api/documents/upload returns 400 when body is empty', async () => {
    const res = await request.post('/api/documents/upload');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_input' });
  });

  it('security: x-internal-key value does not appear in any response header', async () => {
    const res = await request.post('/api/documents/upload');
    const headerValues = Object.values(res.headers).join('\n');
    expect(headerValues).not.toContain(testConfig.express.internalKey);
  });

  it('auth no-op: requests without an auth header are not rejected', async () => {
    const res = await request
      .post('/api/documents/upload')
      // No x-internal-key or Authorization header
      .set({});
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
