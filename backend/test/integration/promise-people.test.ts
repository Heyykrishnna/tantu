import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./support.js";

test(
  "promise assignments use a scoped name-only directory without opening member administration",
  { timeout: 60_000 },
  async () => {
    const environment = await fixture();
    try {
      const owner = await environment.account("promise-owner@example.test");
      const member = await environment.account("promise-member@example.test");
      const guest = await environment.account("promise-guest@example.test");
      await environment.owner.query(
        "INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'guest')",
        [owner.workspaceId, member.userId, guest.userId],
      );
      const path = `/api/v1/workspaces/${owner.workspaceId}`;
      const response = await environment.app.inject({
        url: path + "/promises/people",
        headers: member.headers,
      });
      assert.equal(response.statusCode, 200, response.body);
      const people = response.json<{ items: { id: string; name: string }[] }>()
        .items;
      assert.equal(people[0]?.id, member.userId);
      assert.deepEqual(
        new Set(people.map((person) => person.id)),
        new Set([owner.userId, member.userId, guest.userId]),
      );
      for (const person of people)
        assert.deepEqual(Object.keys(person).sort(), ["id", "name"]);
      const administration = await environment.app.inject({
        url: path + "/members",
        headers: member.headers,
      });
      assert.equal(administration.statusCode, 403);
      const guestDirectory = await environment.app.inject({
        url: path + "/promises/people",
        headers: guest.headers,
      });
      assert.equal(guestDirectory.statusCode, 200);
      assert.deepEqual(
        guestDirectory
          .json<{ items: { id: string }[] }>()
          .items.map((person) => person.id),
        [guest.userId],
      );
      const foreign = await environment.app.inject({
        url: `/api/v1/workspaces/${member.workspaceId}/promises/people`,
        headers: owner.headers,
      });
      assert.equal(foreign.statusCode, 404);
      const created = await environment.app.inject({
        method: "POST",
        url: path + "/promises",
        headers: member.headers,
        payload: {
          title: "Deliver a clear review",
          responsibleId: owner.userId,
          confirmationState: "confirmed",
        },
      });
      assert.equal(created.statusCode, 200, created.body);
      const read = await environment.app.inject({
        url: path + "/promises",
        headers: member.headers,
      });
      assert.equal(read.statusCode, 200);
      assert.equal(
        read.json<{ promises: { title: string }[] }>().promises[0]?.title,
        "Deliver a clear review",
      );
      await environment.owner.query(
        "UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [owner.workspaceId, guest.userId],
      );
      const activeDirectory = await environment.app.inject({
        url: path + "/promises/people",
        headers: member.headers,
      });
      assert.equal(activeDirectory.statusCode, 200);
      assert.equal(
        activeDirectory
          .json<{ items: { id: string }[] }>()
          .items.some((person) => person.id === guest.userId),
        false,
      );
      const revoked = await environment.app.inject({
        url: path + "/promises/people",
        headers: guest.headers,
      });
      assert.equal(revoked.statusCode, 404);
    } finally {
      await environment.close();
    }
  },
);
