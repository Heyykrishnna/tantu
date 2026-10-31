import assert from "node:assert/strict";
import test from "node:test";

interface WorkspaceRoleDefinition {
  canManageMembers: boolean;
  canInviteAdmins: boolean;
  canEditSettings: boolean;
  requiresRecordScope: boolean;
  hasWorkspaceWideAccess: boolean;
}

const rolePermissions: Record<"owner" | "admin" | "member" | "guest", WorkspaceRoleDefinition> = {
  owner: {
    canManageMembers: true,
    canInviteAdmins: true,
    canEditSettings: true,
    requiresRecordScope: false,
    hasWorkspaceWideAccess: true,
  },
  admin: {
    canManageMembers: true,
    canInviteAdmins: false,
    canEditSettings: true,
    requiresRecordScope: false,
    hasWorkspaceWideAccess: true,
  },
  member: {
    canManageMembers: false,
    canInviteAdmins: false,
    canEditSettings: false,
    requiresRecordScope: false,
    hasWorkspaceWideAccess: true,
  },
  guest: {
    canManageMembers: false,
    canInviteAdmins: false,
    canEditSettings: false,
    requiresRecordScope: true,
    hasWorkspaceWideAccess: false,
  },
};

function validateInvitationRequest(input: {
  email: string;
  role: "admin" | "member" | "guest";
  recordId?: string | null;
  permission: "read" | "edit";
}): { valid: boolean; error?: string } {
  if (!input.email || !input.email.includes("@")) {
    return { valid: false, error: "Invalid email" };
  }
  if (input.role === "guest" && !input.recordId) {
    return { valid: false, error: "Choose a record to invite this guest to." };
  }
  if (!["read", "edit"].includes(input.permission)) {
    return { valid: false, error: "Invalid permission" };
  }
  return { valid: true };
}

function canModifyRole(
  actorRole: "owner" | "admin" | "member" | "guest",
  targetRole: "owner" | "admin" | "member" | "guest",
): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin" && targetRole !== "admin") return true;
  return false;
}

test("role permissions matrix strictly differentiates owner, admin, member, and guest", () => {
  assert.equal(rolePermissions.owner.canInviteAdmins, true);
  assert.equal(rolePermissions.admin.canInviteAdmins, false);
  assert.equal(rolePermissions.admin.canManageMembers, true);
  assert.equal(rolePermissions.member.canManageMembers, false);
  assert.equal(rolePermissions.guest.requiresRecordScope, true);
  assert.equal(rolePermissions.guest.hasWorkspaceWideAccess, false);
  assert.equal(rolePermissions.member.hasWorkspaceWideAccess, true);
});

test("invitation validation strictly requires recordId for guests and allows workspace-wide for members", () => {
  const validMember = validateInvitationRequest({
    email: "colleague@example.com",
    role: "member",
    permission: "edit",
  });
  assert.equal(validMember.valid, true);

  const invalidGuest = validateInvitationRequest({
    email: "contractor@example.com",
    role: "guest",
    permission: "read",
  });
  assert.equal(invalidGuest.valid, false);
  assert.equal(invalidGuest.error, "Choose a record to invite this guest to.");

  const validGuest = validateInvitationRequest({
    email: "contractor@example.com",
    role: "guest",
    recordId: "550e8400-e29b-41d4-a716-446655440000",
    permission: "read",
  });
  assert.equal(validGuest.valid, true);
});

test("role modification rules protect ownership and enforce hierarchy", () => {
  assert.equal(canModifyRole("owner", "admin"), true);
  assert.equal(canModifyRole("owner", "member"), true);
  assert.equal(canModifyRole("owner", "guest"), true);
  assert.equal(canModifyRole("owner", "owner"), false);

  assert.equal(canModifyRole("admin", "member"), true);
  assert.equal(canModifyRole("admin", "admin"), false);
  assert.equal(canModifyRole("admin", "owner"), false);

  assert.equal(canModifyRole("member", "guest"), false);
  assert.equal(canModifyRole("guest", "member"), false);
});
