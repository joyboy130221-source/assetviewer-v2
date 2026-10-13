import type { WatcherActionType } from "../model/apiWatcher.types";

export type WatcherStepTypeSelectorProps = {
  id: string;
  value: WatcherActionType;
  onChange: (value: WatcherActionType) => void;
  disabled?: boolean;
  label?: string;
  helpText?: string;
};

const STEP_TYPES: ReadonlyArray<{ value: WatcherActionType; label: string }> = [
  { value: "api", label: "API" },
  { value: "browser", label: "Browser RPA" },
  { value: "message", label: "Service Bus" },
];

export function WatcherStepTypeSelector({
  id,
  value,
  onChange,
  disabled = false,
  label = "Step Type",
  helpText = "Select how this watcher step is executed.",
}: WatcherStepTypeSelectorProps) {
  return (
    <div className="aw-step-type-selector" data-testid={`${id}-step-type`}>
      <label htmlFor={`${id}-step-type-select`}>
        <span>{label}</span>
        <select
          id={`${id}-step-type-select`}
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value as WatcherActionType)
          }
        >
          {STEP_TYPES.map((stepType) => (
            <option key={stepType.value} value={stepType.value}>
              {stepType.label}
            </option>
          ))}
        </select>
        <small>{helpText}</small>
      </label>
    </div>
  );
}
