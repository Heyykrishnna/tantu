export const uuid = { type: "string", format: "uuid" } as const;
export const text = (maximum: number) => ({ type: "string", minLength: 1, maxLength: maximum });
export const email = { type: "string", format: "email", maxLength: 254 } as const;
export const password = { type: "string", minLength: 12, maxLength: 256 } as const;
export function object(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { type: "object", additionalProperties: false, required, properties };
}
export const workspaceParams = object({ workspaceId: uuid });
