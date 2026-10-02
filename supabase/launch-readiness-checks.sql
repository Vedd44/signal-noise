-- Run inside a transaction after launch-readiness.sql; always roll back test fixtures.
do $$
declare allowed boolean; confirmed boolean; current_status text; snapshot_count integer;
begin
  if has_table_privilege('anon','public.daily_signal_subscribers','SELECT') then raise exception 'Subscribers are publicly readable'; end if;
  if has_table_privilege('anon','public.reader_submissions','SELECT') then raise exception 'Submissions are publicly readable'; end if;
  if has_table_privilege('anon','public.daily_signal_sends','SELECT') then raise exception 'Send log is publicly readable'; end if;
  if has_function_privilege('anon','public.prepare_daily_signal_signup(text,text,jsonb)','EXECUTE') then raise exception 'Signup RPC is public'; end if;
  if has_table_privilege('anon','public.stories','INSERT') then raise exception 'Public story writes allowed'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='stories' and qual='true') then raise exception 'Broad story read policy remains'; end if;

  select public.claim_public_request('launch-test-key',2,60) into allowed;
  if not allowed then raise exception 'First rate claim rejected'; end if;
  select public.claim_public_request('launch-test-key',2,60) into allowed;
  if not allowed then raise exception 'Second rate claim rejected'; end if;
  select public.claim_public_request('launch-test-key',2,60) into allowed;
  if allowed then raise exception 'Rate limit exceeded'; end if;
  update public_request_limits set expires_at=now()-interval '1 minute' where key_hash='launch-test-key';
  if not public.claim_public_request('launch-test-key',2,60) then raise exception 'Expired limit failed to reset'; end if;

  select count(*) into snapshot_count from daily_signal_subscribers;
  if not prepare_daily_signal_signup('signal-launch-test@example.invalid','launch-test-token','{"utm_source":"test"}') then raise exception 'New signup failed'; end if;
  select status into current_status from daily_signal_subscribers where email='signal-launch-test@example.invalid';
  if current_status <> 'pending' then raise exception 'New signup activated without confirmation'; end if;
  if prepare_daily_signal_signup('signal-launch-test@example.invalid','different-token','{}') then raise exception 'Duplicate signup sent twice'; end if;
  if not confirm_daily_signal_signup('launch-test-token') then raise exception 'Confirmation failed'; end if;
  if not confirm_daily_signal_signup('launch-test-token') then raise exception 'Confirmation not repeat-safe'; end if;
  if prepare_daily_signal_signup('signal-launch-test@example.invalid','different-token','{}') then raise exception 'Active signup sent again'; end if;
  update daily_signal_subscribers set status='unsubscribed',confirmation_token_hash=null,confirmation_requested_at=null where email='signal-launch-test@example.invalid';
  if confirm_daily_signal_signup('launch-test-token') then raise exception 'Old confirmation undid unsubscribe'; end if;
  if not prepare_daily_signal_signup('signal-launch-test@example.invalid','resubscribe-token','{}') then raise exception 'Resubscription failed'; end if;
  select status into current_status from daily_signal_subscribers where email='signal-launch-test@example.invalid';
  if current_status <> 'pending' then raise exception 'Resubscription activated without consent'; end if;
  update daily_signal_subscribers set confirmation_expires_at=now()-interval '1 minute' where email='signal-launch-test@example.invalid';
  if confirm_daily_signal_signup('resubscribe-token') then raise exception 'Expired confirmation accepted'; end if;
  if confirm_daily_signal_signup('invalid-token') then raise exception 'Invalid confirmation accepted'; end if;
  if (select count(*) from daily_signal_subscribers) <> snapshot_count+1 then raise exception 'Unexpected subscriber mutations'; end if;
end $$;
