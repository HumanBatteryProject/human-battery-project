-- 073: flipping a feature flag, audited. Part I Day 6, master prompt D10 item 6.
--
-- The flags table existed and an admin could update it directly through row level
-- security. That is not enough for the one flag that matters: AI_GENERATION_ENABLED
-- is the emergency stop, and "who turned the model back on, and when" has to be
-- answerable. A direct UPDATE leaves no trace.
--
-- Written as a function so the audit row and the change are one statement and
-- cannot come apart.

create or replace function set_flag(p_key text, p_enabled boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before boolean; v_desc text;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Only an admin may change a feature flag.');
  end if;

  select enabled, description into v_before, v_desc from feature_flags where key = p_key;
  if v_desc is null then
    return jsonb_build_object('ok', false, 'message', 'No such flag: ' || p_key);
  end if;

  update feature_flags
     set enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
   where key = p_key;

  insert into audit_log (actor_id, action, table_name, record_id, detail)
  values (auth.uid(),
          case when p_enabled then 'flag.enabled' else 'flag.disabled' end,
          'feature_flags', null,
          jsonb_build_object('key', p_key, 'before', v_before, 'after', p_enabled,
                             'reason', p_reason));

  return jsonb_build_object('ok', true, 'key', p_key, 'before', v_before, 'after', p_enabled,
                            'unchanged', v_before = p_enabled);
end; $$;

comment on function set_flag is
  'Change a feature flag and record who did it. AI_GENERATION_ENABLED is the '
  'emergency stop, so "who turned the model back on and when" has to be '
  'answerable, and a direct UPDATE leaves no trace.';

revoke execute on function set_flag(text, boolean, text) from public;
revoke execute on function set_flag(text, boolean, text) from anon;
grant execute on function set_flag(text, boolean, text) to authenticated;
grant execute on function set_flag(text, boolean, text) to service_role;

notify pgrst, 'reload schema';
