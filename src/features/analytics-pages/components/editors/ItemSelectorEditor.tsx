import { Play } from "lucide-react";
import type { AnalyticsBuilderLimits } from "../../../analytics/model/analytics.types";
import type {
  ItemSelectorConfig,
  ItemSource,
  PageRoute,
  PreviewItems,
  UnmatchedBehavior,
} from "../../model/analyticsPage.types";
import { UNMATCHED_BEHAVIORS } from "../../model/analyticsPageCatalog";
import { RestSourceEditor, type AuthProfileOption } from "./RestSourceEditor";
import { StaticItemsEditor } from "./StaticItemsEditor";

type Props = {
  value: ItemSelectorConfig;
  onChange: (value: ItemSelectorConfig) => void;
  profiles: AuthProfileOption[];
  parameters: string[];
  limits: AnalyticsBuilderLimits | null;
  /** Result of the last "Test items" run. */
  preview: PreviewItems | null;
  testing: boolean;
  onTest: () => void;
  /** Describes where an item leads, e.g. "Rule 2 → 4D IoT chart". */
  routeLabel: (route: PageRoute | null) => string;
};

/**
 * The page's optional dropdown: on/off, item source (static or API), and how
 * the selection behaves. Turning it off keeps every setting.
 */
export function ItemSelectorEditor({
  value,
  onChange,
  profiles,
  parameters,
  limits,
  preview,
  testing,
  onTest,
  routeLabel,
}: Props) {
  const set = (patch: Partial<ItemSelectorConfig>) =>
    onChange({ ...value, ...patch });
  const api = value.api;
  const fields = preview?.fields ?? [];
  const itemOptions =
    value.source === "static"
      ? value.staticItems
      : (preview?.items ?? []).map(({ label, value: v }) => ({
          label,
          value: v,
        }));

  return (
    <div className="ap-selector-editor">
      <label className="an-check ap-toggle">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />{" "}
        Show a dropdown to choose the chart
      </label>
      {!value.enabled ? (
        <small>
          Off: the page always shows the default chart and no item API is
          called. Dropdown settings below are kept and come back when you turn
          it on.
        </small>
      ) : (
        <>
          <div className="an-fields two">
            <label>
              Dropdown label
              <input
                value={value.label}
                onChange={(e) => set({ label: e.target.value })}
              />
            </label>
            <label>
              Items from
              <select
                value={value.source}
                onChange={(e) => set({ source: e.target.value as ItemSource })}
              >
                <option value="static">A fixed list</option>
                <option value="api">An API response</option>
              </select>
            </label>
          </div>

          {value.source === "static" ? (
            <StaticItemsEditor
              value={value.staticItems}
              onChange={(staticItems) => set({ staticItems })}
              maxItems={limits?.pages?.maxItems}
            />
          ) : (
            <>
              <RestSourceEditor
                value={api.dataSource}
                onChange={(dataSource) => set({ api: { ...api, dataSource } })}
                profiles={profiles}
                parameters={parameters}
                limits={limits}
              />
              <div className="an-fields two">
                <label>
                  Label field
                  <input
                    list="ap-item-fields"
                    placeholder="Name"
                    value={api.labelField}
                    onChange={(e) =>
                      set({ api: { ...api, labelField: e.target.value } })
                    }
                  />
                  <small>Shown in the dropdown. Blank uses the value.</small>
                </label>
                <label>
                  Value field
                  <input
                    list="ap-item-fields"
                    placeholder="Name"
                    value={api.valueField}
                    onChange={(e) =>
                      set({ api: { ...api, valueField: e.target.value } })
                    }
                  />
                  <small>Passed to charts, e.g. as TabName.</small>
                </label>
                <datalist id="ap-item-fields">
                  {fields.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div className="an-fields two">
            <label>
              Default item
              {itemOptions.length ? (
                <select
                  value={value.defaultValue}
                  onChange={(e) => set({ defaultValue: e.target.value })}
                >
                  <option value="">First item</option>
                  {itemOptions.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label || i.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  placeholder="First item"
                  value={value.defaultValue}
                  onChange={(e) => set({ defaultValue: e.target.value })}
                />
              )}
            </label>
            <label>
              Items without a rule
              <select
                value={value.unmatched}
                onChange={(e) =>
                  set({ unmatched: e.target.value as UnmatchedBehavior })
                }
              >
                {UNMATCHED_BEHAVIORS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="an-fields two">
            <label className="an-check">
              <input
                type="checkbox"
                checked={value.rememberInLink}
                onChange={(e) => set({ rememberInLink: e.target.checked })}
              />{" "}
              Remember the selection in the link
            </label>
            <label>
              Show search above (items)
              <input
                type="number"
                min={0}
                value={value.searchThreshold}
                onChange={(e) =>
                  set({
                    searchThreshold: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </div>

          <div className="ap-test">
            <button
              className="secondary-button"
              disabled={testing}
              onClick={onTest}
            >
              <Play size={14} /> {testing ? "Testing…" : "Test items"}
            </button>
            {preview && (
              <small>
                {preview.items.length} item(s)
                {preview.truncated ? " (list truncated)" : ""}
                {preview.recordsPath
                  ? ` · Records Path ${preview.recordsPath}`
                  : ""}
                {preview.cached ? " · from cache" : ""}
              </small>
            )}
          </div>
          {preview && preview.items.length > 0 && (
            <div className="ap-preview-table" role="table">
              <div role="row" className="ap-preview-head">
                <span>Item</span>
                <span>Opens</span>
              </div>
              {preview.items.map((i) => (
                <div role="row" key={i.value}>
                  <span title={i.value}>{i.label}</span>
                  <span className={i.route ? "" : "an-hint"}>
                    {routeLabel(i.route)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
