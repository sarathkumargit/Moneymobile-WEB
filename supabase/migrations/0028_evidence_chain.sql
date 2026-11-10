-- 0028 — Tamper-proof evidence record (Phase 5 of the anti-unlock plan)
--
-- Every important event (audit log entries: agreements, locks, overrides, tamper alerts, key registrations;
-- phone commands; payments; identity events) is copied into evidence_chain. Each row stores the hash of the
-- row before it, so the rows form a chain: changing or deleting any old row breaks every hash after it, and
-- evidence_verify() finds the first broken row. Rows can't be updated or deleted at all (triggers refuse).
--
--   hash = sha256( seq | prev_hash | shop | agreement | device | enrollment | source | source_id | event |
--                  actor | details(jsonb text) | occurred_at(UTC) )
--
-- The website's evidence report (customer page -> Evidence report) lists the chain rows for one agreement,
-- verifies them and prints the chain head, so a printed report can be checked against the database later.
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. A problem in the chain never blocks the
-- original insert (it is logged as a warning instead).

begin;

create table if not exists public.evidence_chain (
  seq            bigint primary key,
  shop_id        uuid,
  agreement_id   uuid,
  device_id      uuid,
  enrollment_id  uuid,
  source         text not null,
  source_id      uuid,
  event          text not null,
  actor_id       uuid,
  details        jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  prev_hash      text not null,
  hash           text not null
);
create index if not exists idx_ec_agreement on public.evidence_chain(agreement_id, seq);
create index if not exists idx_ec_device on public.evidence_chain(device_id, seq);
create index if not exists idx_ec_enrollment on public.evidence_chain(enrollment_id, seq);
create index if not exists idx_ec_shop on public.evidence_chain(shop_id, seq);

-- The exact text that is hashed (also used by evidence_verify).
create or replace function public.evidence_payload(r public.evidence_chain) returns text
language sql stable as $$
  select r.seq::text || '|' || r.prev_hash || '|' || coalesce(r.shop_id::text, '') || '|' || coalesce(r.agreement_id::text, '') || '|' ||
         coalesce(r.device_id::text, '') || '|' || coalesce(r.enrollment_id::text, '') || '|' || r.source || '|' ||
         coalesce(r.source_id::text, '') || '|' || r.event || '|' || coalesce(r.actor_id::text, '') || '|' || r.details::text || '|' ||
         to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- Assigns seq + prev_hash + hash under a lock, so rows chain in commit order with no gaps.
create or replace function public.evidence_chain_link() returns trigger
language plpgsql as $$
declare last_seq bigint; last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('mm_evidence_chain'));
  select seq, hash into last_seq, last_hash from public.evidence_chain order by seq desc limit 1;
  new.seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.occurred_at := coalesce(new.occurred_at, now());
  new.details := coalesce(new.details, '{}'::jsonb);
  new.hash := encode(sha256(convert_to(public.evidence_payload(new), 'UTF8')), 'hex');
  return new;
end $$;

drop trigger if exists trg_evidence_chain_link on public.evidence_chain;
create trigger trg_evidence_chain_link before insert on public.evidence_chain
  for each row execute function public.evidence_chain_link();

create or replace function public.evidence_chain_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'evidence_chain is append-only: rows cannot be changed or deleted';
end $$;
drop trigger if exists trg_evidence_chain_no_update on public.evidence_chain;
create trigger trg_evidence_chain_no_update before update or delete on public.evidence_chain
  for each row execute function public.evidence_chain_immutable();
drop trigger if exists trg_evidence_chain_no_truncate on public.evidence_chain;
create trigger trg_evidence_chain_no_truncate before truncate on public.evidence_chain
  for each statement execute function public.evidence_chain_immutable();

-- Re-checks rows [p_from, p_to]: each hash must match its content and the previous row's hash.
-- Returns how many rows were checked and the first broken seq (null = chain intact).
create or replace function public.evidence_verify(p_from bigint default 1, p_to bigint default null)
returns table(checked bigint, first_bad_seq bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
-- security definer: checks the whole chain (other shops' rows included); returns only counts, no data.
declare r public.evidence_chain; prev text; n bigint := 0; bad bigint := null;
begin
  select hash into prev from public.evidence_chain where seq = p_from - 1;
  if p_from <= 1 then prev := repeat('0', 64); end if;
  for r in select * from public.evidence_chain where seq >= p_from and (p_to is null or seq <= p_to) order by seq loop
    n := n + 1;
    if (prev is not null and r.prev_hash <> prev)
       or r.hash <> encode(sha256(convert_to(public.evidence_payload(r), 'UTF8')), 'hex') then
      bad := r.seq; exit;
    end if;
    prev := r.hash;
  end loop;
  return query select n, bad;
end $$;

-- Checks just the listed rows (for one agreement's report): content hash + link to the row before it.
create or replace function public.evidence_verify_rows(p_seqs bigint[])
returns table(seq bigint, ok boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.seq,
         c.hash = encode(sha256(convert_to(public.evidence_payload(c), 'UTF8')), 'hex')
         and (c.seq = 1 or c.prev_hash = (select p.hash from public.evidence_chain p where p.seq = c.seq - 1))
  from public.evidence_chain c where c.seq = any(p_seqs)
$$;

-- ── feeders: copy events into the chain (never block the original insert) ──

create or replace function public.evidence_from_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb := to_jsonb(new); ent text; eid uuid;
begin
  begin
    ent := j->>'entity';
    eid := nullif(j->>'entity_id', '')::uuid;
    insert into public.evidence_chain(shop_id, agreement_id, device_id, enrollment_id, source, source_id, event, actor_id, details, occurred_at)
    values (nullif(j->>'shop_id', '')::uuid,
            case when ent = 'installment_agreements' then eid end,
            case when ent = 'devices' then eid end,
            case when ent = 'device_enrollments' then eid end,
            'audit_logs', nullif(j->>'id', '')::uuid, coalesce(j->>'action', 'audit'), nullif(j->>'actor_id', '')::uuid,
            jsonb_build_object('entity', ent, 'entity_id', eid, 'details', coalesce(j->'details', 'null'::jsonb)),
            coalesce(nullif(j->>'created_at', '')::timestamptz, now()));
  exception when others then raise warning 'evidence_chain (audit): %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.evidence_from_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb := to_jsonb(new); ev text;
begin
  begin
    ev := case tg_table_name
            when 'device_commands' then 'command_' || lower(coalesce(j->>'command', 'unknown'))
            when 'payment_transactions' then 'payment'
            when 'device_identity_events' then 'identity_' || coalesce(j->>'event_type', 'event')
            else tg_table_name end;
    insert into public.evidence_chain(shop_id, agreement_id, device_id, enrollment_id, source, source_id, event, actor_id, details, occurred_at)
    values (nullif(j->>'shop_id', '')::uuid, nullif(j->>'agreement_id', '')::uuid, nullif(j->>'device_id', '')::uuid,
            nullif(j->>'enrollment_id', '')::uuid, tg_table_name, nullif(j->>'id', '')::uuid, ev,
            coalesce(nullif(j->>'issued_by', ''), nullif(j->>'recorded_by', ''), nullif(j->>'actor_id', ''))::uuid,
            j - 'device_token_hash' - 'enroll_token_hash',
            coalesce(nullif(j->>'created_at', '')::timestamptz, now()));
  exception when others then raise warning 'evidence_chain (%): %', tg_table_name, sqlerrm;
  end;
  return new;
end $$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop trigger if exists trg_evidence_audit on public.audit_logs;
    create trigger trg_evidence_audit after insert on public.audit_logs for each row execute function public.evidence_from_audit();
  end if;
  if to_regclass('public.device_commands') is not null then
    drop trigger if exists trg_evidence_commands on public.device_commands;
    create trigger trg_evidence_commands after insert on public.device_commands for each row execute function public.evidence_from_row();
  end if;
  if to_regclass('public.payment_transactions') is not null then
    drop trigger if exists trg_evidence_payments on public.payment_transactions;
    create trigger trg_evidence_payments after insert on public.payment_transactions for each row execute function public.evidence_from_row();
  end if;
  if to_regclass('public.device_identity_events') is not null then
    drop trigger if exists trg_evidence_identity on public.device_identity_events;
    create trigger trg_evidence_identity after insert on public.device_identity_events for each row execute function public.evidence_from_row();
  end if;
end $$;

alter table public.evidence_chain enable row level security;
drop policy if exists ec_read on public.evidence_chain;
create policy ec_read on public.evidence_chain for select
  using (is_super_admin() or (shop_id is not null and can_access_shop(shop_id)));
-- No insert/update/delete policies: rows only arrive through the triggers above.

grant execute on function public.evidence_verify(bigint, bigint) to authenticated, service_role;
grant execute on function public.evidence_verify_rows(bigint[]) to authenticated, service_role;

commit;

select count(*) as chain_rows, max(seq) as head_seq from public.evidence_chain;
