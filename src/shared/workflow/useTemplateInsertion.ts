import { useCallback, useEffect, useRef, type FocusEvent } from "react";

type TemplateElement = HTMLInputElement | HTMLTextAreaElement;

/** Props spread onto a text input/textarea that accepts template tokens. */
export type TemplateBinding = {
  onFocus: (event: FocusEvent<TemplateElement>) => void;
};

/**
 * Registers a text field as a template target.
 * `fieldId` must be stable and unique within one editor; `setValue` receives
 * the complete new field value.
 */
export type TemplateBinder = (
  fieldId: string,
  setValue: (next: string) => void,
) => TemplateBinding;

export type TemplateInsertionOptions = {
  /**
   * Also listen for a window CustomEvent (detail: { template }) — used by the
   * Form Builder, whose Available Fields panel lives outside the step editors.
   */
  globalEventName?: string;
  /** Only insert while the target still has focus (Form Builder semantics). */
  requireFocus?: boolean;
};

/**
 * Inserts "Available Fields" template tokens (e.g. {{source.assetnum}}) at the
 * cursor of the last focused, registered field.
 *
 * Setters are re-registered on every render, so an insertion always uses the
 * latest state and never overwrites edits made after the field was focused.
 */
export function useTemplateInsertion(options: TemplateInsertionOptions = {}) {
  const setters = useRef(new Map<string, (next: string) => void>());
  const active = useRef<{ id: string; element: TemplateElement } | null>(null);
  const { globalEventName, requireFocus = false } = options;

  const bind = useCallback<TemplateBinder>((fieldId, setValue) => {
    setters.current.set(fieldId, setValue);
    return {
      onFocus: (event) => {
        active.current = { id: fieldId, element: event.currentTarget };
      },
    };
  }, []);

  const insert = useCallback(
    (template: string): boolean => {
      const target = active.current;
      if (!target || !target.element.isConnected) return false;
      if (requireFocus && document.activeElement !== target.element)
        return false;
      const setValue = setters.current.get(target.id);
      if (!setValue) return false;
      const element = target.element;
      const current = element.value;
      const start = element.selectionStart ?? current.length;
      const end = element.selectionEnd ?? current.length;
      setValue(`${current.slice(0, start)}${template}${current.slice(end)}`);
      requestAnimationFrame(() => {
        const position = start + template.length;
        element.focus();
        try {
          element.setSelectionRange(position, position);
        } catch {
          /* some input types do not support selection ranges */
        }
      });
      return true;
    },
    [requireFocus],
  );

  useEffect(() => {
    if (!globalEventName) return;
    const listener = (event: Event) => {
      const template = (event as CustomEvent<{ template?: string }>).detail
        ?.template;
      if (template) insert(template);
    };
    window.addEventListener(globalEventName, listener);
    return () => window.removeEventListener(globalEventName, listener);
  }, [globalEventName, insert]);

  return { bind, insert };
}

/** Keeps focus in the edited field when a template button is clicked. */
export const preserveFieldFocus = {
  onMouseDown: (event: { preventDefault: () => void }) =>
    event.preventDefault(),
};
