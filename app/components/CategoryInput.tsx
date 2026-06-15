"use client";

import { Input } from "./ui/input";

type Props = {
  value: string;
  onChange: (next: string) => void;
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
  listId,
  placeholder = "Type or pick…",
  className,
  disabled,
  onFocus,
  onBlur,
}: Props) {
  return (
    <Input
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
  );
}

export function CategoryDatalist({
  id,
  options,
}: {
  id: string;
  options: string[];
}) {
  return (
    <datalist id={id}>
      {options.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}
