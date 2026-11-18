import React, { useMemo } from 'react';
import { Layers, MonitorSmartphone } from 'lucide-react';
import { NONE, uniq, type CategoryFilter, type ClientCategory, type useCategorySuggestions } from './clientCategory.utils';

// Client categorization on Onboarding Clients and the Enquiry List: category → subcategory, "Uses software?" and the
// software's name. Suggestions = a starter list + every value already used, so new categories can simply be typed.

const field = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium';
const label = 'text-xs font-bold text-slate-800 dark:text-zinc-200';

/** The form section (used in the Add / Edit forms) */
export const ClientCategoryFields: React.FC<{
  value: ClientCategory;
  onChange: (v: ClientCategory) => void;
  suggestions: ReturnType<typeof useCategorySuggestions>;
  idPrefix: string;
}> = ({ value, onChange, suggestions, idPrefix }) => {
  const subs = useMemo(() => {
    const key = Object.keys(suggestions.map).find((k) => k.toLowerCase() === (value.category || '').trim().toLowerCase());
    return key ? uniq([...suggestions.map[key]]) : [];
  }, [suggestions, value.category]);
  const set = (patch: Partial<ClientCategory>) => onChange({ ...value, ...patch });
  const yesNo = value.usesSoftware === true ? 'yes' : value.usesSoftware === false ? 'no' : '';

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5">
      <p className="text-[10px] uppercase font-black tracking-wider text-slate-500 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Category</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-cat`} className={label}>Category</label>
          <input id={`${idPrefix}-cat`} list={`${idPrefix}-cats`} placeholder="e.g. Healthcare" value={value.category || ''}
            onChange={(e) => set({ category: e.target.value, ...(e.target.value !== value.category ? { subcategory: '' } : {}) })} className={field} />
          <datalist id={`${idPrefix}-cats`}>{suggestions.categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-sub`} className={label}>Subcategory</label>
          <input id={`${idPrefix}-sub`} list={`${idPrefix}-subs`} placeholder={subs[0] ? `e.g. ${subs[0]}` : 'e.g. Clinic'} value={value.subcategory || ''}
            onChange={(e) => set({ subcategory: e.target.value })} className={field} />
          <datalist id={`${idPrefix}-subs`}>{subs.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-uses`} className={label}>Uses software?</label>
          <select id={`${idPrefix}-uses`} value={yesNo}
            onChange={(e) => set({ usesSoftware: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null, ...(e.target.value !== 'yes' ? { softwareName: '' } : {}) })}
            className={`${field} cursor-pointer`}>
            <option value="">Not asked</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        {value.usesSoftware === true && (
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-sw`} className={label}>Software name</label>
            <input id={`${idPrefix}-sw`} list={`${idPrefix}-sws`} placeholder="e.g. Tally" value={value.softwareName || ''}
              onChange={(e) => set({ softwareName: e.target.value })} className={field} />
            <datalist id={`${idPrefix}-sws`}>{suggestions.software.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Filters ─────────────────────────────────────────────────────────────────────

const select = 'px-3 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[12rem]';

/** Category / subcategory / software filters for a client list (built from the values in that list) */
export const CategoryFilterBar: React.FC<{ items: ClientCategory[]; value: CategoryFilter; onChange: (f: CategoryFilter) => void }> = ({ items, value, onChange }) => {
  const categories = useMemo(() => uniq(items.map((i) => i.category)), [items]);
  const subcategories = useMemo(
    () => uniq(items.filter((i) => !value.category || value.category === NONE || (i.category || '').trim().toLowerCase() === value.category.toLowerCase()).map((i) => i.subcategory)),
    [items, value.category],
  );
  const software = useMemo(() => uniq(items.map((i) => (i.usesSoftware ? i.softwareName : null))), [items]);
  return (
    <>
      <select aria-label="Category" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value, subcategory: '' })} className={select}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={NONE}>No category</option>
      </select>
      <select aria-label="Subcategory" value={value.subcategory} onChange={(e) => onChange({ ...value, subcategory: e.target.value })} className={select} disabled={!subcategories.length}>
        <option value="">All subcategories</option>
        {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select aria-label="Software" value={value.software} onChange={(e) => onChange({ ...value, software: e.target.value })} className={select}>
        <option value="">Any software</option>
        <option value="yes">Uses software</option>
        <option value="no">No software</option>
        <option value={NONE}>Not asked</option>
        {software.length > 0 && <optgroup label="Software">{software.map((s) => <option key={s} value={`name:${s}`}>{s}</option>)}</optgroup>}
      </select>
    </>
  );
};

/** One line under the client's name in the lists */
export const CategoryLine: React.FC<{ item: ClientCategory }> = ({ item }) => {
  if (!item.category && !item.subcategory && item.usesSoftware == null) return null;
  return (
    <span className="flex flex-wrap items-center gap-1 mt-1">
      {(item.category || item.subcategory) && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40">
          <Layers className="w-2.5 h-2.5" />{[item.category, item.subcategory].filter(Boolean).join(' › ')}
        </span>
      )}
      {item.usesSoftware != null && (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${item.usesSoftware ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'}`}>
          <MonitorSmartphone className="w-2.5 h-2.5" />{item.usesSoftware ? (item.softwareName || 'Uses software') : 'No software'}
        </span>
      )}
    </span>
  );
};
