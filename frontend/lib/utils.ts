export type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | { [key: string]: boolean | undefined | null }
  | ClassValue[];

function toVal(mix: ClassValue): string {
  let str = "";
  if (typeof mix === "string" || typeof mix === "number") {
    str += mix;
  } else if (typeof mix === "object" && mix !== null) {
    if (Array.isArray(mix)) {
      for (let k = 0; k < mix.length; k++) {
        if (mix[k]) {
          const y = toVal(mix[k]);
          if (y) {
            if (str) str += " ";
            str += y;
          }
        }
      }
    } else {
      for (const k in mix) {
        if (mix[k]) {
          if (str) str += " ";
          str += k;
        }
      }
    }
  }
  return str;
}

export function clsx(...inputs: ClassValue[]): string {
  let i = 0;
  let tmp: ClassValue;
  let str = "";
  while (i < inputs.length) {
    tmp = inputs[i++];
    if (tmp) {
      const x = toVal(tmp);
      if (x) {
        if (str) str += " ";
        str += x;
      }
    }
  }
  return str;
}

export function cn(...inputs: ClassValue[]): string {
  const raw = clsx(...inputs);
  if (!raw) return "";
  const parts = raw.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!seen.has(part)) {
      seen.add(part);
      result.unshift(part);
    }
  }
  return result.join(" ");
}

export default cn;
