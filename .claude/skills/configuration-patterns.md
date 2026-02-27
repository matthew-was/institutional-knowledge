# Configuration Patterns

## When to use

Use this skill when:

- Defining a new external service abstraction (storage, OCR, LLM, embedding, vector store, graph store)
- Setting up configuration loading and validation at application startup
- Wiring a factory function to select a concrete provider from config
- Configuring Docker runtime overrides

Read this skill before writing any service interface or factory. All other C2 and C3 skills assume you have read it.

---

## Overview

This skill encodes the **Infrastructure as Configuration** principle in implementation terms. Every external service — storage, database, OCR engine, LLM provider, embedding service, vector database — is abstracted behind an interface. The concrete implementation is selected at runtime via configuration, not hardcoded.

This ensures:

- **No vendor lock-in**: switching from S3 to local filesystem requires only a config change, not code refactoring
- **Environment parity**: development uses local filesystem; staging uses S3; production uses cloud storage — all via the same code
- **Testability**: tests inject mock implementations
- **Clear contracts**: interfaces define what every implementation must provide

---

## Core Pattern

Every service follows this structure:

1. **Interface definition** — what the service must implement
2. **Concrete implementations** — specific providers (e.g., S3Adapter, LocalFilesystemAdapter)
3. **Factory/configuration loader** — selects the right implementation based on config at startup
4. **Dependency injection** — passes the selected implementation to code that needs it

---

## TypeScript/Node.js Pattern

### Technology Stack

- **Config loading & merging**: `nconf` (hierarchical layers: defaults → env vars → config file)
- **Schema validation & JSON schema generation**: `Zod` (define shape, validate, generate schema)

### Structure Example: StorageService

Let's define a storage service that can use either local filesystem or S3.

#### 1. Interface Definition

```typescript
// services/storage/types.ts
export interface StorageService {
  /**
   * Upload a file to storage
   * @param key - storage path (e.g., "documents/2024/deed.pdf")
   * @param buffer - file content
   * @returns URL where file can be retrieved
   */
  upload(key: string, buffer: Buffer): Promise<string>;

  /**
   * Download a file from storage
   * @param key - storage path
   * @returns file content
   */
  download(key: string): Promise<Buffer>;

  /**
   * Check if a file exists
   * @param key - storage path
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a file from storage
   * @param key - storage path
   */
  delete(key: string): Promise<void>;
}
```

**Notes:**

- The interface defines the contract without any implementation detail
- All methods are async (works for both local filesystem and cloud APIs)
- Return types are simple and serializable (URL strings, buffers, booleans)
- Documentation is part of the interface — every implementation must provide these guarantees

#### 2. Concrete Implementations

**Local Filesystem Adapter:**

```typescript
// services/storage/adapters/LocalFilesystemAdapter.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../types';

export class LocalFilesystemAdapter implements StorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async upload(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.basePath, key);
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return filePath; // local filesystem returns the file path
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return fs.readFile(filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await fs.unlink(filePath);
  }
}
```

**S3 Adapter (AWS SDK v3):**

```typescript
// services/storage/adapters/S3Adapter.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageService } from '../types';

export class S3Adapter implements StorageService {
  private client: S3Client;
  private bucket: string;
  private region: string;

  constructor(bucket: string, region: string) {
    this.bucket = bucket;
    this.region = region;
    this.client = new S3Client({ region });
  }

  async upload(key: string, buffer: Buffer): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      })
    );
    // Return S3 HTTPS URL
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    // S3 response.Body is a stream; convert to buffer
    return Buffer.from(await response.Body!.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}
```

**Notes on implementations:**

- Both implement the same interface but have completely different internals
- LocalFilesystemAdapter works with file paths; S3Adapter works with bucket/key names
- Error handling is simplified here for clarity; production code should wrap AWS SDK errors
- The interface hides these differences — calling code doesn't need to know which one is in use

#### 3. Configuration Schema (Zod)

```typescript
// config/schema.ts
import { z } from 'zod';

export const StorageConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('local'),
    basePath: z.string().describe('Filesystem path for storage'),
  }),
  z.object({
    provider: z.literal('s3'),
    bucket: z.string().describe('AWS S3 bucket name'),
    region: z.string().describe('AWS region'),
  }),
]);

export type StorageConfig = z.infer<typeof StorageConfigSchema>;
```

**Notes on Zod:**

- `z.discriminatedUnion` lets Zod know which fields are required based on the `provider` value
- `.describe()` adds human-readable descriptions for JSON schema generation
- `z.infer<typeof StorageConfigSchema>` extracts the TypeScript type automatically
- If config is invalid, `StorageConfigSchema.parse(config)` throws a detailed error

#### 4. Configuration File (JSON)

Base configuration file (built into Docker image):

```json
// config.json (in project root)
{
  "storage": {
    "provider": "local",
    "basePath": "./storage"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "institutional_knowledge"
  }
}
```

For production or environment-specific overrides, use a volume-mounted config file (see **Docker & Runtime Configuration** section below):

```json
// docker/config.override.json (volume-mounted at runtime)
{
  "storage": {
    "provider": "s3",
    "bucket": "institutional-knowledge-prod",
    "region": "us-east-1"
  },
  "database": {
    "host": "db.internal",
    "port": 5432,
    "name": "institutional_knowledge_prod"
  }
}
```

**Notes:**

- Base `config.json` is in the project root and built into the Docker image
- Override `config.override.json` is volume-mounted at `/etc/app/config.override.json` at runtime
- `nconf` merges both: base config is the foundation, override file provides environment-specific values
- Environment variables can override anything (e.g., `STORAGE_PROVIDER=s3`)
- See **Docker & Runtime Configuration** section for the complete setup pattern

#### 5. Factory & Runtime Selection

The factory uses the validated config singleton (created at app startup):

```typescript
// services/storage/factory.ts
import { StorageService } from './types';
import { LocalFilesystemAdapter } from './adapters/LocalFilesystemAdapter';
import { S3Adapter } from './adapters/S3Adapter';
import { config } from '../config';  // validated singleton

export function createStorageService(): StorageService {
  // Get already-validated storage config
  const storageConfig = config.storageConfig;

  // Instantiate the right implementation based on config
  switch (storageConfig.provider) {
    case 'local':
      return new LocalFilesystemAdapter(storageConfig.basePath);
    case 's3':
      return new S3Adapter(storageConfig.bucket, storageConfig.region);
    default:
      throw new Error(`Unknown storage provider: ${storageConfig.provider}`);
  }
}
```

**Notes:**

- Imports validated `config` singleton from `config/index.ts`
- Config was already validated when `config` object was created at app startup
- Factory doesn't perform validation — it just selects the right implementation
- If config was invalid, the app would have crashed at startup (before reaching this code)
- The factory function has all the import statements for adapters in one place; if a new adapter is added, update this file
- Calling code never imports adapters directly — only the factory and the interface

#### 6. Usage in Application Code

```typescript
// app.ts
import express from 'express';
import { createStorageService } from './services/storage/factory';

const app = express();
const storageService = createStorageService(); // selects implementation at startup

app.post('/upload', async (req, res) => {
  const file = req.file;
  const url = await storageService.upload(`documents/${file.originalname}`, file.buffer);
  res.json({ url });
});

app.get('/download/:key', async (req, res) => {
  const buffer = await storageService.download(req.params.key);
  res.send(buffer);
});
```

**Notes:**

- Application code references `StorageService` interface only
- It doesn't know if storage is local filesystem or S3
- Testing: inject a mock implementation instead of calling `createStorageService()`

---

## Python Pattern

### Technology Stack

- **Config loading & merging**: `dynaconf` (hierarchical layers: defaults → env vars → config file)
- **Schema validation & JSON schema generation**: `Pydantic` (dataclasses with validation)

### Structure Example: OCRService

Let's define an OCR service that can use either Tesseract (local) or Docling (API).

#### 1. Interface Definition (Abstract Base Class)

```python
# services/ocr/types.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class OCRResult:
    """Output from OCR processing"""
    text: str
    confidence: float  # 0.0 to 1.0
    extraction_method: str  # 'tesseract', 'docling', etc.

class OCRService(ABC):
    """Abstract interface for OCR services"""

    @abstractmethod
    def extract_text(self, file_path: str) -> OCRResult:
        """
        Extract text from a document.

        Args:
            file_path: Path to the document (PDF or image)

        Returns:
            OCRResult with extracted text and confidence

        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file format is unsupported
        """
        pass

    @abstractmethod
    def supports_file_type(self, file_extension: str) -> bool:
        """
        Check if this OCR service can handle a file type.

        Args:
            file_extension: e.g., '.pdf', '.png', '.jpg'

        Returns:
            True if the service can process this type
        """
        pass
```

**Notes on Python abstract base classes:**

- `ABC` (Abstract Base Class) and `@abstractmethod` ensure that subclasses implement required methods
- Dataclasses (like `OCRResult`) are Python's lightweight way to define data structures with type hints
- Documentation in docstrings is part of the contract
- Python doesn't have built-in interfaces like TypeScript; we use abstract base classes instead

#### 2. Concrete Implementations

**Tesseract Adapter (local OCR):**

```python
# services/ocr/adapters/tesseract_adapter.py
import pytesseract
from PIL import Image
from services.ocr.types import OCRService, OCRResult

class TesseractAdapter(OCRService):
    """Local OCR using Tesseract via pytesseract"""

    def __init__(self, languages: str = 'eng'):
        """
        Args:
            languages: Comma-separated language codes for Tesseract
                      (e.g., 'eng', 'eng,fra' for English and French)
        """
        self.languages = languages

    def extract_text(self, file_path: str) -> OCRResult:
        # Handle PDFs by converting to image first (simplified; production code
        # would use pdf2image or similar)
        if file_path.endswith('.pdf'):
            raise ValueError("TesseractAdapter does not handle PDFs directly. "
                           "Use Docling or convert to image first.")

        # For images, use Tesseract directly
        image = Image.open(file_path)

        # Extract text and confidence
        text = pytesseract.image_to_string(image, lang=self.languages)

        # Tesseract's confidence is per-character; compute average
        data = pytesseract.image_to_data(image, lang=self.languages, output_type='dict')
        confidences = [int(conf) / 100.0 for conf in data['confidence'] if int(conf) > 0]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        return OCRResult(
            text=text,
            confidence=avg_confidence,
            extraction_method='tesseract'
        )

    def supports_file_type(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']
```

**Mistral OCR Adapter (commercial API — illustrates the HTTP adapter pattern):**

This example shows what an adapter for a commercial OCR API looks like. In the real
implementation (ADR-011), Docling is used as a Python library (installed via pip), not as a
network service — so the real `DoclingAdapter` calls the Docling library directly rather than
making HTTP requests. This `MistralOCRAdapter` is a realistic illustration of the HTTP adapter
pattern for when you need a remote API provider.

```python
# services/ocr/adapters/mistral_ocr_adapter.py
import base64
import requests
from services.ocr.types import OCRService, OCRResult

class MistralOCRAdapter(OCRService):
    """OCR using the Mistral OCR API (https://docs.mistral.ai/api/endpoint/ocr).
    Illustrates the HTTP adapter pattern for commercial OCR providers."""

    API_URL = "https://api.mistral.ai/v1/ocr"
    MODEL = "mistral-ocr-latest"

    def __init__(self, api_key: str, timeout: int = 60):
        """
        Args:
            api_key: Mistral API key (loaded from config, never hardcoded)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.timeout = timeout

    def extract_text(self, file_path: str) -> OCRResult:
        # Encode file as base64 for the API
        with open(file_path, 'rb') as f:
            file_b64 = base64.b64encode(f.read()).decode('utf-8')

        # Determine document type from extension
        ext = file_path.rsplit('.', 1)[-1].lower()
        media_type = 'application/pdf' if ext == 'pdf' else f'image/{ext}'

        response = requests.post(
            self.API_URL,
            headers={
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': self.MODEL,
                'document': {
                    'type': 'document_url',
                    'document_url': f'data:{media_type};base64,{file_b64}',
                },
            },
            timeout=self.timeout,
        )

        if response.status_code != 200:
            raise ValueError(f"Mistral OCR API error {response.status_code}: {response.text}")

        result = response.json()

        # Concatenate text from all pages
        pages = result.get('pages', [])
        full_text = '\n\n'.join(page.get('markdown', '') for page in pages)

        # Mistral OCR does not return a confidence score; use 1.0 as a convention
        # for a successful API response (production code may derive this differently)
        return OCRResult(
            text=full_text,
            confidence=1.0,
            extraction_method='mistral-ocr',
        )

    def supports_file_type(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.pdf', '.png', '.jpg', '.jpeg', '.tiff']
```

**Notes on Python implementations:**

- Both inherit from `OCRService` abstract base class
- Type hints are used throughout (e.g., `file_path: str`, `-> OCRResult`)
- Docstrings explain what each method does, what arguments it takes, what it returns
- TesseractAdapter uses the `pytesseract` library (Python wrapper for Tesseract)
- MistralOCRAdapter makes HTTP requests to the Mistral OCR REST API — this is the pattern
  to follow for any commercial OCR provider
- The real `DoclingAdapter` (ADR-011) follows the same interface but calls the Docling
  Python library directly instead of making HTTP requests
- Error handling is simplified for clarity; production code should wrap API errors with
  more context and implement retries for transient failures

#### 3. Configuration Schema (Pydantic)

```python
# config/schema.py
from pydantic import BaseModel, Field
from typing import Literal, Union

class TesseractConfig(BaseModel):
    """Configuration for local Tesseract OCR"""
    provider: Literal['tesseract']
    languages: str = Field(default='eng', description='Comma-separated language codes')

class MistralOCRConfig(BaseModel):
    """Configuration for Mistral OCR API"""
    provider: Literal['mistral_ocr']
    api_key: str = Field(description='Mistral API key — load via environment variable, never hardcode')
    timeout: int = Field(default=60, description='Request timeout in seconds')

OCRConfig = Union[TesseractConfig, MistralOCRConfig]
```

**Notes on Pydantic:**

- `BaseModel` is the base class for all Pydantic models
- `Field()` adds metadata (descriptions for JSON schema, defaults, validation rules)
- `Literal['tesseract']` restricts the `provider` field to a single value — used for discriminated unions
- `Union[TesseractConfig, DoclingConfig]` means the config is either one or the other
- `.model_json_schema()` generates JSON schema automatically

To generate JSON schema:

```python
from config.schema import OCRConfig

schema = OCRConfig.model_json_schema()
print(schema)  # Outputs JSON schema for validation/documentation
```

#### 4. Configuration File (JSON)

Base configuration file (built into Docker image):

```json
// settings.json (in project root)
{
  "ocr": {
    "provider": "tesseract",
    "languages": "eng"
  },
  "database": {
    "url": "postgresql://localhost/institutional_knowledge"
  }
}
```

For production or environment-specific overrides, use a volume-mounted config file (see **Docker & Runtime Configuration** section below):

```json
// docker/settings.override.json (volume-mounted at runtime)
{
  "ocr": {
    "provider": "mistral_ocr",
    "timeout": 60
  },
  "database": {
    "url": "postgresql://db.internal/institutional_knowledge_prod"
  }
}
```

**Notes:**

- Base `settings.json` is in the project root and built into the Docker image
- Override `settings.override.json` is volume-mounted at runtime (same naming convention as TypeScript)
- Dynaconf automatically merges both: base config is the foundation, override file provides environment-specific values
- The `api_key` for Mistral OCR is sensitive — pass it via environment variable (`OCR__API_KEY=...`) rather than storing it in the config file
- Environment variables can override anything (e.g., `OCR__PROVIDER=mistral_ocr`)
- See **Docker & Runtime Configuration** section for the complete setup pattern

#### 5. Factory & Runtime Selection

The factory uses the validated config singleton (created at app startup):

```python
# services/ocr/factory.py
from services.ocr.types import OCRService
from services.ocr.adapters.tesseract_adapter import TesseractAdapter
from services.ocr.adapters.mistral_ocr_adapter import MistralOCRAdapter
from config import config  # validated singleton

def create_ocr_service() -> OCRService:
    """
    Create and return the configured OCR service.

    Returns:
        An OCRService instance (TesseractAdapter or MistralOCRAdapter)

    Raises:
        ValueError: If provider is unknown
    """
    # Get already-validated OCR config
    ocr_config = config.ocr_config

    # Instantiate the right implementation based on config
    if ocr_config.provider == 'tesseract':
        return TesseractAdapter(languages=ocr_config.languages)
    elif ocr_config.provider == 'mistral_ocr':
        return MistralOCRAdapter(api_key=ocr_config.api_key, timeout=ocr_config.timeout)
    else:
        raise ValueError(f"Unknown OCR provider: {ocr_config.provider}")
```

**Notes:**

- Imports validated `config` singleton from `config/__init__.py`
- Config was already validated when `config` object was created at app startup
- Factory doesn't perform validation — it just selects the right implementation
- If config was invalid, the app would have crashed at startup (before reaching this code)
- The factory has all the imports for adapters in one place; if a new adapter is added, update this file
- Calling code never imports adapters directly — only the factory and the interface

#### 6. Usage in Application Code

```python
# main.py
from fastapi import FastAPI, UploadFile, File
from services.ocr.factory import create_ocr_service

app = FastAPI()
ocr_service = create_ocr_service()  # selects implementation at startup

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    # Save temp file (FastAPI uploads are in-memory; OCR may need file path)
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
        tmp.write(await file.read())
        tmp.flush()

        # Call OCR service — doesn't matter if it's Tesseract or Docling
        result = ocr_service.extract_text(tmp.name)

        return {
            'text': result.text,
            'confidence': result.confidence,
            'method': result.extraction_method
        }
```

**Notes:**

- Application code references `OCRService` interface only
- Doesn't know if it's using Tesseract or Docling API
- Testing: inject a mock implementation with hardcoded results

---

## Key Principles

### 1. Interface First

Always define the interface before writing implementations. The interface is the contract — all implementations must satisfy it.

```typescript
// Good: interface defines what matters
export interface StorageService {
  upload(key: string, buffer: Buffer): Promise<string>;
}

// Bad: interface is too specific to one implementation
export interface S3StorageService {
  putObject(bucket: string, key: string, body: Buffer): Promise<PutObjectOutput>;
}
```

### 2. Configuration Over Code

If something is likely to differ between environments (local dev, staging, production), move it to configuration.

- ✅ Provider choice (local vs S3)
- ✅ API endpoints and credentials
- ✅ Timeouts and retry policies
- ❌ Core algorithm logic
- ❌ Data validation rules

### 3. Validation at the Boundary

Validate configuration at startup (when the factory is called), not later. This fails fast — if config is wrong, the application won't start.

```typescript
// Good: validate at factory time
const storageConfig = StorageConfigSchema.parse(rawConfig);
const service = new S3Adapter(...); // now we know config is valid

// Bad: validate lazily
const service = createStorageService(); // might fail on first request
```

### 4. Single Responsibility

Each adapter should focus on one external service. Don't mix concerns.

```typescript
// Good: S3Adapter handles only S3 logic
class S3Adapter implements StorageService {
  async upload(key: string, buffer: Buffer) {
    // Only S3 SDK calls here
  }
}

// Bad: mixing S3 logic with retry logic or caching
class S3Adapter implements StorageService {
  async upload(key: string, buffer: Buffer) {
    // S3 SDK call + retry logic + caching + logging
    // Too many responsibilities
  }
}
```

### 5. Test with Mocks

Don't test implementations against real external services. Create a mock implementation that implements the interface.

```typescript
// Mock for testing
class MockStorageAdapter implements StorageService {
  private store = new Map<string, Buffer>();

  async upload(key: string, buffer: Buffer): Promise<string> {
    this.store.set(key, buffer);
    return `mock://storage/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const buffer = this.store.get(key);
    if (!buffer) throw new Error(`Key not found: ${key}`);
    return buffer;
  }
  // ... etc
}

// In tests
const mockStorage = new MockStorageAdapter();
// Pass to code under test
await uploadDocument(mockStorage, documentContent);
```

---

## Adding a New Service

When you need to add a new abstraction (e.g., LLMService, EmbeddingService):

1. **Define the interface** (abstract base class in Python, interface in TypeScript)
   - Document all methods with expected inputs/outputs
   - Keep it small and focused

2. **Write one concrete implementation** (the one you'll use in Phase 1)
   - Use it to validate that the interface is sufficient
   - If the interface is missing something, update it

3. **Add configuration schema** (Zod in TypeScript, Pydantic in Python)
   - Include all fields needed by that implementation
   - Add descriptions for JSON schema

4. **Write the factory** (TypeScript) or factory function (Python)
   - Load config, validate it, instantiate the implementation
   - Make it easily extensible (switch statement or if/elif for new providers)

5. **Document it** in your component's design document
   - Link to this skill
   - Explain the interface
   - Justify why this service needs to be configurable

Example: if you're adding an LLMService, reference this skill and say: "Follows the Configuration Pattern; see `.claude/skills/configuration-patterns.md`"

---

## Troubleshooting

### "Configuration is invalid at startup"

**Symptom**: Application crashes on start with validation error

**Cause**: Config file has wrong structure or missing required field

**Fix:**

1. Check the JSON schema (run `OCRConfig.model_json_schema()` in Python or check Zod schema in TypeScript)
2. Compare your config file to the schema
3. Ensure all required fields are present
4. Check data types (strings vs numbers, etc.)

### "Wrong implementation was selected"

**Symptom**: Application uses S3 even though config says 'local'

**Cause**: Configuration layers are loading in wrong order or environment variable is overriding

**Fix:**

1. Add debug logging to factory: `console.log('Loaded config:', nconf.get())`
2. Check environment variables: `printenv | grep STORAGE`
3. Check which config files exist: `ls config/*.json`
4. Remember: command-line args > env vars > config file > defaults

### "Adapter throws 'Module not found'"

**Symptom**: Python imports fail with `ModuleNotFoundError`

**Cause**: Dependency not installed or virtual environment is wrong

**Fix:**

1. Install dependencies: `pip install -r requirements.txt`
2. Activate virtual environment: `source venv/bin/activate`
3. Check that module is listed in `requirements.txt`

---

## Docker & Runtime Configuration (TypeScript/Node.js)

When deploying the backend in Docker, configuration often needs to be injected at runtime rather than baked into the image at build time. This section covers the pattern for a validated singleton config class with volume-mounted overrides.

### Setup: Config Class

Create a `Config` class that loads and validates all configuration at startup:

```typescript
// config/index.ts
import nconf from 'nconf';
import JSON5 from 'json5';
import {
  StorageConfigSchema,
  StorageConfig,
  DatabaseConfigSchema,
  DatabaseConfig,
} from './schema';

// Load configuration layers (priority order)
nconf
  .argv()  // command-line args (highest priority)
  .env('__')  // environment variables with '__' separator (shell-friendly)
  .file('environment', {
    file: 'config.override.json',  // volume-mounted override
    format: JSON5,
  })
  .file('default', {
    file: 'config.json',  // base config (in project root)
    format: JSON5,
  });

// Singleton Config class — validates all configs at startup
export class Config {
  public readonly dbConfig: DatabaseConfig;
  public readonly storageConfig: StorageConfig;

  constructor() {
    // Validate each service config — fails fast if invalid
    this.dbConfig = DatabaseConfigSchema.parse(nconf.get('database'));
    this.storageConfig = StorageConfigSchema.parse(nconf.get('storage'));
  }
}

// Export singleton instance (created at module load time)
export const config = new Config();
```

**Notes:**

- nconf is loaded once at module import time, then wrapped in a class
- `env('__')` uses `__` as separator instead of `:` (shell scripts can't easily use colons in env var names)
- `JSON5` format allows comments and trailing commas in config files (more forgiving than strict JSON)
- `Config` constructor validates all configs and throws immediately if invalid
- `readonly` properties prevent accidental mutation
- Export singleton `config` instance for use throughout the app

### Docker Compose Example

```yaml
# docker-compose.yml
services:
  backend:
    build: ./apps/backend
    environment:
      NODE_ENV: production
    volumes:
      - ./docker/config.override.json:./config.override.json:ro
    ports:
      - "3000:8080"
```

**Notes:**

- `:ro` flag makes the mounted volume read-only (prevents accidental modification)
- `./docker/config.override.json` is on the host machine
- `./config.override.json` inside container is where the `Config` class looks for overrides
- Base `config.json` stays in the Docker image (built at image build time)
- Override file can be changed on the host without rebuilding the image
- Config class validates both files at startup; app fails fast if config is invalid

### Base Config Example

```json
// config.json (in project root, built into image)
{
  "server": {
    "port": 3000
  },
  "storage": {
    "provider": "local",
    "basePath": "./storage"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "institutional_knowledge"
  }
}
```

### Override Config Example

```json
// docker/config.override.json (volume-mounted at runtime)
{
  "storage": {
    "provider": "s3",
    "bucket": "institutional-knowledge-prod",
    "region": "us-east-1"
  },
  "database": {
    "host": "db.internal",
    "port": 5432,
    "name": "institutional_knowledge_prod"
  }
}
```

**Notes:**

- Override file only specifies what's different from base config
- nconf merges both: base + override = final config
- Fields not in override keep base config values
- Allows environment-specific config (dev image vs prod override) without rebuilding

### Usage in Application

```typescript
// app.ts
import express from 'express';
import { config } from './config';  // Config singleton — loaded and validated at import time
import { createStorageService } from './services/storage/factory';
import { createDatabaseConnection } from './services/database/factory';

const app = express();

// Config is already validated by the time we reach here
// If config was invalid, the app would have crashed during module import

const storageService = createStorageService();
const db = createDatabaseConnection(config.dbConfig);

app.listen(3000, () => {
  console.log('Server running');
});
```

**Notes:**

- Import `config` singleton at the top — validation happens during module load
- If any config is invalid, constructor throws and app crashes (fail-fast)
- Factories receive validated config objects with strong types
- No need to check for undefined values — Zod guarantees all required fields exist
- All config is immutable (properties are `readonly`)

### Benefits of This Pattern

- **Runtime flexibility**: Change config without rebuilding the Docker image
- **Security**: Sensitive values (API keys, database passwords) in override file, not in version control
- **Environment parity**: Same image deployed to dev/staging/prod with different override files
- **Validation**: Use Zod to validate final merged config at startup (fails fast if config is wrong)

---

## Docker & Runtime Configuration (Python)

When deploying the processing pipeline in Docker, configuration often needs to be injected at runtime rather than baked into the image at build time. This section covers the pattern for a validated singleton config class with dynaconf and volume-mounted overrides.

### Setup: Config Class

Create a `Config` class that loads and validates all configuration at startup:

```python
# config/__init__.py
from dynaconf import Dynaconf
from config.schema import OCRConfigSchema, DatabaseConfigSchema

# Load configuration layers (priority order)
# Dynaconf automatically loads:
# 1. settings.json (base config in project root)
# 2. settings.override.json (volume-mounted override at runtime, if exists)
# 3. Environment variables (with DYNACONF_ prefix)
settings = Dynaconf(
    envvar_prefix='DYNACONF',
    settings_files=['settings.json', 'settings.override.json'],
)

# Singleton Config class — validates all configs at startup
class Config:
    def __init__(self):
        # Validate each service config — fails fast if invalid
        raw_ocr = settings.get('ocr', {})
        raw_database = settings.get('database', {})

        self.ocr_config = OCRConfigSchema.parse_obj(raw_ocr)
        self.database_config = DatabaseConfigSchema.parse_obj(raw_database)

# Export singleton instance (created at module load time)
config = Config()
```

**Notes:**

- Dynaconf loads configuration layers in order and merges them
- `settings_files` list specifies files to load; if a file doesn't exist, Dynaconf skips it gracefully
- Environment variables with `DYNACONF_` prefix can override any setting
- `Config` constructor validates all configs and throws immediately if invalid
- Export singleton `config` instance for use throughout the app

### Docker Compose Example

```yaml
# docker-compose.yml
services:
  processing:
    build: ./services/processing
    environment:
      DYNACONF_PROFILE: production
    volumes:
      - ./docker/settings.override.json:./settings.override.json:ro
    networks:
      - estate-network
```

**Notes:**

- `:ro` flag makes the mounted volume read-only (prevents accidental modification)
- `./docker/settings.override.json` is on the host machine
- `./settings.override.json` inside container is where Dynaconf looks for overrides
- Base `settings.json` stays in the Docker image (built at image build time)
- Override file can be changed on the host without rebuilding the image
- Config class validates both files at startup; app fails fast if config is invalid

### Base Config Example

```json
// settings.json (in project root, built into image)
{
  "ocr": {
    "provider": "tesseract",
    "languages": "eng"
  },
  "database": {
    "url": "postgresql://localhost/institutional_knowledge"
  }
}
```

### Override Config Example

```json
// docker/settings.override.json (volume-mounted at runtime)
{
  "ocr": {
    "provider": "mistral_ocr",
    "timeout": 60
  },
  "database": {
    "url": "postgresql://db.internal/institutional_knowledge_prod"
  }
}
```

**Notes:**

- Override file only specifies what's different from base config
- Dynaconf merges both: base config is the foundation, override file provides environment-specific values
- Fields not in override keep base config values
- Allows environment-specific config (dev image vs prod override) without rebuilding

### Usage in Application

```python
# main.py
from config import config
from services.ocr.factory import create_ocr_service
from services.database.factory import create_database_connection

# Config is already validated by the time we reach here
# If config was invalid, the app would have crashed during module import

ocr_service = create_ocr_service()
db = create_database_connection(config.database_config)

# Process documents...
```

**Notes:**

- Import `config` singleton at the top — validation happens during module load
- If any config is invalid, constructor throws and app crashes (fail-fast)
- Factories receive validated config objects with strong types
- No need to check for None values — Pydantic guarantees all required fields exist
- All config is read-only (access via properties)

### Benefits of This Pattern

- **Runtime flexibility**: Change config without rebuilding the Docker image
- **Security**: Sensitive values (database URLs, API keys) in override file, not in version control
- **Environment parity**: Same image deployed to dev/staging/prod with different override files
- **Validation**: Use Pydantic to validate final merged config at startup (fails fast if config is wrong)
- **Consistency**: Same pattern as TypeScript backend (`config.json` + `config.override.json`)

---

## Further Reading

**TypeScript/Node.js:**

- [nconf documentation](https://github.com/indexzero/nconf)
- [Zod documentation](https://zod.dev/)
- [AWS SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/latest/developer-guide/)

**Python:**

- [Dynaconf documentation](https://www.dynaconf.com/)
- [Pydantic documentation](https://docs.pydantic.dev/)
- [Abstract base classes](https://docs.python.org/3/library/abc.html)
- [FastAPI dependency injection](https://fastapi.tiangolo.com/tutorial/dependencies/)
