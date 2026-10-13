/** 分段选择器，纯展示 */

interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>(props: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  full?: boolean;
  mini?: boolean;
  disabled?: boolean;
}) {
  const cls = [
    "pm-seg",
    props.full ? "full" : "",
    props.mini ? "mini" : "",
    props.disabled ? "disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      role="group"
      aria-label={props.ariaLabel}
      aria-disabled={props.disabled}
    >
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => !props.disabled && props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 开关，纯展示 */
export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      className={"pm-switch" + (props.checked ? " on" : "")}
      onClick={() => props.onChange(!props.checked)}
    >
      <i aria-hidden="true" />
    </button>
  );
}
