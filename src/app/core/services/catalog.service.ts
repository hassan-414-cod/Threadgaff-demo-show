import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  map,
  of,
  forkJoin,
  catchError,
  switchMap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Category,
  PaginatedProducts,
  Product,
  ProductTag,
} from '../models/catalog.models';

export type TagKind = 'tag' | 'brand';

export interface ProductColorInput {
  name: string;
  hex: string;
  priceOverride?: number;
  skuSuffix?: string;
  isDefault?: boolean;
  sortOrder?: number;
  /** Optional marketing copy for this colour variant. */
  description?: string;
  /** Shared catalog Color library id (not the product-colour row id). */
  colorId?: string;
  images?: Array<{
    url: string;
    altText?: string;
    role?: string;
    angle?: string;
    sortOrder?: number;
  }>;
}

export interface ProductAttributeInput {
  attributeDefinitionId: string;
  valueText?: string;
  optionId?: string;
  optionIds?: string[];
}

export interface ProductSizeInput {
  sizeId: string;
  isAvailable?: boolean;
  sortOrder?: number;
}

export interface ProductWritePayload {
  name: string;
  slug?: string;
  sku?: string;
  description?: string;
  shortDescription?: string;
  categoryId?: string | null;
  extraCategoryIds?: string[];
  template?: string;
  badge?: string;
  ecoTag?: string;
  basePrice?: number;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  isStandalone?: boolean;
  tagIds?: string[];
  sizes?: ProductSizeInput[];
  attributes?: ProductAttributeInput[];
  colors?: ProductColorInput[];
  images?: Array<{
    url: string;
    altText?: string;
    role?: string;
    angle?: string;
    sortOrder?: number;
  }>;
}

export interface TagWritePayload {
  name: string;
  slug?: string;
  description?: string;
  kind?: TagKind;
}

export interface AttributeOptionInput {
  value: string;
  label: string;
  sortOrder?: number;
}

export interface AttributeWritePayload {
  code: string;
  name: string;
  valueType?: 'text' | 'number' | 'select' | 'multiselect' | 'boolean';
  isRequired?: boolean;
  sortOrder?: number;
  options?: AttributeOptionInput[];
}

export interface AttributeDefinition {
  id: string;
  code: string;
  name: string;
  valueType: string;
  isRequired: boolean;
  sortOrder: number;
  isActive?: boolean;
  options?: Array<{
    id: string;
    value: string;
    label: string;
    sortOrder: number;
  }>;
}

export interface CatalogSize {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
}

export interface CategoryWritePayload {
  name: string;
  slug?: string;
  description?: string;
  parentId?: string | null;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface Enquiry {
  id: string;
  ref: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  segment?: string | null;
  message?: string | null;
  sampleName?: string | null;
  sampleDataUrl?: string | null;
  status: 'new' | 'quoted' | 'closed';
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnquiryPayload {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  segment?: string;
  message?: string;
  sampleName?: string;
  sampleDataUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly base = `${environment.apiBaseUrl}/catalog`;
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getCategoryTree(activeOnly = true): Observable<Category[]> {
    const params = new HttpParams().set('activeOnly', String(activeOnly));
    return this.http.get<Category[]>(`${this.base}/categories/tree`, { params });
  }

  getCategories(activeOnly = true): Observable<Category[]> {
    const params = new HttpParams().set('activeOnly', String(activeOnly));
    return this.http.get<Category[]>(`${this.base}/categories`, { params });
  }

  createCategory(payload: CategoryWritePayload): Observable<Category> {
    return this.http.post<Category>(`${this.base}/categories`, payload);
  }

  updateCategory(
    id: string,
    payload: Partial<CategoryWritePayload>,
  ): Observable<Category> {
    return this.http.patch<Category>(`${this.base}/categories/${id}`, payload);
  }

  deleteCategory(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/categories/${id}`);
  }

  reorderCategories(
    items: Array<{ id: string; sortOrder: number }>,
  ): Observable<unknown> {
    return this.http.patch(`${this.base}/categories/reorder`, { items });
  }

  getProducts(
    opts: {
      page?: number;
      limit?: number;
      categoryId?: string;
      includeDescendants?: boolean;
      search?: string;
      isFeatured?: boolean;
      isActive?: boolean;
      tagId?: string;
      attributeCode?: string;
      attributeValue?: string;
      attributeOptionId?: string;
    } = {},
  ): Observable<PaginatedProducts> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<PaginatedProducts>(`${this.base}/products`, {
      params,
    });
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.base}/products/${id}`);
  }

  /**
   * List endpoints often omit per-colour images. Hydrate those products so
   * storefront swatches can swap card photos.
   */
  enrichWithColorMedia(products: Product[]): Observable<Product[]> {
    const need = products.filter(
      (p) =>
        !!p.colors?.length &&
        !(p.colors || []).some((c) => (c.images || []).length > 0),
    );
    if (!need.length) return of(products);
    return forkJoin(
      need.map((p) => this.getProduct(p.id).pipe(catchError(() => of(p)))),
    ).pipe(
      map((full) => {
        const byId = new Map(full.map((p) => [p.id, p]));
        return products.map((p) => byId.get(p.id) || p);
      }),
    );
  }

  getProductBySlug(slug: string): Observable<Product> {
    return this.http.get<Product>(`${this.base}/products/slug/${slug}`);
  }

  createProduct(payload: ProductWritePayload): Observable<Product> {
    return this.http.post<Product>(`${this.base}/products`, payload);
  }

  updateProduct(
    id: string,
    payload: Partial<ProductWritePayload>,
  ): Observable<Product> {
    return this.http.patch<Product>(`${this.base}/products/${id}`, payload);
  }

  /**
   * Permanently remove a product (and variants/images) from the database.
   * Nest DELETE returns 404 for inactive/hidden products, so we re-activate
   * first, clear linked rows if needed, then DELETE. Never soft-hides.
   */
  deleteProduct(id: string): Observable<unknown> {
    const gone = { deleted: true, id };
    const del$ = () =>
      this.http.delete(`${this.base}/products/${id}`).pipe(
        catchError((err) => {
          if (err?.status === 404) return of(gone);
          return throwError(() => err);
        }),
      );

    const prepare$ = this.updateProduct(id, {
      isActive: true,
      isFeatured: false,
      colors: [],
      images: [],
      attributes: [],
      sizes: [],
      tagIds: [],
    }).pipe(
      catchError((err) => {
        // Still try a plain activate if the full strip payload is rejected.
        if (err?.status === 404) return of(null);
        return this.updateProduct(id, { isActive: true }).pipe(
          catchError(() => of(null)),
        );
      }),
    );

    return prepare$.pipe(
      switchMap(() => del$()),
      catchError((err) =>
        // One more attempt after a bare activate (in case strip left a bad state).
        this.updateProduct(id, { isActive: true }).pipe(
          catchError(() => of(null)),
          switchMap(() =>
            del$().pipe(
              catchError((err2) => {
                if (err2?.status === 404) return of(gone);
                return throwError(() => err2 || err);
              }),
            ),
          ),
        ),
      ),
    );
  }

  uploadProductImage(
    productId: string,
    file: File,
    meta: {
      role?: string;
      angle?: string;
      altText?: string;
      sortOrder?: number;
      productColorId?: string;
    } = {},
  ): Observable<unknown> {
    const form = new FormData();
    form.append('file', file);
    if (meta.role) form.append('role', meta.role);
    if (meta.angle) form.append('angle', meta.angle);
    if (meta.altText) form.append('altText', meta.altText);
    if (meta.sortOrder != null) form.append('sortOrder', String(meta.sortOrder));
    if (meta.productColorId) form.append('productColorId', meta.productColorId);
    return this.http.post(`${this.base}/products/${productId}/images/upload`, form);
  }

  getCollectionCategories(activeOnly = true): Observable<Category[]> {
    return this.getCategoryTree(activeOnly).pipe(
      map((roots) => {
        const apparel = roots.find((r) => r.slug === 'apparel') || roots[0];
        const children = apparel?.children || [];
        return activeOnly ? children.filter((c) => c.isActive) : children;
      }),
    );
  }

  getApparelRootId(): Observable<string | null> {
    return this.getCategoryTree(false).pipe(
      map((roots) => {
        const apparel = roots.find((r) => r.slug === 'apparel') || roots[0];
        return apparel?.id ?? null;
      }),
    );
  }

  getTags(kind?: TagKind): Observable<ProductTag[]> {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get<ProductTag[]>(`${this.base}/tags`, { params });
  }

  getBrands(): Observable<ProductTag[]> {
    return this.getTags('brand').pipe(
      map((tags) => [...tags].sort((a, b) => a.name.localeCompare(b.name))),
    );
  }

  createTag(payload: TagWritePayload): Observable<ProductTag> {
    return this.http.post<ProductTag>(`${this.base}/tags`, payload);
  }

  createBrand(name: string): Observable<ProductTag> {
    return this.createTag({
      name: name.trim(),
      kind: 'brand',
      description: 'brand',
    });
  }

  updateTag(
    id: string,
    payload: Partial<TagWritePayload>,
  ): Observable<ProductTag> {
    return this.http.patch<ProductTag>(`${this.base}/tags/${id}`, payload);
  }

  deleteTag(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/tags/${id}`);
  }

  getSizes(): Observable<CatalogSize[]> {
    return this.http.get<CatalogSize[]>(`${this.base}/sizes`);
  }

  getAttributes(): Observable<AttributeDefinition[]> {
    return this.http.get<AttributeDefinition[]>(`${this.base}/attributes`);
  }

  createAttribute(
    payload: AttributeWritePayload,
  ): Observable<AttributeDefinition> {
    return this.http.post<AttributeDefinition>(
      `${this.base}/attributes`,
      payload,
    );
  }

  updateAttribute(
    id: string,
    payload: Partial<AttributeWritePayload>,
  ): Observable<AttributeDefinition> {
    return this.http.patch<AttributeDefinition>(
      `${this.base}/attributes/${id}`,
      payload,
    );
  }

  deleteAttribute(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/attributes/${id}`);
  }

  createEnquiry(
    payload: CreateEnquiryPayload,
  ): Observable<{ id: string; ref: string; message: string }> {
    return this.http.post<{ id: string; ref: string; message: string }>(
      `${this.api}/enquiries`,
      payload,
    );
  }

  getEnquiries(status?: string): Observable<Enquiry[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<Enquiry[]>(`${this.api}/enquiries`, { params });
  }

  updateEnquiry(
    id: string,
    payload: { status?: string; adminNotes?: string },
  ): Observable<Enquiry> {
    return this.http.patch<Enquiry>(`${this.api}/enquiries/${id}`, payload);
  }

  cardImageUrl(product: Product, colorId?: string | null): string {
    const colors = product.colors || [];
    const color =
      (colorId ? colors.find((c) => c.id === colorId) : null) ||
      colors.find((c) => c.isDefault) ||
      colors[0];
    return this.colorCardImageUrl(product, color);
  }

  /** Card / front image for a specific colour variant (falls back to product media). */
  colorCardImageUrl(
    product: Product,
    color?: { id?: string; images?: Product['images'] } | null,
  ): string {
    const colorImages = [...(color?.images || [])];
    const linked = (product.images || []).filter(
      (im) => color?.id && im.productColorId === color.id,
    );
    const all = [...colorImages, ...linked, ...(product.images || [])];
    const pick =
      all.find((i) => i.role === 'card' && i.url?.includes('/uploads/')) ||
      all.find(
        (i) =>
          (i.role === 'view' || i.role === 'gallery') &&
          (i.angle === 'front' || !i.angle) &&
          i.url?.includes('/uploads/'),
      ) ||
      all.find((i) => i.url?.includes('/uploads/')) ||
      all.find((i) => i.role === 'card') ||
      all.find((i) => i.role === 'view' || i.role === 'gallery') ||
      all[0];
    return this.normalizeMediaUrl(
      pick?.url || this.fallbackImageForProduct(product),
    );
  }

  fallbackImageForProduct(product: Product): string {
    const key = `${product.template || ''} ${product.slug || ''} ${product.name || ''}`.toLowerCase();
    if (key.includes('hood')) return '/assets/images/prod_hoodie.jpg';
    if (key.includes('sweat')) return '/assets/images/prod_sweatshirt.jpg';
    if (key.includes('polo')) return '/assets/images/prod_polo.jpg';
    if (key.includes('jogger')) return '/assets/images/prod_joggers.jpg';
    if (key.includes('track')) return '/assets/images/prod_tracksuit.jpg';
    if (key.includes('set') || key.includes('co-ord') || key.includes('coord')) {
      return '/assets/images/prod_sets.jpg';
    }
    return '/assets/images/prod_tshirt.jpg';
  }

  normalizeMediaUrl(raw: string): string {
    if (!raw) return '/assets/images/prod_tshirt.jpg';
    if (
      raw.startsWith('http') ||
      raw.startsWith('data:') ||
      raw.startsWith('/assets/') ||
      raw.startsWith('assets/')
    ) {
      return raw.startsWith('assets/') ? `/${raw}` : raw;
    }
    if (raw.startsWith('/uploads')) {
      return `${environment.uploadsBaseUrl}${raw}`;
    }
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
}
