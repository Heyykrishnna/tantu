"use client";

import {
  forwardRef,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, KeyboardEvent, SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { CandyButton } from "./candy-button";
import { usePanelVisible } from "./retained-panel";
import { useUiMotion } from "../../lib/use-ui-motion";
import { cn } from "../../lib/utils";
import {
  moveOption,
  selectOptions,
  selectValues,
} from "../../lib/select-options";
import { useAnchoredMenu } from "./use-anchored-menu";

function labelText(node: Node, excluded: Node): string {
  if (node === excluded) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return Array.from(node.childNodes)
    .map((child) => labelText(child, excluded))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select(
  {
    children,
    className,
    value,
    defaultValue,
    onChange,
    disabled,
    multiple,
    style,
    ...props
  },
  forwardedRef,
) {
  const id = useId();
  const ariaLabel = props["aria-label"];
  const ariaLabelledby = props["aria-labelledby"];
  const fieldId = props.id;
  const formId = props.form;
  const fieldTitle = props.title;
  const root = useRef<HTMLSpanElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const options = useMemo(() => selectOptions(children), [children]);
  const [localValues, setLocalValues] = useState(() =>
    selectValues(
      defaultValue ??
        (multiple
          ? []
          : (options.find((option) => option.selected)?.value ??
            options[0]?.value)),
    ),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const typeahead = useRef({ text: "", time: 0 });
  const visible = usePanelVisible();
  const reduced = useUiMotion();
  if (!visible && open) setOpen(false);
  const expanded = open && visible && !disabled;
  const placement = useAnchoredMenu(expanded, trigger, options.length);
  const selected = value === undefined ? localValues : selectValues(value);
  const labels = options.filter((option) => selected.includes(option.value));
  const label =
    labels.length > 2
      ? `${labels.length} selected`
      : labels.map((option) => option.label).join(", ") ||
        (multiple
          ? "Choose options"
          : options.length
            ? options[0]?.label
            : "No options available");
  const missing =
    invalid && props.required && !selected.some((item) => item !== "");

  useLayoutEffect(() => {
    const select = native.current;
    const button = trigger.current;
    const element = root.current;
    if (!select || !button || !element) return;
    const labels = Array.from(select.labels ?? []);
    if (!ariaLabel && !ariaLabelledby)
      button.setAttribute(
        "aria-label",
        labels.map((label) => labelText(label, element)).join(" ") ||
          fieldTitle ||
          "Choose an option",
      );
    if (value === undefined) {
      const values = Array.from(
        select.selectedOptions,
        (option) => option.value,
      );
      setLocalValues((current) =>
        current.length === values.length &&
        current.every((item, index) => item === values[index])
          ? current
          : values,
      );
    }
    const focus = (event: MouseEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) {
        event.preventDefault();
        button.focus();
      }
    };
    labels.forEach((label) => label.addEventListener("click", focus));
    const form = select.form;
    let mounted = true;
    const reset = () =>
      queueMicrotask(() => {
        if (mounted) {
          setLocalValues(
            Array.from(select.selectedOptions, (option) => option.value),
          );
          setInvalid(false);
          setOpen(false);
        }
      });
    form?.addEventListener("reset", reset);
    return () => {
      mounted = false;
      labels.forEach((label) => label.removeEventListener("click", focus));
      form?.removeEventListener("reset", reset);
    };
  }, [children, fieldId, formId, fieldTitle, ariaLabel, ariaLabelledby, value]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, id, placement]);

  function show(direction?: 1 | -1) {
    if (native.current?.matches(":disabled")) return;
    const current = options.findIndex(
      (option) => selected.includes(option.value) && !option.disabled,
    );
    setActive(
      direction
        ? moveOption(
            options,
            current < 0 ? (direction === 1 ? -1 : 0) : current,
            direction,
          )
        : current >= 0
          ? current
          : moveOption(options, -1, 1),
    );
    setOpen(true);
  }
  function choose(index: number) {
    const select = native.current;
    const option = options[index];
    if (!select || !option || option.disabled || select.matches(":disabled"))
      return;
    if (multiple) {
      const selectedOption = Array.from(select.options).find(
        (item) => item.value === option.value,
      );
      if (selectedOption) selectedOption.selected = !selectedOption.selected;
    } else select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (!multiple) setOpen(false);
    trigger.current?.focus();
  }
  function change(event: ChangeEvent<HTMLSelectElement>) {
    if (value === undefined)
      setLocalValues(
        Array.from(
          event.currentTarget.selectedOptions,
          (option) => option.value,
        ),
      );
    setInvalid(false);
    onChange?.(event);
  }
  function keydown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) choose(active);
      else show();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (expanded)
        setActive((current) => moveOption(options, current, direction));
      else show(direction);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(
        moveOption(
          options,
          event.key === "Home" ? -1 : 0,
          event.key === "Home" ? 1 : -1,
        ),
      );
      setOpen(true);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const now = performance.now();
      const text =
        now - typeahead.current.time < 700
          ? typeahead.current.text + event.key.toLocaleLowerCase()
          : event.key.toLocaleLowerCase();
      typeahead.current = { text, time: now };
      const search = Array.from(text).every((letter) => letter === text[0])
        ? (text[0] ?? "")
        : text;
      const index = Array.from(
        { length: options.length },
        (_, offset) => (Math.max(-1, active) + offset + 1) % options.length,
      ).find(
        (index) =>
          !options[index]?.disabled &&
          options[index]?.label.toLocaleLowerCase().startsWith(search),
      );
      if (index !== undefined) {
        event.preventDefault();
        setActive(index);
        setOpen(true);
      }
    }
  }

  return (
    <span
      ref={root}
      data-select-root=""
      className="relative block min-w-0"
      hidden={props.hidden}
    >
      <select
        {...props}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        multiple={multiple}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        ref={(element) => {
          native.current = element;
          if (typeof forwardedRef === "function") forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        onChange={change}
        onInvalid={(event) => {
          props.onInvalid?.(event);
          event.preventDefault();
          setInvalid(true);
          show();
          trigger.current?.focus();
        }}
      >
        {children}
      </select>
      <CandyButton
        ref={trigger}
        variant="ghost"
        size="unstyled"
        type="button"
        role="combobox"
        aria-label={
          props["aria-label"] ??
          (props["aria-labelledby"] ? undefined : "Choose an option")
        }
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-required={props.required}
        aria-invalid={missing || props["aria-invalid"]}
        disabled={disabled}
        onClick={() => (expanded ? setOpen(false) : show())}
        onKeyDown={keydown}
        onBlur={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !popup.current?.contains(event.relatedTarget)
          )
            setOpen(false);
        }}
        style={style}
        data-value={selected.join(",")}
        className={cn(
          "inline-flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-normal text-zinc-900 shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-[#141416] dark:text-zinc-100 [&>span]:contents",
          missing && "ring-2 ring-rose-500",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 400, damping: 30 }
          }
          className="shrink-0 text-zinc-400"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </CandyButton>
      {missing && (
        <span
          role="alert"
          className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
        >
          Choose an option to continue.
        </span>
      )}
      {placement &&
        createPortal(
          <AnimatePresence>
            {expanded && (
              <motion.div
                key="select-menu"
                ref={popup}
                initial={{
                  opacity: 0,
                  y: placement.above ? -4 : 4,
                  scale: 0.98,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }
                }
                style={{
                  position: "fixed",
                  left: placement.left,
                  top: placement.above ? undefined : placement.top,
                  bottom: placement.above ? placement.bottom : undefined,
                  width: placement.width,
                  maxHeight: placement.maxHeight,
                }}
                className="z-[100] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-900 shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:border-zinc-700 dark:bg-[#1b1b1f] dark:text-zinc-100"
                onKeyDown={keydown}
              >
                <div
                  role="listbox"
                  id={`${id}-listbox`}
                  aria-label={props["aria-label"] ?? "Options"}
                  aria-multiselectable={multiple || undefined}
                >
                  {options.map((option, index) => (
                    <div key={`${option.value}:${index}`}>
                      {option.group &&
                        options[index - 1]?.group !== option.group && (
                          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                            {option.group}
                          </p>
                        )}
                      <CandyButton
                        type="button"
                        variant="ghost"
                        size="unstyled"
                        role="option"
                        id={`${id}-option-${index}`}
                        data-value={option.value}
                        aria-selected={selected.includes(option.value)}
                        disabled={option.disabled}
                        tabIndex={-1}
                        onPointerDown={(event) => {
                          if (event.pointerType === "mouse")
                            event.preventDefault();
                        }}
                        onPointerMove={() => {
                          if (!option.disabled) setActive(index);
                        }}
                        onClick={() => choose(index)}
                        className={cn(
                          "flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-normal [&>span]:contents",
                          active === index && "bg-zinc-100 dark:bg-zinc-800",
                          selected.includes(option.value) && "font-medium",
                        )}
                      >
                        <span className="min-w-0 flex-1 break-words">
                          {option.label}
                        </span>
                        {selected.includes(option.value) && (
                          <Check className="size-3.5 shrink-0 text-zinc-700 dark:text-zinc-200 [[data-accent=indigo]_&]:text-indigo-500 [[data-accent=sage]_&]:text-emerald-600" />
                        )}
                      </CandyButton>
                    </div>
                  ))}
                  {options.length === 0 && (
                    <p role="status" className="p-3 text-xs text-zinc-500">
                      No options available.
                    </p>
                  )}
                </div>
                {multiple && (
                  <div className="mt-1 flex justify-end border-t border-zinc-200 pt-1 dark:border-zinc-700">
                    <CandyButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setOpen(false);
                        trigger.current?.focus();
                      }}
                    >
                      Done
                    </CandyButton>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          placement.target,
        )}
    </span>
  );
});
