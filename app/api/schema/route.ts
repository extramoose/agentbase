import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

const ENTITY_TYPES = ['tasks', 'library_items', 'companies', 'people', 'deals'] as const

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
  library_items: {
    title: { type: 'string' },
    body: { type: 'string' },
    type: { type: 'string', enum: ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] },
    url: { type: 'string' },
    source: { type: 'string' },
    excerpt: { type: 'string' },
    location_name: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    is_public: { type: 'boolean' },
    tags: { type: 'text[]' },
  },
  companies: {
    name: { type: 'string' },
    domain: { type: 'string' },
    industry: { type: 'string' },
    notes: { type: 'string' },
    website: { type: 'string' },
    linkedin: { type: 'string' },
    twitter: { type: 'string' },
    instagram: { type: 'string' },
    location: { type: 'string' },
    source: { type: 'string' },
    tags: { type: 'text[]' },
  },
  people: {
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    title: { type: 'string' },
    notes: { type: 'string' },
    emails: { type: 'jsonb', description: 'Array of {label, value} objects' },
    phones: { type: 'jsonb', description: 'Array of {label, value} objects' },
    linkedin: { type: 'string' },
    twitter: { type: 'string' },
    instagram: { type: 'string' },
    source: { type: 'string' },
    tags: { type: 'text[]' },
  },
  deals: {
    title: { type: 'string' },
    status: { type: 'string', enum: ['prospect', 'active', 'won', 'lost'] },
    value: { type: 'number' },
    notes: { type: 'string' },
    follow_up_date: { type: 'date | null', description: 'ISO date string (YYYY-MM-DD)' },
    source: { type: 'string' },
    primary_contact_id: { type: 'string | null', description: 'UUID of primary contact (person)' },
    expected_close_date: { type: 'date | null', description: 'ISO date string (YYYY-MM-DD)' },
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
        method: 'POST',
        path: '/api/commands/create-library-item',
        description: 'Create a new library item',
        required_fields: {
          type: { type: 'string', enum: ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] },
          title: { type: 'string', description: 'Item title (1-500 chars)' },
        },
        optional_fields: {
          url: { type: 'string | null' },
          source: { type: 'string | null' },
          excerpt: { type: 'string | null' },
          body: { type: 'string | null' },
          location_name: { type: 'string | null' },
          latitude: { type: 'number | null' },
          longitude: { type: 'number | null' },
          tags: { type: 'string[]', default: '[]' },
          is_public: { type: 'boolean', default: 'false' },
          idempotency_key: { type: 'string', description: 'Max 128 chars' },
        },
      },
      {
        method: 'POST',
        path: '/api/commands/create-person',
        description: 'Create a new person (CRM contact)',
        required_fields: {
          name: { type: 'string', description: 'Person name (1-500 chars)' },
        },
        optional_fields: {
          email: { type: 'string' },
          phone: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          tags: { type: 'string[]', default: '[]' },
          idempotency_key: { type: 'string', description: 'Max 128 chars' },
          emails: { type: 'array', description: 'Array of {label, value} objects for multiple emails' },
          phones: { type: 'array', description: 'Array of {label, value} objects for multiple phones' },
          linkedin: { type: 'string', description: 'LinkedIn URL' },
          twitter: { type: 'string', description: 'Twitter/X handle or URL' },
          instagram: { type: 'string', description: 'Instagram handle or URL' },
          source: { type: 'string', description: 'How you met (e.g. referral, cold outreach, event)' },
        },
      },
      {
        method: 'POST',
        path: '/api/commands/create-company',
        description: 'Create a new company',
        required_fields: {
          name: { type: 'string', description: 'Company name (1-500 chars)' },
        },
        optional_fields: {
          domain: { type: 'string' },
          industry: { type: 'string' },
          notes: { type: 'string' },
          tags: { type: 'string[]', default: '[]' },
          idempotency_key: { type: 'string', description: 'Max 128 chars' },
          website: { type: 'string', description: 'Company website URL' },
          linkedin: { type: 'string', description: 'LinkedIn URL' },
          twitter: { type: 'string', description: 'Twitter/X handle or URL' },
          instagram: { type: 'string', description: 'Instagram handle or URL' },
          location: { type: 'string', description: 'City/region/HQ location' },
          source: { type: 'string', description: 'Lead source' },
        },
      },
      {
        method: 'POST',
        path: '/api/commands/create-deal',
        description: 'Create a new deal',
        required_fields: {
          title: { type: 'string', description: 'Deal title (1-500 chars)' },
        },
        optional_fields: {
          status: { type: 'string', enum: ['prospect', 'active', 'won', 'lost'], default: 'prospect' },
          value: { type: 'number | null' },
          notes: { type: 'string' },
          tags: { type: 'string[]', default: '[]' },
          idempotency_key: { type: 'string', description: 'Max 128 chars' },
          follow_up_date: { type: 'string | null', description: 'ISO date for next follow-up' },
          source: { type: 'string', description: 'Deal source (referral, cold, event, inbound)' },
          primary_contact_id: { type: 'string | null', description: 'UUID of primary contact (person)' },
          expected_close_date: { type: 'string | null', description: 'ISO date for expected close' },
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
        path: '/api/commands/update-company',
        description: 'Alias for PATCH /api/commands/update with table pre-set to "companies". Send { id, fields }.',
        required_fields: {
          id: { type: 'string', description: 'UUID of the company to update' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields.companies for valid keys.' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/update-person',
        description: 'Alias for PATCH /api/commands/update with table pre-set to "people". Send { id, fields }.',
        required_fields: {
          id: { type: 'string', description: 'UUID of the person to update' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields.people for valid keys.' },
        },
        optional_fields: {},
      },
      {
        method: 'POST',
        path: '/api/commands/update-deal',
        description: 'Alias for PATCH /api/commands/update with table pre-set to "deals". Send { id, fields }.',
        required_fields: {
          id: { type: 'string', description: 'UUID of the deal to update' },
          fields: { type: 'object', description: 'Key-value map of fields to update. See updatable_fields.deals for valid keys.' },
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
        description: 'Delete an entity. Humans only — agents receive 403 Forbidden.',
        required_fields: {
          table: { type: 'string', enum: [...ENTITY_TYPES] },
          id: { type: 'string', description: 'UUID of the entity to delete' },
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
        path: '/api/library',
        description: 'List library items with optional filtering, search, and pagination',
        required_fields: {},
        optional_fields: {
          page: { type: 'number', default: '1', description: '1-based page number' },
          limit: { type: 'number', default: '50', description: 'Items per page (max 200)' },
          q: { type: 'string', description: 'Search query (searches name, notes, url)' },
          type: { type: 'string', description: 'Filter by type', enum: ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] },
          tag: { type: 'string', description: 'Filter by tag (exact match)' },
        },
      },
      {
        method: 'GET',
        path: '/api/library/:id',
        description: 'Get a single library item by UUID or seq_id',
        required_fields: {
          id: { type: 'string', description: 'UUID or sequential ID (path param)' },
        },
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/crm/companies',
        description: 'List companies with optional search and pagination',
        required_fields: {},
        optional_fields: {
          page: { type: 'number', default: '1', description: '1-based page number' },
          limit: { type: 'number', default: '50', description: 'Items per page (max 200)' },
          q: { type: 'string', description: 'Search query (searches name, website, notes)' },
          tag: { type: 'string', description: 'Filter by tag (exact match)' },
        },
      },
      {
        method: 'GET',
        path: '/api/crm/companies/:id',
        description: 'Get a single company by UUID or seq_id',
        required_fields: {
          id: { type: 'string', description: 'UUID or sequential ID (path param)' },
        },
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/crm/people',
        description: 'List people with optional search and pagination',
        required_fields: {},
        optional_fields: {
          page: { type: 'number', default: '1', description: '1-based page number' },
          limit: { type: 'number', default: '50', description: 'Items per page (max 200)' },
          q: { type: 'string', description: 'Search query (searches name, email, title, notes)' },
          tag: { type: 'string', description: 'Filter by tag (exact match)' },
        },
      },
      {
        method: 'GET',
        path: '/api/crm/people/:id',
        description: 'Get a single person by UUID or seq_id',
        required_fields: {
          id: { type: 'string', description: 'UUID or sequential ID (path param)' },
        },
        optional_fields: {},
      },
      {
        method: 'GET',
        path: '/api/crm/deals',
        description: 'List deals with optional search and pagination',
        required_fields: {},
        optional_fields: {
          page: { type: 'number', default: '1', description: '1-based page number' },
          limit: { type: 'number', default: '50', description: 'Items per page (max 200)' },
          q: { type: 'string', description: 'Search query (searches title, notes)' },
          tag: { type: 'string', description: 'Filter by tag (exact match)' },
        },
      },
      {
        method: 'GET',
        path: '/api/crm/deals/:id',
        description: 'Get a single deal by UUID or seq_id',
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
          types: { type: 'string', description: 'Comma-separated entity types to search', enum: ['tasks', 'people', 'companies', 'deals', 'library'] },
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
