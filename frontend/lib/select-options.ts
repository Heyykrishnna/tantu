import { Children, isValidElement } from "react";
import type {
  ReactNode,
  OptionHTMLAttributes,
  OptgroupHTMLAttributes,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
  selected: boolean;
  group?: string;
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node))
    return text(node.props.children);
  return Children.toArray(node)
    .map((child) =>
      typeof child === "boolean" || child === null
        ? ""
        : isValidElement<{ children?: ReactNode }>(child)
          ? text(child.props.children)
          : typeof child === "string" || typeof child === "number"
            ? String(child)
            : "",
    )
    .join("");
}

export function selectOptions(
  children: ReactNode,
  group?: string,
  disabled = false,
): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    if (
      child.type === "option" &&
      isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child)
    ) {
      const label = child.props.label ?? text(child.props.children);
      return [
        {
          value:
            child.props.value === undefined ? label : String(child.props.value),
          label,
          disabled: disabled || child.props.disabled === true,
          selected: child.props.selected === true,
          ...(group ? { group } : {}),
        },
      ];
    }
    if (
      child.type === "optgroup" &&
      isValidElement<OptgroupHTMLAttributes<HTMLOptGroupElement>>(child)
    )
      return selectOptions(
        child.props.children,
        child.props.label,
        disabled || child.props.disabled === true,
      );
    return selectOptions(child.props.children, group, disabled);
  });
}

export function selectValues(
  value: string | number | readonly string[] | undefined,
): string[] {
  if (value === undefined) return [];
  return typeof value === "object" ? value.map(String) : [String(value)];
}

export function moveOption(
  options: SelectOption[],
  active: number,
  direction: 1 | -1,
): number {
  for (let step = 1; step <= options.length; step++) {
    const index = (active + direction * step + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}
