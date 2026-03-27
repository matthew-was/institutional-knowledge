# Upload API Reference

This document describes how to upload documents to the Institutional Knowledge backend.
It is written for both human use and as an AI-readable reference for agentic bulk upload
workflows.

---

## Base URL and authentication

The backend runs on **`http://localhost:4000`** (default; controlled by `server.port` in
`apps/backend/config.json5`).

All endpoints except `GET /api/health` require the header:

```http
x-internal-key: <value>
```

The value for local development is **`dev-frontend-key`** (the `auth.frontendKey` in
`apps/backend/config.json5`). Without this header every request returns `401`.

---

## Upload constraints

| Constraint | Value |
| --- | --- |
| Max file size | 50 MB |
| Accepted extensions | `.pdf`, `.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif` |

Files with other extensions are rejected at step 2 with HTTP 422 (`unsupported_extension`).

---

## Upload flow — three mandatory steps

Every document upload is a three-call sequence. All three must succeed for the document
to be permanently stored. If step 2 or step 3 fails, call the cleanup endpoint to remove
the orphaned record.

```text
Step 1 — Initiate    POST /api/documents/initiate            → uploadId
Step 2 — Upload      POST /api/documents/:uploadId/upload    → fileHash
Step 3 — Finalize    POST /api/documents/:uploadId/finalize  → documentId
Cleanup (on error)   DELETE /api/documents/:uploadId
```

---

### Step 1 — Initiate upload

**`POST /api/documents/initiate`**

Request body (JSON):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `filename` | string | yes | Original filename, e.g. `"1987-06-15 - wedding.jpg"` |
| `contentType` | string | yes | MIME type, e.g. `"image/jpeg"` |
| `fileSizeBytes` | integer | yes | Exact byte count of the file |
| `date` | string | yes | ISO date `"YYYY-MM-DD"`, or empty string `""` if unknown |
| `description` | string | yes | Human-readable description; must not be blank or whitespace only |

Success response — **HTTP 201**:

```json
{
  "uploadId": "01927c3a-5b2e-7000-8000-000000000001",
  "status": "initiated"
}
```

Error responses:

| HTTP | `errorType` | Cause |
| --- | --- | --- |
| 400 | `whitespace_description` | `description` is blank or whitespace only |
| 409 | `duplicate_detected` | A document with the same file hash already exists |

On `409 duplicate_detected` the body also contains an `existingRecord` object:

```json
{
  "existingRecord": {
    "documentId": "...",
    "description": "Wedding photograph",
    "date": "1987-06-15",
    "archiveReference": "1987-06-15 — Wedding photograph"
  }
}
```

---

### Step 2 — Upload file bytes

**`POST /api/documents/:uploadId/upload`**

Send the file as `multipart/form-data`. The field name must be **`file`**.

`:uploadId` is the UUID returned by step 1.

Success response — **HTTP 200**:

```json
{
  "uploadId": "01927c3a-5b2e-7000-8000-000000000001",
  "status": "uploaded",
  "fileHash": "d41d8cd98f00b204e9800998ecf8427e"
}
```

Error responses:

| HTTP | `errorType` / `error` | Cause |
| --- | --- | --- |
| 400 | `missing_file` | No `file` field in the multipart body |
| 404 | `not_found` | `uploadId` does not exist |
| 409 | `duplicate_detected` | Hash collision with an existing document |
| 422 | `unsupported_extension` | File extension not in the accepted list |
| 422 | `file_too_large` | File exceeds 50 MB |

---

### Step 3 — Finalize upload

**`POST /api/documents/:uploadId/finalize`**

No request body. `:uploadId` is the UUID from step 1.

Success response — **HTTP 200**:

```json
{
  "documentId": "01927c3a-5b2e-7000-8000-000000000001",
  "description": "Wedding photograph",
  "date": "1987-06-15",
  "archiveReference": "1987-06-15 — Wedding photograph",
  "status": "finalized"
}
```

Error responses:

| HTTP | `errorType` | Cause |
| --- | --- | --- |
| 404 | `not_found` | `uploadId` does not exist |
| 409 | `finalized_document` | Document has already been finalized |

---

### Cleanup — delete an incomplete upload

**`DELETE /api/documents/:uploadId`**

Call this if step 2 or step 3 fails, to remove the orphaned record and any staged file.

Success response — **HTTP 200**:

```json
{ "deleted": true }
```

Error responses:

| HTTP | `errorType` | Cause |
| --- | --- | --- |
| 404 | `not_found` | `uploadId` does not exist |

---

## Error envelope format

All error responses share this shape:

```json
{
  "error": "<errorType>",
  "message": "<human-readable description>"
}
```

---

## Filename-to-metadata convention

Archive filenames follow the pattern `YYYY-MM-DD - <description>.<ext>` (e.g.
`1987-06-15 - wedding.jpg`). When parsing a filename to populate the initiate request:

- If the stem matches `YYYY-MM-DD - <description>`: extract `date` and `description` from it.
- Otherwise: set `date` to `""` and use the full stem as `description`.

---

## MIME type mapping

| Extension | Content-Type |
| --- | --- |
| `.pdf` | `application/pdf` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.tiff`, `.tif` | `image/tiff` |

---

## Single-document upload algorithm

1. Read the file from disk.
2. Determine `filename`, `contentType`, `fileSizeBytes`, `date`, `description`.
   - Parse the filename stem using the convention above.
   - Map the extension to a MIME type using the table above.
3. `POST /api/documents/initiate` → `uploadId`.
   - On `409 duplicate_detected`: skip this file and log the existing `archiveReference`.
   - On any other error: abort.
4. `POST /api/documents/:uploadId/upload` (multipart, field name `file`).
   - On any error: `DELETE /api/documents/:uploadId`, then abort.
5. `POST /api/documents/:uploadId/finalize`.
   - On any error: `DELETE /api/documents/:uploadId`, then abort.
6. Record `documentId` and `archiveReference` from the finalize response.

---

## Bulk upload algorithm

1. List all files in the target directory (optionally recursive).
2. Filter to accepted extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif`.
3. For each file, run the single-document upload algorithm above.
4. Collect results into three buckets:
   - **success**: `{ file, documentId, archiveReference }`
   - **duplicate**: `{ file, existingArchiveReference }`
   - **error**: `{ file, step, errorType, message }`
5. Print a summary when all files are processed.

Process files sequentially by default. Parallel uploads are possible; suggested max
concurrency is 3 to avoid overwhelming the server.

---

## curl examples

**Health check (no auth required):**

```bash
curl http://localhost:4000/api/health
```

**Initiate upload:**

```bash
curl -s -X POST http://localhost:4000/api/documents/initiate \
  -H "x-internal-key: dev-frontend-key" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "1987-06-15 - wedding.jpg",
    "contentType": "image/jpeg",
    "fileSizeBytes": 204800,
    "date": "1987-06-15",
    "description": "Wedding photograph"
  }'
```

**Upload file bytes:**

```bash
curl -s -X POST "http://localhost:4000/api/documents/<uploadId>/upload" \
  -H "x-internal-key: dev-frontend-key" \
  -F "file=@/path/to/1987-06-15 - wedding.jpg"
```

**Finalize:**

```bash
curl -s -X POST "http://localhost:4000/api/documents/<uploadId>/finalize" \
  -H "x-internal-key: dev-frontend-key"
```

**Delete an incomplete upload:**

```bash
curl -s -X DELETE "http://localhost:4000/api/documents/<uploadId>" \
  -H "x-internal-key: dev-frontend-key"
```
