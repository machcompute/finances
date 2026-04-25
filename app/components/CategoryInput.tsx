"use client";

type Props = {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  listId: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function CategoryInput({
  value,
  onChange,
  options,
  listId,
  placeholder = "Type or pick…",
  className,
  disabled,
  onFocus,
  onBlur,
}: Props) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {options.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
