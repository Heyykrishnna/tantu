CREATE FUNCTION tantu.clear_member_access(target_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tantu AS $$
DECLARE
  actor_role text := tantu.member_role(tantu.tenant());
  target_role text;
BEGIN
  SELECT role INTO target_role FROM tantu.memberships
    WHERE workspace_id=tantu.tenant() AND user_id=target_user;
  IF actor_role IS NULL OR target_role='owner'
    OR (target_user<>tantu.actor() AND actor_role NOT IN ('owner','admin'))
    OR (target_user<>tantu.actor() AND target_role='admin' AND actor_role<>'owner') THEN
    RAISE EXCEPTION 'Membership access cannot be cleared' USING ERRCODE='42501';
  END IF;
  DELETE FROM tantu.grants WHERE workspace_id=tantu.tenant() AND user_id=target_user;
  DELETE FROM tantu.project_members WHERE workspace_id=tantu.tenant() AND user_id=target_user;
END;
$$;
REVOKE ALL ON FUNCTION tantu.clear_member_access(uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tantu_runtime') THEN
    GRANT EXECUTE ON FUNCTION tantu.clear_member_access(uuid) TO tantu_runtime;
  END IF;
END $$;
