"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function SelectControl({
  options,
  value,
  onValueChange,
  id,
  label,
  placeholder,
  disabled,
  className,
}: {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      items={options}
      value={value || null}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
