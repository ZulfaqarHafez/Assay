-- Interviu tenant scope foundation.
-- The FastAPI backend remains the enforcement point, but ownership now exists
-- at the data model boundary for future user/org auth and RLS policies.

alter table public.interviu_candidates
  add column if not exists tenant_id text not null default 'local';

alter table public.interviu_runs
  add column if not exists tenant_id text not null default 'local';

alter table public.interviu_events
  add column if not exists tenant_id text not null default 'local';

alter table public.interviu_scorecards
  add column if not exists tenant_id text not null default 'local';

alter table public.interviu_lessons
  add column if not exists tenant_id text not null default 'local';

create index if not exists interviu_candidates_tenant_created_idx
  on public.interviu_candidates (tenant_id, created_at);

create index if not exists interviu_runs_tenant_created_idx
  on public.interviu_runs (tenant_id, created_at);

create index if not exists interviu_events_tenant_run_sequence_idx
  on public.interviu_events (tenant_id, run_id, sequence);

create index if not exists interviu_lessons_tenant_candidate_idx
  on public.interviu_lessons (tenant_id, candidate_id, exam_pack_id, competency, active);
