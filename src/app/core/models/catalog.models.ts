export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: string;
  tokenType: string;
}

export interface AuthUser {
  id: string;
  email: string;
  brand: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId?: string | null;
  children?: Category[];
}

export interface ProductImage {
  id: string;
  url: string;
  altText?: string | null;
  role: 'card' | 'gallery' | 'view';
  angle: string;
  sortOrder: number;
  productColorId?: string | null;
}

export interface ProductColor {
  id: string;
  name: string;
  hex: string;
  isDefault: boolean;
  sortOrder: number;
  priceOverride?: string | null;
  /** Optional marketing copy for this colour variant (storefront cards). */
  description?: string | null;
  images?: ProductImage[];
}

export interface ProductSizeLink {
  id: string;
  sizeId: string;
  isAvailable: boolean;
  sortOrder: number;
  size?: { id: string; code: string; label: string };
}

export interface ProductTag {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  kind?: 'tag' | 'brand';
}

export interface ProductAttributeValue {
  id: string;
  attributeDefinitionId: string;
  valueText?: string | null;
  optionId?: string | null;
  optionIds?: string[] | null;
  attributeDefinition?: {
    id: string;
    code: string;
    name: string;
    valueType: string;
  };
  option?: { id: string; value: string; label: string };
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  categoryId?: string | null;
  extraCategoryIds?: string[] | null;
  category?: Category | null;
  template?: string | null;
  badge?: string | null;
  ecoTag?: string | null;
  basePrice: string | number;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  tags?: ProductTag[];
  colors?: ProductColor[];
  sizes?: ProductSizeLink[];
  images?: ProductImage[];
  attributeValues?: ProductAttributeValue[];
}

export interface PaginatedProducts {
  items: Product[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
