# Dependency Composition Pattern

## What Is This Pattern?

The dependency composition pattern is a structured approach to dependency injection where:

- **Services** are instantiated once at application startup
- **Route handlers** are functions that receive services as parameters and return configured routers
- **Composition** happens at the top level (main.ts/main.py) where routes are assembled with their dependencies
- **Testing** becomes straightforward by injecting mock services into route handlers
- **MCP wrapping** becomes possible because services are decoupled from HTTP routing logic

This pattern avoids:

- Global singletons in route handlers (harder to test)
- Service creation inside route handlers (creates multiple instances)
- Tight coupling between HTTP layer and business logic
- Difficulty wrapping the same services in an MCP (Model Context Protocol) server

## Why This Matters

Institutional Knowledge has three deployment targets:

1. **Express HTTP service** (backend API)
2. **FastAPI HTTP service** (processing pipeline admin)
3. **MCP server** (Claude Code integration for query/analysis)

All three targets need the same underlying services (database, storage, embeddings, vector store, graph store). The composition pattern allows us to:

- Write services once, use them in both HTTP and MCP contexts
- Test each service independently or in integration
- Switch implementations (local vs cloud storage, PostgreSQL vs Neo4j) via configuration
- Avoid duplicating business logic across deployment contexts

## TypeScript Pattern

### Core Concept

Services are created in main.ts. Route handlers are functions that take services as parameters and return Express routers. Routes are assembled at the top level.

### Structure

```typescript
// File: services/index.ts
// All service instances are created and exported from one place

import { config } from '../config';
import { DatabaseService } from './database';
import { StorageService, createStorageService } from './storage';
import { VectorStoreService, createVectorStoreService } from './vector-store';
import { GraphStoreService, createGraphStoreService } from './graph-store';

export interface Services {
  database: DatabaseService;
  storage: StorageService;
  vectorStore: VectorStoreService;
  graphStore: GraphStoreService;
}

export async function createServices(): Promise<Services> {
  // Initialize services in dependency order
  const database = new DatabaseService(config.dbConfig);
  await database.connect();

  const storage = createStorageService();
  const vectorStore = createVectorStoreService();
  const graphStore = createGraphStoreService();

  return {
    database,
    storage,
    vectorStore,
    graphStore,
  };
}
```

### Route Handler Functions

Each route handler receives services as a parameter and returns a configured Express router:

```typescript
// File: routes/documents.ts

import { Router, Request, Response, NextFunction } from 'express';
import { Services } from '../services';

export function createDocumentRoutes(services: Services): Router {
  const router = Router();

  router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      const filename = file.originalname;

      // Use injected services
      const storageKey = await services.storage.uploadFile(file.buffer, filename);
      const doc = await services.database.insertDocument({
        filename,
        storageKey,
        uploadedAt: new Date(),
      });

      res.json({ id: doc.id, storageKey });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await services.database.getDocument(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(doc);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

### Query Route Handlers

```typescript
// File: routes/query.ts

import { Router, Request, Response, NextFunction } from 'express';
import { Services } from '../services';

export function createQueryRoutes(services: Services): Router {
  const router = Router();

  router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.body;

      // Embed the query using the injected vector store
      const embedding = await services.vectorStore.embed(query);

      // Search for similar chunks
      const results = await services.vectorStore.search(embedding, {
        topK: 10,
        minSimilarity: 0.75,
      });

      // Optionally enrich with graph data
      const enriched = await Promise.all(
        results.map(async (result) => {
          const entities = await services.graphStore.findEntitiesByChunk(result.chunkId);
          return { ...result, entities };
        })
      );

      res.json({ results: enriched });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

### Extracting Business Logic into Handler Functions

To ensure consistency between HTTP routes and MCP tools, extract the business logic into separate handler functions. Both HTTP endpoints and MCP tool calls invoke the same handler function, ensuring identical behavior.

**Pattern**: Separate concerns into three layers:

1. **Handler** — Pure business logic, takes parameters, returns result
2. **HTTP Route** — HTTP concerns (parsing request, sending response)
3. **MCP Tool** — MCP concerns (parsing tool arguments, formatting output)

**Example:**

```typescript
// File: handlers/query.ts
// Pure business logic — no HTTP or MCP concerns

import { Services } from '../services';

export interface SearchResult {
  chunkId: string;
  similarity: number;
  text: string;
  entities: string[];
}

export async function handleSearch(
  services: Services,
  query: string
): Promise<SearchResult[]> {
  // Embed the query
  const embedding = await services.vectorStore.embed(query);

  // Search for similar chunks
  const results = await services.vectorStore.search(embedding, {
    topK: 10,
    minSimilarity: 0.75,
  });

  // Enrich with graph data
  const enriched = await Promise.all(
    results.map(async (result) => {
      const entities = await services.graphStore.findEntitiesByChunk(result.chunkId);
      return {
        chunkId: result.chunkId,
        similarity: result.similarity,
        text: result.text,
        entities: entities.map((e) => e.name),
      };
    })
  );

  return enriched;
}

export async function handleUploadDocument(
  services: Services,
  filename: string,
  fileBuffer: Buffer
): Promise<{ id: string; storageKey: string }> {
  const storageKey = await services.storage.uploadFile(fileBuffer, filename);
  const doc = await services.database.insertDocument({
    filename,
    storageKey,
    uploadedAt: new Date(),
  });

  return { id: doc.id, storageKey };
}
```

**HTTP routes** call the handlers and format responses:

```typescript
// File: routes/query.ts

import { Router, Request, Response, NextFunction } from 'express';
import { Services } from '../services';
import { handleSearch } from '../handlers/query';

export function createQueryRoutes(services: Services): Router {
  const router = Router();

  router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.body;
      const results = await handleSearch(services, query);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

**MCP tools** call the same handlers:

```typescript
// File: mcp/server.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Services, createServices } from '../services';
import { handleSearch, handleUploadDocument } from '../handlers/query';

async function main() {
  const services = await createServices();
  const server = new Server({
    name: "institutional-knowledge",
    version: "1.0.0",
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "search_documents") {
        // Call the identical handler function
        const results = await handleSearch(services, args.query);
        return {
          content: [{ type: "text", text: JSON.stringify(results) }],
        };
      }

      if (name === "upload_document") {
        const result = await handleUploadDocument(
          services,
          args.filename,
          Buffer.from(args.content, 'base64')
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
```

**Key benefits of this pattern:**

- **Consistency**: HTTP routes and MCP tools call the same handler function — no logic duplication
- **Testability**: Handlers can be unit tested without HTTP or MCP concerns
- **Reusability**: Handlers can be called from CLI tools, background jobs, or other contexts
- **Maintainability**: Business logic changes are made in one place

### Top-Level Composition

Routes are composed together in main.ts:

```typescript
// File: main.ts

import express from 'express';
import { config } from './config';
import { createServices } from './services';
import { createDocumentRoutes } from './routes/documents';
import { createQueryRoutes } from './routes/query';

async function main() {
  // Create all services once
  const services = await createServices();

  // Create Express app
  const app = express();
  app.use(express.json());

  // Mount routes with injected services
  app.use('/api/documents', createDocumentRoutes(services));
  app.use('/api/query', createQueryRoutes(services));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  // Start server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

### Testing with Mocks

Because services are passed as parameters, testing is straightforward:

```typescript
// File: routes/documents.test.ts

import { createDocumentRoutes } from './documents';
import { Services } from '../services';

describe('Document Routes', () => {
  it('should upload a file', async () => {
    // Create mock services
    const mockServices: Services = {
      database: {
        insertDocument: jest.fn().mockResolvedValue({ id: '123' }),
      } as any,
      storage: {
        uploadFile: jest.fn().mockResolvedValue('s3://bucket/file.pdf'),
      } as any,
      vectorStore: {} as any,
      graphStore: {} as any,
    };

    // Create router with mocks
    const router = createDocumentRoutes(mockServices);

    // Test using supertest
    const response = await request(router)
      .post('/upload')
      .attach('file', Buffer.from('test'), 'test.pdf');

    expect(response.status).toBe(200);
    expect(mockServices.storage.uploadFile).toHaveBeenCalled();
    expect(mockServices.database.insertDocument).toHaveBeenCalled();
  });
});
```

## Python Pattern

### Core Concept

Services are created in a factory module. Route handlers receive services via dependency injection (e.g., FastAPI Depends or manual injection). Routes are composed in main.py.

### Structure

```python
# File: services/__init__.py
# All service instances are created and exported from one place

from config import config
from services.database import DatabaseService
from services.storage import create_storage_service
from services.vector_store import create_vector_store_service
from services.graph_store import create_graph_store_service

class Services:
    def __init__(
        self,
        database: DatabaseService,
        storage,
        vector_store,
        graph_store,
    ):
        self.database = database
        self.storage = storage
        self.vector_store = vector_store
        self.graph_store = graph_store

async def create_services() -> Services:
    """Create and initialize all services."""
    # Initialize in dependency order
    database = DatabaseService(config.db_config)
    await database.connect()

    storage = create_storage_service()
    vector_store = create_vector_store_service()
    graph_store = create_graph_store_service()

    return Services(database, storage, vector_store, graph_store)
```

### Route Handler Functions

Each route handler receives services (via FastAPI Depends) and returns configured routers:

```python
# File: routes/documents.py

from fastapi import APIRouter, UploadFile, File, HTTPException
from services import Services

def create_document_routes(services: Services) -> APIRouter:
    """Create document routes with injected services."""
    router = APIRouter(prefix="/documents", tags=["documents"])

    @router.post("/upload")
    async def upload_document(file: UploadFile = File(...)):
        """Upload a document."""
        try:
            # Read file content
            content = await file.read()

            # Use injected services
            storage_key = await services.storage.upload_file(content, file.filename)
            doc = await services.database.insert_document({
                "filename": file.filename,
                "storage_key": storage_key,
                "uploaded_at": datetime.utcnow(),
            })

            return {"id": doc["id"], "storage_key": storage_key}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{doc_id}")
    async def get_document(doc_id: str):
        """Retrieve a document."""
        try:
            doc = await services.database.get_document(doc_id)
            if not doc:
                raise HTTPException(status_code=404, detail="Document not found")
            return doc
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
```

### Query Route Handlers

```python
# File: routes/query.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import Services

class QueryRequest(BaseModel):
    query: str

def create_query_routes(services: Services) -> APIRouter:
    """Create query routes with injected services."""
    router = APIRouter(prefix="/query", tags=["query"])

    @router.post("/search")
    async def search(request: QueryRequest):
        """Search documents using vector similarity."""
        try:
            # Embed the query
            embedding = await services.vector_store.embed(request.query)

            # Search for similar chunks
            results = await services.vector_store.search(
                embedding,
                top_k=10,
                min_similarity=0.75,
            )

            # Optionally enrich with graph data
            enriched = []
            for result in results:
                entities = await services.graph_store.find_entities_by_chunk(result["chunk_id"])
                enriched.append({**result, "entities": entities})

            return {"results": enriched}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
```

### Extracting Business Logic into Handler Functions (Python)

Like the TypeScript pattern, extract business logic into separate handler functions that both FastAPI routes and MCP tools can call.

**Handler functions** — Pure business logic:

```python
# File: handlers/query.py

from typing import List, Dict, Any
from services import Services

async def handle_search(
    services: Services,
    query: str,
) -> List[Dict[str, Any]]:
    """Search documents using vector similarity."""
    # Embed the query
    embedding = await services.vector_store.embed(query)

    # Search for similar chunks
    results = await services.vector_store.search(
        embedding,
        top_k=10,
        min_similarity=0.75,
    )

    # Enrich with graph data
    enriched = []
    for result in results:
        entities = await services.graph_store.find_entities_by_chunk(result["chunk_id"])
        entity_names = [e["name"] for e in entities]
        enriched.append({
            "chunk_id": result["chunk_id"],
            "similarity": result["similarity"],
            "text": result["text"],
            "entities": entity_names,
        })

    return enriched


async def handle_upload_document(
    services: Services,
    filename: str,
    file_content: bytes,
) -> Dict[str, Any]:
    """Upload a document."""
    storage_key = await services.storage.upload_file(file_content, filename)
    doc = await services.database.insert_document({
        "filename": filename,
        "storage_key": storage_key,
        "uploaded_at": datetime.utcnow(),
    })

    return {"id": doc["id"], "storage_key": storage_key}
```

**FastAPI routes** call the handlers:

```python
# File: routes/query.py

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services import Services
from handlers.query import handle_search, handle_upload_document

class QueryRequest(BaseModel):
    query: str

def create_query_routes(services: Services) -> APIRouter:
    """Create query routes with injected services."""
    router = APIRouter(prefix="/query", tags=["query"])

    @router.post("/search")
    async def search(request: QueryRequest):
        """Search documents using vector similarity."""
        try:
            results = await handle_search(services, request.query)
            return {"results": results}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/upload")
    async def upload(file: UploadFile = File(...)):
        """Upload a document."""
        try:
            content = await file.read()
            result = await handle_upload_document(services, file.filename, content)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
```

**MCP tools** call the same handlers:

```python
# File: mcp/server.py

import json
from mcp.server import Server
from mcp.types import Tool, TextContent
from services import create_services, Services
from handlers.query import handle_search, handle_upload_document

async def run_mcp_server():
    """Run the MCP server."""
    services = await create_services()
    server = Server("estate-intelligence")

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> TextContent:
        """Handle MCP tool calls."""
        try:
            if name == "search_documents":
                # Call the identical handler function
                results = await handle_search(services, arguments["query"])
                return TextContent(type="text", text=json.dumps(results))

            elif name == "upload_document":
                # Call the identical handler function
                file_content = bytes.fromhex(arguments["content_hex"])
                result = await handle_upload_document(
                    services,
                    arguments["filename"],
                    file_content,
                )
                return TextContent(type="text", text=json.dumps(result))

            else:
                return TextContent(
                    type="text",
                    text=json.dumps({"error": f"Unknown tool: {name}"}),
                )
        except Exception as e:
            return TextContent(
                type="text",
                text=json.dumps({"error": str(e)}),
            )

    async with server:
        await server.wait()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_mcp_server())
```

**Key benefits** (same as TypeScript):

- **Consistency**: Both FastAPI routes and MCP tools call identical handler functions
- **Testability**: Handlers tested independently without HTTP/MCP concerns
- **Reusability**: Handlers callable from background jobs, CLI, or other contexts
- **Maintainability**: Business logic changes made once

### Top-Level Composition

Routes are composed together in main.py:

```python
# File: main.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
from services import create_services, Services
from routes.documents import create_document_routes
from routes.query import create_query_routes

# Global services instance
services: Services = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    global services
    services = await create_services()
    yield
    # Cleanup if needed
    await services.database.disconnect()

def main():
    """Create and run the FastAPI application."""
    app = FastAPI(lifespan=lifespan)

    # Mount routes with injected services
    app.include_router(create_document_routes(services))
    app.include_router(create_query_routes(services))

    # Health check
    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Run server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()
```

### Testing with Mocks

Testing is straightforward by injecting mock services:

```python
# File: routes/test_documents.py

import pytest
from unittest.mock import AsyncMock, MagicMock
from routes.documents import create_document_routes
from services import Services

@pytest.mark.asyncio
async def test_upload_document():
    """Test document upload."""
    # Create mock services
    mock_database = AsyncMock()
    mock_database.insert_document.return_value = {"id": "123"}

    mock_storage = AsyncMock()
    mock_storage.upload_file.return_value = "s3://bucket/file.pdf"

    mock_services = Services(
        database=mock_database,
        storage=mock_storage,
        vector_store=MagicMock(),
        graph_store=MagicMock(),
    )

    # Create router with mocks
    router = create_document_routes(mock_services)

    # Test using async client
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    response = client.post("/documents/upload", files={"file": ("test.pdf", b"content")})

    assert response.status_code == 200
    mock_storage.upload_file.assert_called_once()
    mock_database.insert_document.assert_called_once()
```

## MCP Server Wrapping

The same services can be wrapped in an MCP (Model Context Protocol) server without duplicating business logic:

### TypeScript MCP Server Example

```typescript
// File: mcp/server.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Services, createServices } from '../services';

async function main() {
  // Create services once
  const services = await createServices();

  // Create MCP server
  const server = new Server({
    name: "institutional-knowledge",
    version: "1.0.0",
  });

  // Add tools that use the injected services
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "search_documents") {
      const results = await services.vectorStore.search(args.embedding, {
        topK: args.topK,
      });
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    }

    if (name === "get_document") {
      const doc = await services.database.getDocument(args.docId);
      return { content: [{ type: "text", text: JSON.stringify(doc) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Connect stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
```

## Key Principles

### 1. Single Responsibility

Each route handler focuses on HTTP concerns (request/response). Services handle business logic.

### 2. Explicit Dependencies

Dependencies are explicit function parameters, not hidden global singletons or imports.

### 3. Testability

Because dependencies are passed in, tests inject mocks without modifying production code or using complicated mocking frameworks.

### 4. Composability

Services are created once at startup, then composed into multiple contexts (HTTP, MCP, CLI tools).

### 5. Configuration-Driven

Service implementation is determined by configuration, not hardcoded in route handlers.

## Common Patterns

### Nested Route Compositions

For larger applications, routes can be organized into modules:

```typescript
// TypeScript: File structure

src/
├── routes/
│   ├── index.ts              // Main composition point
│   ├── documents/
│   │   ├── index.ts          // createDocumentRoutes
│   │   ├── upload.ts         // Individual route handlers
│   │   └── retrieve.ts
│   ├── query/
│   │   ├── index.ts          // createQueryRoutes
│   │   └── search.ts
│   └── admin/
│       ├── index.ts          // createAdminRoutes
│       └── vocabulary.ts
```

```typescript
// File: routes/index.ts
export function createAllRoutes(services: Services): Router {
  const router = Router();
  router.use('/documents', createDocumentRoutes(services));
  router.use('/query', createQueryRoutes(services));
  router.use('/admin', createAdminRoutes(services));
  return router;
}

// File: main.ts
const services = await createServices();
app.use('/api', createAllRoutes(services));
```

### Partial Dependency Injection

Not every route handler needs all services. Use TypeScript interfaces to express which services each route needs:

```typescript
// File: routes/documents.ts

interface DocumentServices {
  database: DatabaseService;
  storage: StorageService;
}

export function createDocumentRoutes(services: DocumentServices): Router {
  // Only uses database and storage, not vector or graph services
}

// File: main.ts
const allServices = await createServices();
app.use('/api/documents', createDocumentRoutes({
  database: allServices.database,
  storage: allServices.storage,
}));
```

### Lazy-Loaded Services

For services that are expensive to initialize, use lazy loading with getters:

```typescript
// File: services/index.ts

export class LazyServices {
  private _vectorStore: VectorStoreService | null = null;

  get vectorStore(): VectorStoreService {
    if (!this._vectorStore) {
      this._vectorStore = createVectorStoreService();
    }
    return this._vectorStore;
  }
}
```

## Troubleshooting

### Issue: Services are created multiple times

**Symptom**: Each route handler creates new service instances, leading to multiple database connections or storage clients.

**Cause**: Services are created inside route handlers instead of at the top level.

**Solution**: Create services once in main.ts and pass the same instance to all route handlers.

### Issue: Cannot test a route handler

**Symptom**: Route handler depends on global services or hardcoded imports.

**Cause**: Services are not passed as parameters; they are imported directly.

**Solution**: Refactor to accept services as function parameters.

### Issue: Adding a new service breaks all route handlers

**Symptom**: After adding a new service (e.g., for caching), the Services interface must be updated everywhere.

**Cause**: Services interface is too tightly coupled to route handlers.

**Solution**: Use partial dependency injection (see "Partial Dependency Injection" section above) so routes only depend on the services they actually use.

## Further Reading

- **Express Dependency Injection**: [Dependency Injection in Express](https://docs.expressjs.com/) (official Express docs)
- **FastAPI Dependency Injection**: [FastAPI Dependency Injection](https://fastapi.tiangolo.com/tutorial/dependencies/) (official FastAPI docs)
- **MCP Protocol**: [Model Context Protocol](https://modelcontextprotocol.io/) (official MCP docs)
- **Composition Patterns**: Martin Fowler's [Inversion of Control Containers and the Dependency Injection pattern](https://www.martinfowler.com/articles/injection.html)

## Used By

- **Implementer agent**: When wiring up HTTP routes in Components 1 and 3
- **Senior Developer agents**: When designing service architecture for each component
- **Code Reviewer agent**: When validating that route handlers use injected services, not global singletons
- **Pair Programmer agent**: When implementing new route handlers

## Related Skills

- [configuration-patterns.md](configuration-patterns.md) — How services are configured at runtime
- [pipeline-testing-strategy.md](pipeline-testing-strategy.md) — How to test services and routes
