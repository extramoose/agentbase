import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

const ENTITY_TYPES = ['tasks'] as const

const UPDATABLE_FIELDS = {
  tasks: {
    title: { type: 'string' },
    body: { type: 'string' },
    status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'] },
    priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
    assignee_id: { type: 'string', description: 'UUID of assignee, or the literal string "unassigned" to clear. See /api/workspace/members for valid IDs.' },
    type: { type: 'string | null', enum: ['bug', 'improvement', 'feature'] },
    due_date: { type: 'date | null', description: 'ISO date string (YYYY-MM-DD)' },
    tags: { type: 'text[]' },
  },

}

const API_SCHEMA = {
  schema_version: '1.0.0',
  rate_limit: {
    max_requests: 60,
    window_seconds: 60,
    description: '60 requests per 60-second sliding window per actor. Returns 429 with Retry-After header when exceeded.',
  },
  errors: {
    format: '{ "success": false, "error": "message" }',
    description: 'All error responses return a JSON object with "success": false and an "error" string. HTTP status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error).',
  },
  id_conventions: {
    seq_id: 'Canonical sequential integer ID for display (e.g. Task #42). All entity types have a seq_id. Accepted by single-entity GET endpoints.',
    ticket_id: 'Alias for seq_id on tasks only (same value). Exists for backward compatibility.',
  },
  updatable_fields: UPDATABLE_FIELDS,
  endpoints: {
    commands: [
      {
        method: 'POST',
        path: '/api/commands/create-task',
        description: 'Create a new task',
        required_fields: {
          title: { type: 'string', description: 'Task title (1-500 chars)' },
          assignee_id: { type: 'string', description: 'UUID of assignee, or "unassigned". See /api/workspace/members for valid IDs.' },
        },
        optional_fields: {
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], default: 'medium' },
          status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'], default: 'todo' },
          body: { type: 'string', description: 'Task body/description' },
          type: { type: 'string | null', enum: ['bug', 'improvement', 'feature'] },
          tags: { type: 'string[]', default: '[]' },
          due_date: { type: 'string | null', description: 'ISO date string' },
          idempotency_key: { type: 'string', description: 'Unique key to prevent duplicate creation (max 128 chars)' },
        },
      },

      {
        method: 'PATCH',
        path: '/api/commands/update',
        description: 'Update fields on any entity. Send { table, id, fields } where table is the entity type, id is the UUID, and fields is a key-value map. See updatable_fields for allowed keys per table.',
        required_fields: {
          table: { type: 'string', enum: [...ENTITY_TYPES] },
          id: { type: 'string', description: 'UUID of the entity to update' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields for valid keys per table.' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/update-task',
        description: 'Alias for PATCH /api/commands/update with table pre-set to "tasks". Send { id, fields }.',
        required_fields: {
          id: { type: 'string', description: 'UUID of the task to update' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields.tasks for valid keys.' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/batch-update',
        description: 'Batch update fields on multiple entities of the same type',
        required_fields: {
          table: { type: 'string', enum: [...ENTITY_TYPES] },
          ids: { type: 'string[]', description: 'Array of UUIDs (1-100)' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields for valid keys per table.' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/delete-entity',
        description: 'Delete an entity. Hard delete for tasks. Agents cannot delete tasks (403).',
        required_fields: {
          table: { type: 'string', enum: [...ENTITY_TYPES] },
          id: { type: 'string', description: 'UUID of the entity to delete' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/delete-task',
        description: 'Alias for POST /api/commands/delete-entity with table pre-set to "tasks". Hard delete. Agents receive 403.',
        required_fields: {
          id: { type: 'string', description: 'UUID of the task to delete' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/add-comment',
        description: 'Add a comment to an entity\'s activity log',
        required_fields: {
          entity_type: { type: 'string', description: 'Entity table name' },
          entity_id: { type: 'string', description: 'UUID of the entity' },
          body: { type: 'string', description: 'Comment text (1-10000 chars)' },
        },
        optional_fields: {
          entity_label: { type: 'string', description: 'Display label for the entity' },
        },
      },
      {
        method: 'POST',
        path: '/api/commands/create-entity-link',
        description: 'Create a bidirectional link between two entities',
        required_fields: {
          source_type: { type: 'string', enum: [...ENTITY_TYPES] },
          source_id: { type: 'string', description: 'UUID of the source entity' },
          target_type: { type: 'string', enum: [...ENTITY_TYPES] },
          target_id: { type: 'string', description: 'UUID of the target entity' },
        },
        optional_fields: {},
      },
      {
        method: 'DELETE',
        path: '/api/commands/delete-entity-link',
        description: 'Delete a bidirectional link between two entities',
        required_fields: {
          source_type: { type: 'string', enum: [...ENTITY_TYPES] },
          source_id: { type: 'string', description: 'UUID of the source entity' },
          target_type: { type: 'string', enum: [...ENTITY_TYPES] },
          target_id: { type: 'string', description: 'UUID of the target entity' },
        },
        optional_fields: {},
      },
    ],
    read: [
      {
        method: 'GET',
        path: '/api/tasks',
        description: 'List tasks with optional filtering, search, and pagination',
        required_fields: {},
        optional_fields: {
          page: { type: 'number', default: '1', description: '1-based page number' },
          limit: { type: 'number', default: '50', description: 'Items per page (max 200)' },
          q: { type: 'string', description: 'Search query (searches title, body)' },
          status: { type: 'string', description: 'Filter by status (comma-separated for multiple)', enum: ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'] },
          priority: { type: 'string', description: 'Filter by priority (comma-separated for multiple)', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
          assignee_id: { type: 'string', description: 'Filter by assignee UUID' },
          type: { type: 'string', description: 'Filter by type', enum: ['bug', 'improvement', 'feature'] },
          tag: { type: 'string', description: 'Filter by tag (exact match)' },
          include: { type: 'string', description: 'Comma-separated includes. "activity" embeds activity array (only when ≤ 20 results)' },
        },
      },
      {
        method: 'GET',
        path: '/api/tasks/:id',
        description: 'Get a single task by UUID or seq_id',
        required_fields: {
          id: { type: 'string', description: 'UUID or sequential ID (path param)' },
        },
        optional_fields: {},
      },

      {
        method: 'GET',
        path: '/api/activity',
        description: 'Get activity log for a specific entity',
        required_fields: {
          entity_type: { type: 'string', description: 'Entity table name (query param)' },
          entity_id: { type: 'string', description: 'UUID of the entity (query param)' },
        },
        optional_fields: {
          limit: { type: 'number', default: '50', description: 'Max items (max 200)' },
          offset: { type: 'number', default: '0' },
          event_type: { type: 'string', description: 'Filter by event type' },
        },
      },
      {
        method: 'GET',
        path: '/api/activity/recent',
        description: 'Get recent global activity across all entities',
        required_fields: {},
        optional_fields: {
          limit: { type: 'number', default: '50', description: 'Max items (max 200)' },
          offset: { type: 'number', default: '0' },
        },
      },
      {
        method: 'GET',
        path: '/api/search',
        description: 'Cross-entity full-text search',
        required_fields: {
          q: { type: 'string', description: 'Search query (query param)' },
        },
        optional_fields: {
          limit: { type: 'number', default: '10', description: 'Max results per entity type (max 200)' },
          types: { type: 'string', description: 'Comma-separated entity types to search', enum: ['tasks'] },
        },
      },
      {
        method: 'GET',
        path: '/api/entities/recent',
        description: 'Get recently updated entities across all types (top 8)',
        required_fields: {},
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/entity-links',
        description: 'List entity links for a given source entity',
        required_fields: {
          sourceType: { type: 'string', description: 'Source entity table name (query param)' },
          sourceId: { type: 'string', description: 'UUID of the source entity (query param)' },
        },
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/workspace/members',
        description: 'List all workspace members (humans and agents). Use this to get valid assignee IDs for task creation.',
        required_fields: {},
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/tags',
        description: 'List all tags in use across all entity types with counts',
        required_fields: {},
        optional_fields: {},
      },
    ],
  },
}

export async function GET(request: Request) {
  try {
    await resolveActorUnified(request)
    return Response.json(API_SCHEMA)
  } catch (err) {
    return apiError(err)
  }
}
