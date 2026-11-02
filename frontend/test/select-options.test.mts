import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import {
  moveOption,
  selectOptions,
  selectValues,
} from "../lib/select-options.ts";

test("dropdown options preserve labels, values, disabled groups and fragments", () => {
  const options = selectOptions(
    createElement(
      Fragment,
      null,
      createElement("option", { value: "" }, "Choose a person"),
      createElement(
        "optgroup",
        { label: "Unavailable", disabled: true },
        createElement("option", { value: "inactive" }, "Inactive person"),
      ),
      createElement("option", { value: "owner" }, "Workspace owner"),
      createElement("option", null, "Use the label as value"),
    ),
  );
  assert.deepEqual(
    options.map(({ value, label, disabled, group }) => ({
      value,
      label,
      disabled,
      group,
    })),
    [
      {
        value: "",
        label: "Choose a person",
        disabled: false,
        group: undefined,
      },
      {
        value: "inactive",
        label: "Inactive person",
        disabled: true,
        group: "Unavailable",
      },
      {
        value: "owner",
        label: "Workspace owner",
        disabled: false,
        group: undefined,
      },
      {
        value: "Use the label as value",
        label: "Use the label as value",
        disabled: false,
        group: undefined,
      },
    ],
  );
  assert.equal(moveOption(options, 0, 1), 2);
  assert.equal(moveOption(options, 0, -1), 3);
  assert.equal(
    moveOption(
      options.map((option) => ({ ...option, disabled: true })),
      0,
      1,
    ),
    -1,
  );
  assert.equal(moveOption([], -1, 1), -1);
});

test("form selections retain empty, numeric and multiple values", () => {
  assert.deepEqual(selectValues(undefined), []);
  assert.deepEqual(selectValues(""), [""]);
  assert.deepEqual(selectValues(2), ["2"]);
  assert.deepEqual(selectValues(["owner", "member"]), ["owner", "member"]);
});
