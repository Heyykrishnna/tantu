GRANT USAGE ON SCHEMA tantu TO tantu_runtime;
GRANT SELECT,INSERT,UPDATE ON tantu.users,tantu.workspaces,tantu.memberships,tantu.sessions,tantu.login_limits,tantu.invitations,tantu.grants,tantu.operations,tantu.events,tantu.job_claims TO tantu_runtime;
GRANT SELECT,INSERT,UPDATE ON tantu.records,tantu.files TO tantu_runtime;
GRANT EXECUTE ON FUNCTION tantu.actor(),tantu.tenant(),tantu.member_role(uuid),tantu.can_access(uuid,boolean) TO tantu_runtime;
