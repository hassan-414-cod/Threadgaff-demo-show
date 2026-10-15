import type { AttributeDefinition } from '../services/catalog.service';

/** Filters added on the admin Filters page are stored as attributes with this code prefix. */
export const FILTER_CODE_PREFIX = 'filter_';

export interface BuiltinFilter {
  code: string;
  /** Heading shown on the storefront and on the Filters page. */
  title: string;
  /** Attribute name used if the attribute does not exist yet. */
  name: string;
  valueType: 'select' | 'multiselect';
}

/** The filters the shop already had. They stay; only their checklists are editable. */
export const BUILTIN_FILTERS: readonly BuiltinFilter[] = [
  { code: 'sustainability', title: 'Sustainability & Ethics', name: 'Sustainability', valueType: 'multiselect' },
  { code: 'material', title: 'Material', name: 'Material', valueType: 'select' },
  { code: 'gender', title: 'Gender', name: 'Gender', valueType: 'select' },
];

export function builtinFilter(code: string): BuiltinFilter | undefined {
  return BUILTIN_FILTERS.find((f) => f.code === code);
}

export function isCustomFilterCode(code: string | undefined | null): boolean {
  return !!code && code.startsWith(FILTER_CODE_PREFIX);
}

/** Heading for a filter attribute. */
export function filterTitle(def: Pick<AttributeDefinition, 'code' | 'name'>): string {
  return builtinFilter(def.code)?.title || def.name;
}

/** Checklist labels of a filter, in the order set on the Filters page. */
export function filterOptionLabels(def: Pick<AttributeDefinition, 'options'> | null | undefined): string[] {
  return (def?.options || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((o) => o.label)
    .filter(Boolean);
}

/** Filters added on the Filters page (not the built-in ones), oldest first. */
export function customFilterDefinitions(defs: AttributeDefinition[]): AttributeDefinition[] {
  return defs
    .filter((d) => isCustomFilterCode(d.code) && d.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

/** Turns a heading into a safe attribute code, e.g. "Season" → "filter_season". */
export function filterCodeFor(heading: string): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return FILTER_CODE_PREFIX + (slug || 'filter');
}

/** Option value (slug) for a checklist label. */
export function optionValueFor(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'option'
  );
}
