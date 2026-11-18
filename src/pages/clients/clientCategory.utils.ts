import { useMemo } from 'react';

// Client categorization helpers (Onboarding Clients and the Enquiry List); the components are in ClientCategory.tsx

export interface ClientCategory {
  category?: string | null;
  subcategory?: string | null;
  usesSoftware?: boolean | null;
  softwareName?: string | null;
}

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  Healthcare: ['Clinic', 'Hospital', 'Pharmacy', 'Diagnostic Lab', 'Dental', 'Ayurveda'],
  Education: ['School', 'College', 'Coaching Centre', 'Training Institute'],
  Retail: ['Supermarket', 'Bakery', 'Textiles', 'Electronics', 'Jewellery'],
  Finance: ['Co-operative Bank', 'Co-operative Society', 'NBFC', 'Insurance'],
  Automobile: ['Showroom', 'Service Centre', 'Spare Parts'],
  'Real Estate': ['Builder', 'Broker'],
  Hospitality: ['Hotel', 'Resort', 'Restaurant', 'Houseboat'],
  Government: ['Panchayat', 'Municipality', 'Police'],
  'Events & Sports': ['Event Organiser', 'Sports Club'],
};

export const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Categories and subcategories to suggest: the starter list plus whatever is already used */
export function useCategorySuggestions(items: ClientCategory[]) {
  return useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [c, subs] of Object.entries(DEFAULT_CATEGORIES)) map[c] = new Set(subs);
    for (const it of items) {
      const c = it.category?.trim();
      if (!c) continue;
      const key = Object.keys(map).find((k) => k.toLowerCase() === c.toLowerCase()) ?? c;
      map[key] ??= new Set();
      if (it.subcategory?.trim()) map[key].add(it.subcategory.trim());
    }
    const software = uniq(items.map((i) => (i.usesSoftware ? i.softwareName : null)));
    return { map, categories: Object.keys(map).sort((a, b) => a.localeCompare(b)), software };
  }, [items]);
}

/** Values to send to the API (empty → null) */
export const categoryPayload = (v: ClientCategory): ClientCategory => ({
  category: v.category?.trim() || null,
  subcategory: v.subcategory?.trim() || null,
  usesSoftware: v.usesSoftware ?? null,
  softwareName: v.usesSoftware ? v.softwareName?.trim() || null : null,
});

export interface CategoryFilter { category: string; subcategory: string; software: string }
export const NO_CATEGORY_FILTER: CategoryFilter = { category: '', subcategory: '', software: '' };
export const NONE = '__none__';

export function matchesCategoryFilter(it: ClientCategory, f: CategoryFilter) {
  const eq = (a: string | null | undefined, b: string) => (a || '').trim().toLowerCase() === b.toLowerCase();
  if (f.category === NONE ? !!it.category?.trim() : f.category && !eq(it.category, f.category)) return false;
  if (f.subcategory && !eq(it.subcategory, f.subcategory)) return false;
  if (f.software === 'yes' && it.usesSoftware !== true) return false;
  if (f.software === 'no' && it.usesSoftware !== false) return false;
  if (f.software === NONE && it.usesSoftware != null) return false;
  if (f.software.startsWith('name:') && !(it.usesSoftware && eq(it.softwareName, f.software.slice(5)))) return false;
  return true;
}

