import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const labelValueArray = z.array(z.object({ label: z.string(), value: z.string() }))

const schema = z.object({
  name: z.string().min(1).max(500),
  email: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  idempotency_key: z.string().max(128).optional(),
  emails: labelValueArray.optional().default([]),
  phones: labelValueArray.optional().default([]),
  linkedin: z.string().optional(),
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  source: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_person', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_name: input.name,
      p_email: input.email ?? null,
      p_phone: input.phone ?? null,
      p_title: input.title ?? null,
      p_notes: input.notes ?? null,
      p_tags: input.tags.map(t => t.toLowerCase()),
      p_idempotency_key: input.idempotency_key ?? null,
      p_emails: input.emails,
      p_phones: input.phones,
      p_linkedin: input.linkedin ?? null,
      p_twitter: input.twitter ?? null,
      p_instagram: input.instagram ?? null,
      p_source: input.source ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
