/**
 * PostgresGraphStore — Phase 1 PostgreSQL implementation of GraphStore.
 *
 * Implemented in Task 6. This stub satisfies the interface contract so that
 * the application compiles in Task 1.
 */

import type { KnexInstance } from "../db/index.js";
import type {
	DocumentReference,
	GraphEntity,
	GraphRelationship,
	GraphStore,
	TraversalResult,
} from "./types.js";

export class PostgresGraphStore implements GraphStore {
	constructor(private readonly knex: KnexInstance) {}

	async writeEntity(_entity: GraphEntity): Promise<void> {
		throw new Error(
			"PostgresGraphStore.writeEntity: not yet implemented (Task 6)",
		);
	}

	async writeRelationship(_relationship: GraphRelationship): Promise<void> {
		throw new Error(
			"PostgresGraphStore.writeRelationship: not yet implemented (Task 6)",
		);
	}

	async getEntity(_entityId: string): Promise<GraphEntity | null> {
		throw new Error(
			"PostgresGraphStore.getEntity: not yet implemented (Task 6)",
		);
	}

	async getRelationships(
		_entityId: string,
		_direction?: "outgoing" | "incoming" | "both",
	): Promise<GraphRelationship[]> {
		throw new Error(
			"PostgresGraphStore.getRelationships: not yet implemented (Task 6)",
		);
	}

	async traverse(
		_startEntityId: string,
		_maxDepth: number,
		_relationshipTypes?: string[],
	): Promise<TraversalResult> {
		throw new Error(
			"PostgresGraphStore.traverse: not yet implemented (Task 6)",
		);
	}

	async findEntitiesByType(_entityType: string): Promise<GraphEntity[]> {
		throw new Error(
			"PostgresGraphStore.findEntitiesByType: not yet implemented (Task 6)",
		);
	}

	async findDocumentsByEntity(_entityId: string): Promise<DocumentReference[]> {
		throw new Error(
			"PostgresGraphStore.findDocumentsByEntity: not yet implemented (Task 6)",
		);
	}
}

/**
 * Factory: create a GraphStore from the graph config block.
 */
export function createGraphStore(
	provider: string,
	knex: KnexInstance,
): GraphStore {
	if (provider === "postgresql") {
		return new PostgresGraphStore(knex);
	}
	throw new Error(`Unknown graph provider: ${provider}`);
}
