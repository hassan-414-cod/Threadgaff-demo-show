import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Category, Product, ProductTag } from '../../core/models/catalog.models';
import {
  AttributeDefinition,
  CatalogService,
  Enquiry,
} from '../../core/services/catalog.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminProductEditorComponent } from './admin-product-editor.component';
import { priceLabel as formatProductPrice } from '../../core/utils/price';

type AdminView =
  | 'overview'
  | 'collections'
  | 'products'
  | 'brands'
  | 'categories'
  | 'attributes'
  | 'orders'
  | 'enquiries'
  | 'settings';
type CatalogMode = 'collections' | 'extras';
type ProductNav = 'all' | 'add' | 'brands' | 'categories' | 'attributes';

interface ProductEditorState {
  productId: string | null;
  categoryId: string | null;
  categoryName: string;
  lockCategory: boolean;
  startStandalone: boolean;
}

interface CategoryTreeListRow {
  category: Category;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  collapsed: boolean;
}

@Component({
  selector: 'tg-admin-page',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminProductEditorComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          THREADGAFF
          <span>Admin console</span>
        </div>
        <button
          type="button"
          class="nav-btn"
          [class.active]="view() === 'overview' && !editor()"
          (click)="setView('overview')"
        >
          Overview
        </button>

        <div class="nav-group" [class.open]="productsNavOpen()">
          <button
            type="button"
            class="nav-btn nav-parent"
            [class.active]="isProductsSection()"
            (click)="toggleProductsNav()"
          >
            Products
            <span class="nav-caret">{{ productsNavOpen() ? '▾' : '▸' }}</span>
          </button>
          @if (productsNavOpen()) {
            <div class="nav-sub">
              <button
                type="button"
                class="nav-sub-btn"
                [class.active]="view() === 'products' && !editor()"
                (click)="goProducts('all')"
              >
                All Products
              </button>
              <button
                type="button"
                class="nav-sub-btn"
                [class.active]="!!editor() && !editor()?.productId"
                (click)="goProducts('add')"
              >
                Add New Product
              </button>
              <button
                type="button"
                class="nav-sub-btn"
                [class.active]="view() === 'brands'"
                (click)="goProducts('brands')"
              >
                Brands
              </button>
              <button
                type="button"
                class="nav-sub-btn"
                [class.active]="view() === 'categories' || view() === 'collections'"
                (click)="goProducts('categories')"
              >
                Categories
              </button>
              <button
                type="button"
                class="nav-sub-btn"
                [class.active]="view() === 'attributes'"
                (click)="goProducts('attributes')"
              >
                Attributes
              </button>
            </div>
          }
        </div>

        <button
          type="button"
          class="nav-btn"
          [class.active]="view() === 'orders'"
          (click)="setView('orders')"
        >
          Orders
        </button>
        <button
          type="button"
          class="nav-btn"
          [class.active]="view() === 'enquiries'"
          (click)="setView('enquiries')"
        >
          Enquiries
        </button>
        <button
          type="button"
          class="nav-btn"
          [class.active]="view() === 'settings'"
          (click)="setView('settings')"
        >
          Settings
        </button>
        <div class="spacer"></div>
        <a class="nav-btn storefront" routerLink="/">View storefront</a>
        <button type="button" class="nav-btn" (click)="logout()">Sign out</button>
      </aside>

      <main class="main">
        @if (error()) {
          <div class="alert">{{ error() }}</div>
        }

        @if (editor(); as ed) {
          <tg-admin-product-editor
            [productId]="ed.productId"
            [collections]="collections()"
            [existingProducts]="products()"
            [categoryId]="ed.categoryId"
            [categoryName]="ed.categoryName"
            [lockCategory]="ed.lockCategory"
            [startStandalone]="ed.startStandalone"
            [apparelRootId]="apparelRootId()"
            (cancel)="closeEditor()"
            (saved)="onProductSaved($event)"
            (deleted)="onProductDeleted()"
            (categoriesChanged)="reloadCollections()"
          />
        } @else {
          @if (view() === 'overview') {
          <div class="topbar">
            <div>
              <h1>Overview</h1>
              <p>
                Live catalogue plus incoming checkout orders and quote enquiries.
              </p>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <span>Collections</span>
              <b>{{ collections().length }}</b>
            </div>
            <div class="stat">
              <span>Products</span>
              <b>{{ products().length }}</b>
            </div>
            <div class="stat">
              <span>Live</span>
              <b>{{ liveCount() }}</b>
            </div>
            <div class="stat">
              <span>Hidden</span>
              <b>{{ hiddenCount() }}</b>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <span>Orders</span>
              <b>0</b>
            </div>
            <div class="stat">
              <span>Enquiries</span>
              <b>0</b>
            </div>
            <div class="stat">
              <span>Featured</span>
              <b>{{ featuredCount() }}</b>
            </div>
          </div>

          <div class="ops-split">
            <div class="panel">
              <div class="panel-h">
                <h2>Recent products</h2>
                <button type="button" class="btn btn-ghost" (click)="goProducts('all')">
                  View all
                </button>
              </div>
              @if (!products().length) {
                <div class="empty">No products yet.</div>
              } @else {
                <ul class="ops-feed">
                  @for (p of products().slice(0, 6); track p.id) {
                    <li (click)="openProduct(p)">
                      <img
                        class="ops-thumb"
                        [src]="catalog.cardImageUrl(p)"
                        [alt]="p.name"
                      />
                      <div>
                        <strong>{{ p.name }}</strong>
                        <small>{{ p.category?.name || p.template || 'Apparel' }}</small>
                      </div>
                      <div class="ops-feed-meta">
                        <span class="status" [class.live]="p.isActive" [class.hidden]="!p.isActive">
                          {{ p.isActive ? 'Live' : 'Hidden' }}
                        </span>
                        <small>{{ p.sku || p.slug }}</small>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
            <div class="panel">
              <div class="panel-h">
                <h2>Recent enquiries</h2>
                <button type="button" class="btn btn-ghost" (click)="setView('enquiries')">
                  View all
                </button>
              </div>
              @if (!enquiries().length) {
                <div class="empty">No enquiries yet. Quote requests will appear here.</div>
              } @else {
                <ul class="ops-feed">
                  @for (e of enquiries().slice(0, 5); track e.id) {
                    <li>
                      <div>
                        <strong>{{ e.ref }}</strong>
                        <small>{{ e.name }} · {{ e.email }}</small>
                      </div>
                      <div class="ops-feed-meta">
                        <span class="status">{{ e.status }}</span>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        }

        @if (view() === 'collections' || view() === 'categories' || view() === 'products') {
          @if (!drill()) {
            <div class="topbar">
              <div>
                <p class="page-kicker">
                  {{
                    view() === 'products'
                      ? '01 / All products'
                      : view() === 'categories'
                        ? '01 / Categories'
                        : '01 / Collections overview'
                  }}
                </p>
                <h1>
                  {{
                    view() === 'products'
                      ? 'All Products'
                      : view() === 'categories'
                        ? 'Categories'
                        : catalogMode() === 'collections'
                          ? 'Collections'
                          : 'Extra Products'
                  }}
                </h1>
                <p>
                  @if (view() === 'products') {
                    Every catalogue product. Open one to edit details, media and variants.
                  } @else if (view() === 'categories') {
                    Manage your product category tree. Open a category to see its products.
                  } @else if (catalogMode() === 'collections') {
                    Group your products by garment type. Open a collection to add or edit its
                    products.
                  } @else {
                    Standalone products with no collection. They appear under “Shop the best
                    selling”.
                  }
                </p>
              </div>
              <div class="toolbar">
                @if (view() === 'collections') {
                  <div class="catalog-modes">
                    <button
                      type="button"
                      class="btn"
                      [class.active]="catalogMode() === 'collections'"
                      (click)="setCatalogMode('collections')"
                    >
                      Collections
                    </button>
                    <button
                      type="button"
                      class="btn"
                      [class.active]="catalogMode() === 'extras'"
                      (click)="setCatalogMode('extras')"
                    >
                      Extra Products
                    </button>
                  </div>
                }
                <button type="button" class="btn btn-ghost" (click)="loadCatalog(); toast('Catalogue refreshed')">
                  Refresh
                </button>
                @if (view() === 'products') {
                  <button type="button" class="btn btn-gold" (click)="goProducts('add')">
                    + Add Product
                  </button>
                } @else if (view() === 'categories' || catalogMode() === 'collections') {
                  <button type="button" class="btn btn-gold" (click)="openCollectionModal()">
                    + Add {{ view() === 'categories' ? 'Category' : 'Collection' }}
                  </button>
                } @else {
                  <button type="button" class="btn btn-gold" (click)="startNewProduct(true)">
                    + Add Product
                  </button>
                }
              </div>
            </div>

            @if (view() === 'categories' || (view() === 'collections' && catalogMode() === 'collections')) {
              <div class="panel">
                <div class="panel-h">
                  <div>
                    <h2>{{ view() === 'categories' ? 'Categories' : 'Collections' }}</h2>
                    <p class="panel-sub">
                      {{
                        view() === 'categories'
                          ? 'Manage your product category hierarchy and visibility.'
                          : 'Manage your garment collections, products and visibility.'
                      }}
                    </p>
                  </div>
                  <div class="toolbar">
                    <input
                      type="text"
                      placeholder="Search collections…"
                      [ngModel]="colSearch()"
                      (ngModelChange)="colSearch.set($event)"
                    />
                  </div>
                </div>
                <div class="table-wrap">
                  <table class="col-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>{{ view() === 'categories' ? 'Category' : 'Collection' }}</th>
                        <th>Slug</th>
                        <th>Products</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of categoryTreeRows(); track row.category.id) {
                        <tr
                          class="tree-row"
                          [class.tree-child]="row.depth > 0"
                          [class.drag-over]="dragOverCategoryId() === row.category.id"
                          [class.dragging]="dragCategoryId() === row.category.id"
                          draggable="false"
                          (click)="openCollection(row.category)"
                          (dragover)="onCategoryDragOver($event, row)"
                          (dragleave)="onCategoryDragLeave(row.category.id)"
                          (drop)="onCategoryDrop($event, row)"
                        >
                          <td class="drag-cell">
                            <span
                              class="drag-handle"
                              title="Drag to reorder"
                              draggable="true"
                              (dragstart)="onCategoryDragStart($event, row)"
                              (dragend)="onCategoryDragEnd()"
                              (click)="$event.stopPropagation()"
                            >⋮⋮</span>
                          </td>
                          <td>
                            <div
                              class="col-cell tree-cell"
                              [style.padding-left.px]="row.depth * 22"
                            >
                              @if (row.hasChildren) {
                                <button
                                  type="button"
                                  class="tree-toggle"
                                  [attr.aria-expanded]="!row.collapsed"
                                  (click)="toggleCategoryExpand(row.category.id, $event)"
                                >
                                  {{ row.collapsed ? '▸' : '▾' }}
                                </button>
                              } @else {
                                <span class="tree-spacer" aria-hidden="true"></span>
                              }
                              @if (row.category.imageUrl) {
                                <img
                                  class="prod-thumb"
                                  [src]="row.category.imageUrl"
                                  [alt]="row.category.name"
                                />
                              } @else {
                                <span class="prod-thumb empty-thumb"></span>
                              }
                              <div class="col-meta">
                                <span class="prod-name">
                                  @if (row.depth > 0) {
                                    <span class="tree-branch" aria-hidden="true">└</span>
                                  }
                                  {{ row.category.name }}
                                </span>
                                <span class="col-desc">
                                  {{ row.category.description || row.category.slug }}
                                  @if (row.hasChildren) {
                                    · {{ row.childCount }} sub
                                  }
                                </span>
                              </div>
                            </div>
                          </td>
                          <td><span class="cat">{{ row.category.slug }}</span></td>
                          <td>
                            <span class="col-count">{{ productCountFor(row.category) }}</span>
                          </td>
                          <td>
                            <span
                              class="status"
                              [class.live]="row.category.isActive"
                              [class.hidden]="!row.category.isActive"
                            >
                              {{ row.category.isActive ? 'Live' : 'Hidden' }}
                            </span>
                          </td>
                          <td>
                            <div class="row-actions" (click)="$event.stopPropagation()">
                              <button
                                type="button"
                                class="btn btn-ghost"
                                (click)="openCollectionModal(row.category)"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                class="btn btn-ghost"
                                (click)="openCollection(row.category)"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                class="btn btn-ghost"
                                (click)="deleteCategory(row.category)"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="6"><div class="empty">No collections yet.</div></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="table-foot">
                  <span>Open a collection to manage its products via the Nest API.</span>
                  <span>Showing {{ categoryTreeRows().length }} rows</span>
                </div>
              </div>
            } @else {
              <div class="panel">
                <div class="panel-h">
                  <div>
                    <h2>{{ view() === 'products' ? 'All products' : 'Extra products' }}</h2>
                    <p class="panel-sub">
                      {{
                        view() === 'products'
                          ? 'Full catalogue from the Nest API.'
                          : 'Products listed from the API (featured / general catalogue).'
                      }}
                    </p>
                  </div>
                  <div class="toolbar">
                    <input
                      type="text"
                      placeholder="Search products…"
                      [ngModel]="prodSearch()"
                      (ngModelChange)="prodSearch.set($event)"
                    />
                  </div>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Product</th>
                        <th>Template</th>
                        <th>SKU / price</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of filteredProducts(); track p.id) {
                        <tr
                          class="prod-row"
                          [class.drag-over]="dragOverProductId() === p.id"
                          [class.dragging]="dragProductId() === p.id"
                          (dragover)="onProductDragOver($event, p, 'all')"
                          (dragleave)="onProductDragLeave(p.id)"
                          (drop)="onProductDrop($event, p, 'all')"
                        >
                          <td class="drag-cell">
                            <span
                              class="drag-handle"
                              title="Drag to reorder on homepage"
                              draggable="true"
                              (dragstart)="onProductDragStart($event, p, 'all')"
                              (dragend)="onProductDragEnd()"
                            >⋮⋮</span>
                          </td>
                          <td>
                            <div class="col-cell">
                              <img class="prod-thumb" [src]="catalog.cardImageUrl(p)" [alt]="p.name" />
                              <div class="col-meta">
                                <span class="prod-name">{{ p.name }}</span>
                                <span class="col-desc">{{ p.slug }}</span>
                                <span class="prod-mini">
                                  {{ productCategoryLabel(p) }}
                                  · {{ productGenderLabel(p) }}
                                  · {{ variantCount(p) }}
                                  {{ variantCount(p) === 1 ? 'variant' : 'variants' }}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td><span class="cat">{{ p.template || p.category?.name || '—' }}</span></td>
                          <td>
                            <span class="mono">{{ p.sku || '—' }}</span>
                            <div class="muted-sm">{{ priceLabel(p) }}</div>
                          </td>
                          <td>
                            <button
                              type="button"
                              class="live-toggle"
                              [class.on]="p.isActive"
                              [class.off]="!p.isActive"
                              [disabled]="statusBusyId() === p.id"
                              (click)="toggleProductLive(p)"
                              [attr.aria-pressed]="p.isActive"
                              [attr.title]="
                                p.isActive
                                  ? 'Live on storefront — click to hide (data kept)'
                                  : 'Hidden from storefront — click to publish'
                              "
                            >
                              <span class="live-toggle-track" aria-hidden="true">
                                <span class="live-toggle-knob"></span>
                              </span>
                              <span class="live-toggle-label">{{ p.isActive ? 'Live' : 'Off' }}</span>
                            </button>
                          </td>
                          <td>
                            <div class="row-actions">
                              <button type="button" class="btn btn-ghost" (click)="editProduct(p)">
                                Edit
                              </button>
                              <button type="button" class="btn btn-danger" (click)="confirmDeleteProduct(p)">
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="6"><div class="empty">No products found.</div></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          } @else {
            <p class="crumb">
              <button type="button" (click)="closeDrill()">
                {{ view() === 'categories' ? 'Categories' : 'Collections' }}
              </button>
              /
              <span>{{ drill()!.name }}</span>
            </p>
            <div class="topbar">
              <div>
                <p class="page-kicker">02 / Collection products</p>
                <h1>{{ drill()!.name }}</h1>
                <p>{{ drill()!.description || 'Products in this collection.' }}</p>
              </div>
              <div class="toolbar">
                <button type="button" class="btn btn-ghost" (click)="closeDrill()">Back</button>
                <button type="button" class="btn btn-ghost" (click)="reloadDrill()">Refresh</button>
                <button type="button" class="btn btn-gold" (click)="startNewProduct(false)">
                  + Add product
                </button>
              </div>
            </div>
            <div class="panel">
              <div class="panel-h">
                <div>
                  <h2>Products</h2>
                  <p class="panel-sub">Open a product in the storefront designer to preview.</p>
                </div>
                <div class="toolbar">
                  <input
                    type="text"
                    placeholder="Search products…"
                    [ngModel]="prodSearch()"
                    (ngModelChange)="prodSearch.set($event)"
                  />
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Product</th>
                      <th>Template</th>
                      <th>SKU / price</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of drillProducts(); track p.id) {
                      <tr
                        class="prod-row"
                        [class.drag-over]="dragOverProductId() === p.id"
                        [class.dragging]="dragProductId() === p.id"
                        (dragover)="onProductDragOver($event, p, 'drill')"
                        (dragleave)="onProductDragLeave(p.id)"
                        (drop)="onProductDrop($event, p, 'drill')"
                      >
                        <td class="drag-cell">
                          <span
                            class="drag-handle"
                            title="Drag to reorder on homepage"
                            draggable="true"
                            (dragstart)="onProductDragStart($event, p, 'drill')"
                            (dragend)="onProductDragEnd()"
                          >⋮⋮</span>
                        </td>
                        <td>
                          <div class="col-cell">
                            <img class="prod-thumb" [src]="catalog.cardImageUrl(p)" [alt]="p.name" />
                            <div class="col-meta">
                              <span class="prod-name">{{ p.name }}</span>
                              <span class="col-desc">{{ p.slug }}</span>
                              <span class="prod-mini">
                                {{ productCategoryLabel(p) }}
                                · {{ productGenderLabel(p) }}
                                · {{ variantCount(p) }}
                                {{ variantCount(p) === 1 ? 'variant' : 'variants' }}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td><span class="cat">{{ p.template || '—' }}</span></td>
                        <td>
                          <span class="mono">{{ p.sku || '—' }}</span>
                          <div class="muted-sm">{{ priceLabel(p) }}</div>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="live-toggle"
                            [class.on]="p.isActive"
                            [class.off]="!p.isActive"
                            [disabled]="statusBusyId() === p.id"
                            (click)="toggleProductLive(p)"
                            [attr.aria-pressed]="p.isActive"
                            [attr.title]="
                              p.isActive
                                ? 'Live on storefront — click to hide (data kept)'
                                : 'Hidden from storefront — click to publish'
                            "
                          >
                            <span class="live-toggle-track" aria-hidden="true">
                              <span class="live-toggle-knob"></span>
                            </span>
                            <span class="live-toggle-label">{{ p.isActive ? 'Live' : 'Off' }}</span>
                          </button>
                        </td>
                        <td>
                          <div class="row-actions">
                            <button type="button" class="btn btn-ghost" (click)="editProduct(p)">
                              Edit
                            </button>
                            <button type="button" class="btn btn-danger" (click)="confirmDeleteProduct(p)">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6">
                          <div class="empty">No products in this collection yet.</div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }

        @if (view() === 'brands') {
          <div class="topbar">
            <div>
              <p class="page-kicker">01 / Brands</p>
              <h1>Brands</h1>
              <p>White-label brand names used on products.</p>
            </div>
            <div class="toolbar">
              <button type="button" class="btn btn-ghost" (click)="loadBrands()">Refresh</button>
              <button type="button" class="btn btn-gold" (click)="openBrandModal()">+ Add Brand</button>
            </div>
          </div>
          <div class="panel">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Slug</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (b of brands(); track b.id) {
                    <tr>
                      <td><span class="prod-name">{{ b.name }}</span></td>
                      <td><span class="mono">{{ b.slug }}</span></td>
                      <td>
                        <div class="row-actions">
                          <button type="button" class="btn btn-danger" (click)="deleteBrand(b)">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="3"><div class="empty">No brands yet.</div></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @if (view() === 'attributes') {
          <div class="topbar">
            <div>
              <p class="page-kicker">01 / Attributes</p>
              <h1>Attributes</h1>
              <p>Product attribute definitions. Edit Style to add/remove Pullover, Zip-Up, Crew, V-Neck, Collar, etc. Those options appear in Variant Details and the Custom Designer.</p>
            </div>
            <div class="toolbar">
              <button type="button" class="btn btn-ghost" (click)="loadAttributes()">Refresh</button>
              <button type="button" class="btn btn-gold" (click)="openAttrModal()">+ Add Attribute</button>
            </div>
          </div>
          <div class="panel">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Options</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of attributes(); track a.id) {
                    <tr>
                      <td><span class="prod-name">{{ a.name }}</span></td>
                      <td><span class="mono">{{ a.code }}</span></td>
                      <td><span class="cat">{{ a.valueType }}</span></td>
                      <td>
                        @if (a.options?.length) {
                          <span class="opt-chips">
                            @for (o of a.options; track o.id) {
                              <span class="opt-chip">{{ o.label }}</span>
                            }
                          </span>
                        } @else {
                          <span class="muted-sm">None</span>
                        }
                      </td>
                      <td>
                        <div class="row-actions">
                          <button type="button" class="btn btn-ghost" (click)="openAttrModal(a)">
                            Edit
                          </button>
                          <button type="button" class="btn btn-danger" (click)="deleteAttribute(a)">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5"><div class="empty">No attributes yet.</div></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @if (view() === 'orders') {
          <div class="topbar">
            <div>
              <h1>Orders</h1>
              <p>Checkout orders are not enabled yet. Use Enquiries for quote requests.</p>
            </div>
          </div>
          <div class="panel">
            <div class="empty">
              Orders will appear here when checkout is launched. For now, manage quote requests under
              Enquiries.
            </div>
          </div>
        }

        @if (view() === 'enquiries') {
          <div class="topbar">
            <div>
              <h1>Enquiries</h1>
              <p>Quote requests from Start Your Range.</p>
            </div>
            <button type="button" class="btn btn-ghost" (click)="loadEnquiries()">Refresh</button>
          </div>
          <div class="panel">
            <div class="panel-h">
              <h2>Inbox</h2>
              <div class="toolbar ops-filters">
                <button
                  type="button"
                  class="btn btn-ghost"
                  [class.active]="enquiryStatus() === ''"
                  (click)="setEnquiryStatus('')"
                >
                  All
                </button>
                <button
                  type="button"
                  class="btn btn-ghost"
                  [class.active]="enquiryStatus() === 'new'"
                  (click)="setEnquiryStatus('new')"
                >
                  New
                </button>
                <button
                  type="button"
                  class="btn btn-ghost"
                  [class.active]="enquiryStatus() === 'quoted'"
                  (click)="setEnquiryStatus('quoted')"
                >
                  Quoted
                </button>
                <button
                  type="button"
                  class="btn btn-ghost"
                  [class.active]="enquiryStatus() === 'closed'"
                  (click)="setEnquiryStatus('closed')"
                >
                  Closed
                </button>
              </div>
            </div>
            @if (!enquiries().length) {
              <div class="empty">No enquiries yet.</div>
            } @else {
              <table class="data">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Segment</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of enquiries(); track e.id) {
                    <tr>
                      <td>{{ e.ref }}</td>
                      <td>{{ e.name }}{{ e.company ? ' · ' + e.company : '' }}</td>
                      <td>{{ e.email }}</td>
                      <td>{{ e.segment || '—' }}</td>
                      <td>{{ e.status }}</td>
                      <td>
                        <select
                          [ngModel]="e.status"
                          (ngModelChange)="updateEnquiryStatus(e.id, $event)"
                        >
                          <option value="new">new</option>
                          <option value="quoted">quoted</option>
                          <option value="closed">closed</option>
                        </select>
                      </td>
                    </tr>
                    @if (e.message) {
                      <tr class="enquiry-msg">
                        <td colspan="6"><pre>{{ e.message }}</pre></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            }
          </div>
        }

        @if (view() === 'settings') {
          <div class="topbar">
            <div>
              <h1>Settings</h1>
              <p>Local admin preferences (not synced to the API yet).</p>
            </div>
          </div>
          <div class="panel settings-panel">
            <label>Public site name</label>
            <input type="text" [(ngModel)]="siteName" />
            <label>Default MOQ</label>
            <input type="number" [(ngModel)]="defaultMoq" />
            <label>Sampling note</label>
            <textarea [(ngModel)]="samplingNote"></textarea>
            <button
              type="button"
              class="btn btn-dark"
              (click)="toast('Saved in this browser only — API settings coming later')"
            >
              Save changes
            </button>
          </div>
        }
        }
      </main>
    </div>

    @if (colModalOpen()) {
      <div class="modal-bg open" (click)="colModalOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <header>
            <h2>
              {{
                editingCollectionId()
                  ? view() === 'categories'
                    ? 'Edit category'
                    : 'Edit collection'
                  : view() === 'categories'
                    ? 'Add category'
                    : 'Add collection'
              }}
            </h2>
            <button type="button" class="btn btn-ghost" (click)="colModalOpen.set(false)">Close</button>
          </header>
          <div class="body">
            @if (colModalError()) {
              <div class="alert">{{ colModalError() }}</div>
            }
            <label>Name</label>
            <input type="text" [(ngModel)]="colForm.name" />
            <label>Slug</label>
            <input type="text" [(ngModel)]="colForm.slug" placeholder="t-shirts" />
            <label>Parent</label>
            <select [(ngModel)]="colForm.parentId">
              <option [ngValue]="apparelRootId()">Apparel (top level)</option>
              @for (opt of categoryParentOptions(); track opt.id) {
                <option [ngValue]="opt.id">{{ opt.label }}</option>
              }
            </select>
            <label>Description</label>
            <textarea [(ngModel)]="colForm.description"></textarea>
            <label>Status</label>
            <select [(ngModel)]="colForm.isActive">
              <option [ngValue]="true">Live</option>
              <option [ngValue]="false">Hidden</option>
            </select>

            <label>Main outlook image</label>
            <p class="field-hint">
              Used on the homepage slider and collection cards. Upload a separate cover, or pick an existing product / colour variant.
            </p>
            <div class="cover-row">
              <div class="cover-preview">
                @if (colForm.imageUrl) {
                  <img [src]="colForm.imageUrl" alt="Collection cover" />
                } @else {
                  <span>No cover</span>
                }
              </div>
              <div class="cover-actions">
                <label class="btn btn-ghost file-btn">
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    (change)="onCollectionCoverFile($event)"
                  />
                </label>
                <button
                  type="button"
                  class="btn btn-ghost"
                  [disabled]="!colForm.imageUrl"
                  (click)="clearCollectionCover()"
                >
                  Clear
                </button>
              </div>
            </div>

            @if (collectionCoverOptions().length) {
              <label>Use product / variant</label>
              <div class="cover-pick-grid">
                @for (opt of collectionCoverOptions(); track opt.key) {
                  <button
                    type="button"
                    class="cover-pick"
                    [class.is-on]="colForm.imageUrl === opt.url"
                    (click)="useCollectionCover(opt.url)"
                    [title]="opt.label"
                  >
                    <img [src]="opt.url" [alt]="opt.label" />
                    <span>{{ opt.label }}</span>
                  </button>
                }
              </div>
            } @else if (editingCollectionId()) {
              <p class="field-hint">
                No product images in this collection yet. Add a product with images, or upload a cover above.
              </p>
            }
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="colModalOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-gold" (click)="saveCollection()">Save</button>
          </div>
        </div>
      </div>
    }

    @if (brandModalOpen()) {
      <div class="modal-bg open" (click)="brandModalOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <header>
            <h2>Add brand</h2>
            <button type="button" class="btn btn-ghost" (click)="brandModalOpen.set(false)">Close</button>
          </header>
          <div class="body">
            @if (brandModalError()) {
              <div class="alert">{{ brandModalError() }}</div>
            }
            <label>Name</label>
            <input type="text" [(ngModel)]="brandFormName" placeholder="Threadgaff Premium" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="brandModalOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-gold" (click)="saveBrand()">Save</button>
          </div>
        </div>
      </div>
    }

    @if (attrModalOpen()) {
      <div class="modal-bg open" (click)="attrModalOpen.set(false)">
        <div class="modal modal-wide" (click)="$event.stopPropagation()">
          <header>
            <h2>{{ editingAttrId() ? 'Edit attribute' : 'Add attribute' }}</h2>
            <button type="button" class="btn btn-ghost" (click)="attrModalOpen.set(false)">Close</button>
          </header>
          <div class="body">
            @if (attrModalError()) {
              <div class="alert">{{ attrModalError() }}</div>
            }
            <label>Name</label>
            <input type="text" [(ngModel)]="attrForm.name" placeholder="Sleeve" />
            <label>Code</label>
            <input
              type="text"
              [(ngModel)]="attrForm.code"
              placeholder="sleeve"
              [disabled]="!!editingAttrId()"
            />
            <label>Type</label>
            <select [(ngModel)]="attrForm.valueType">
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="select">Select</option>
              <option value="multiselect">Multi-select</option>
              <option value="boolean">Boolean</option>
            </select>
            @if (attrForm.valueType === 'select' || attrForm.valueType === 'multiselect') {
              <label>Options</label>
              <p class="muted-sm">These appear in product editing and storefront filters.</p>
              @for (opt of attrForm.options; track $index; let i = $index) {
                <div class="attr-opt-row">
                  <input
                    type="text"
                    [(ngModel)]="opt.label"
                    [name]="'optLabel' + i"
                    placeholder="Label e.g. Long"
                    (ngModelChange)="onAttrOptionLabel(i)"
                  />
                  <input
                    type="text"
                    [(ngModel)]="opt.value"
                    [name]="'optValue' + i"
                    placeholder="value e.g. long"
                  />
                  <button type="button" class="btn btn-danger" (click)="attrForm.options.splice(i, 1)">
                    Remove
                  </button>
                </div>
              }
              <button type="button" class="btn btn-ghost" (click)="addAttrOption()">
                + Add option
              </button>
            }
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="attrModalOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-gold" (click)="saveAttribute()">Save</button>
          </div>
        </div>
      </div>
    }

    @if (deleteTarget(); as p) {
      <div class="modal-bg open" (click)="cancelDeleteProduct()">
        <div class="modal modal-confirm" (click)="$event.stopPropagation()" role="dialog" aria-labelledby="deleteProductTitle">
          <header>
            <h2 id="deleteProductTitle">Delete product?</h2>
            <button type="button" class="btn btn-ghost" (click)="cancelDeleteProduct()" aria-label="Close">×</button>
          </header>
          <div class="body">
            <p class="delete-copy">
              Do you want to delete <strong>{{ p.name }}</strong> and its variants?
            </p>
            <p class="field-hint">
              Yes permanently removes this product, all colour variants, and images from the database. This cannot be undone.
            </p>
            @if (deleteError()) {
              <div class="alert alert-error">{{ deleteError() }}</div>
            }
          </div>
          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-ghost"
              (click)="cancelDeleteProduct()"
              [disabled]="deleteBusy()"
            >
              No
            </button>
            <button
              type="button"
              class="btn btn-danger"
              (click)="executeDeleteProduct()"
              [disabled]="deleteBusy()"
            >
              {{ deleteBusy() ? 'Deleting…' : 'Yes' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (toastMsg()) {
      <div class="toast show">{{ toastMsg() }}</div>
    }
  `,
  styles: `
    :host {
      --ink: #1c1f1b;
      --paper: #ece8de;
      --panel: #fffdf8;
      --line: #d4cec0;
      --muted: #6b6f63;
      --gold: #4f5a45;
      --danger: #8b3a2f;
      --ok: #3d6b4f;
      --ui-bg: #f5f3ef;
      --ui-card: #ffffff;
      --ui-primary: #3d4b37;
      --ui-primary-soft: #eef2ea;
      --ui-radius: 12px;
      --ui-radius-sm: 8px;
      --ui-line: #e4e0d6;
      display: block;
      min-height: 100vh;
      background: var(--ui-bg);
      color: var(--ink);
      font-family: Inter, system-ui, sans-serif;
      font-size: 14px;
    }

    .shell {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      background: var(--ink);
      color: #f4f1ea;
      padding: 22px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: sticky;
      top: 0;
      align-self: start;
      height: 100vh;
      overflow-y: auto;
    }

    .brand {
      font-family: Montserrat, sans-serif;
      font-weight: 800;
      letter-spacing: 0.14em;
      font-size: 0.85rem;
      padding: 4px 8px 18px;
    }

    .brand span {
      display: block;
      font-family: Inter, sans-serif;
      font-weight: 500;
      letter-spacing: 0;
      opacity: 0.55;
      font-size: 0.7rem;
      margin-top: 4px;
      text-transform: none;
    }

    .nav-btn {
      text-align: left;
      background: transparent;
      color: #d8d4c8;
      border: 0;
      padding: 10px 10px;
      cursor: pointer;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-size: 0.72rem;
      font-weight: 700;
      border-radius: 2px;
      font-family: inherit;
      text-decoration: none;
      display: block;
    }

    .nav-btn.active,
    .nav-btn:hover {
      background: #2d322c;
      color: #fff;
    }

    .nav-btn.storefront {
      text-transform: none;
      letter-spacing: 0.02em;
      font-weight: 600;
      opacity: 0.85;
    }

    .nav-group { display: flex; flex-direction: column; gap: 2px; }
    .nav-parent {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
    }
    .nav-caret { font-size: 0.65rem; opacity: 0.7; }
    .nav-sub {
      display: flex; flex-direction: column; gap: 2px;
      padding: 2px 0 6px 8px; margin: 0 0 4px;
      border-left: 1px solid rgba(255,255,255,0.12);
      margin-left: 10px;
    }
    .nav-sub-btn {
      text-align: left; background: transparent; color: #bdb8ac;
      border: 0; padding: 8px 10px; cursor: pointer; font-size: 0.74rem;
      font-weight: 600; border-radius: 2px; font-family: inherit;
      text-transform: none; letter-spacing: 0.01em;
    }
    .nav-sub-btn:hover,
    .nav-sub-btn.active {
      background: #2d322c; color: #fff;
    }

    .spacer { flex: 1; }

    .main {
      background: var(--ui-bg);
      padding: 28px 36px 40px 28px;
      position: relative;
      min-width: 0;
    }

    h1, h2, h3 {
      font-family: Montserrat, sans-serif;
      text-transform: none;
      letter-spacing: -0.01em;
      font-weight: 700;
      margin: 0;
    }

    .page-kicker {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 8px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .topbar h1 { font-size: 1.75rem; letter-spacing: -0.02em; }
    .topbar p { margin: 6px 0 0; color: #7a7f74; font-size: 0.92rem; max-width: 56ch; }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .stat {
      background: var(--ui-card);
      border: 1px solid var(--ui-line);
      border-radius: var(--ui-radius);
      padding: 16px;
      box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04);
    }

    .stat b {
      display: block;
      font-size: 1.4rem;
      font-family: Montserrat, sans-serif;
      margin-top: 4px;
    }

    .stat span {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }

    .panel {
      background: var(--ui-card);
      border: 1px solid var(--ui-line);
      border-radius: var(--ui-radius);
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04);
    }

    .panel-h {
      padding: 16px 18px;
      border-bottom: 1px solid var(--ui-line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      background: #fff;
    }

    .panel-h h2 { font-size: 0.95rem; }
    .panel-sub { margin: 4px 0 0; color: var(--muted); font-size: 0.8rem; max-width: none; }

    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .toolbar input, .toolbar select {
      margin: 0;
      width: auto;
      min-width: 160px;
      border: 1px solid var(--ui-line);
      border-radius: var(--ui-radius-sm);
      background: #fff;
      padding: 11px 12px;
      font: inherit;
    }

    .btn {
      border: 0;
      cursor: pointer;
      padding: 10px 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: none;
      font-size: 0.8rem;
      border-radius: var(--ui-radius-sm);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      text-decoration: none;
      color: inherit;
      background: #fff;
    }

    .btn-dark, .btn-gold {
      background: var(--ui-primary);
      color: #fff;
      border: 1px solid var(--ui-primary);
    }

    .btn-ghost {
      background: #fff;
      border: 1px solid var(--ui-line);
      color: var(--ink);
    }

    .btn-ghost:hover, .btn-ghost.active {
      border-color: #c8c3b6;
      background: #faf9f6;
    }

    .catalog-modes {
      background: #ebe8e1;
      border-radius: 999px;
      padding: 4px;
      gap: 2px;
      display: flex;
    }

    .catalog-modes .btn {
      border: 0;
      background: transparent;
      border-radius: 999px;
      padding: 8px 16px;
      color: var(--ink);
      box-shadow: none;
    }

    .catalog-modes .btn.active {
      background: var(--ui-primary);
      color: #fff;
    }

    .ops-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 8px;
    }

    .ops-feed { list-style: none; margin: 0; padding: 0; }
    .ops-feed li {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--ui-line);
      cursor: pointer;
    }
    .ops-feed li:last-child { border-bottom: 0; }
    .ops-feed li:hover { background: #f6f4ee; }
    .ops-feed strong { display: block; font-size: 0.9rem; }
    .ops-feed small { color: var(--muted); font-size: 0.75rem; }
    .ops-thumb {
      width: 44px;
      height: 56px;
      object-fit: contain;
      background: #ece8de;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .ops-feed-meta {
      margin-left: auto;
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-end;
    }

    .empty { padding: 32px; color: var(--muted); }
    .enquiry-msg td {
      background: #f7f5f1;
      font-size: 0.85rem;
      color: var(--muted);
      border-top: none;
    }
    .enquiry-msg pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: inherit;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 14px 16px;
      border-bottom: 1px solid var(--ui-line);
      vertical-align: middle;
    }
    th {
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #8a8f84;
    }

    .col-table tbody tr { cursor: pointer; }
    .col-table tbody tr:hover { background: #faf9f6; }
    .col-table tbody tr.tree-child { background: #fbfaf7; }
    .col-table tbody tr.tree-child:hover { background: #f3f0e8; }
    .table-wrap { overflow-x: auto; }

    .tree-cell { align-items: center; }
    .tree-toggle {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      font-size: 0.75rem;
      color: var(--muted);
      padding: 0;
      line-height: 1;
      margin-right: 4px;
    }
    .tree-toggle:hover { color: var(--ink); }
    .tree-spacer {
      display: inline-block;
      width: 22px;
      flex-shrink: 0;
      margin-right: 4px;
    }
    .tree-branch {
      color: #c0bbb0;
      margin-right: 4px;
      font-weight: 400;
    }

    .col-cell { display: flex; align-items: center; gap: 0; min-width: 0; }
    .col-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .prod-name { font-size: 0.92rem; font-weight: 650; }
    .col-desc {
      font-size: 0.78rem;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 280px;
    }
    .prod-thumb {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      object-fit: cover;
      background: #ece8de;
      margin-right: 12px;
      flex-shrink: 0;
    }
    .empty-thumb { display: inline-block; }
    .prod-row td {
      padding-top: 14px;
      padding-bottom: 14px;
      vertical-align: middle;
    }
    .prod-mini {
      display: block;
      margin-top: 3px;
      font-size: 0.62rem;
      line-height: 1.35;
      letter-spacing: 0.02em;
      color: #8a867c;
      font-weight: 500;
      text-transform: none;
      max-width: 280px;
    }
    .cat {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .col-count {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--ui-primary-soft);
      color: var(--ui-primary);
    }
    .status::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .status.live { background: #e7f0e4; color: #2f6b3c; }
    .status.hidden { background: #eeebe4; color: #6b6f63; }

    .live-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 0;
      background: transparent;
      padding: 0;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }
    .live-toggle:disabled { opacity: 0.55; cursor: wait; }
    .live-toggle-track {
      width: 42px;
      height: 24px;
      border-radius: 999px;
      position: relative;
      flex: none;
      transition: background 0.18s ease;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
    }
    .live-toggle.on .live-toggle-track {
      background: #3d8f55;
    }
    .live-toggle.off .live-toggle-track {
      background: #e8b4ae;
    }
    .live-toggle-knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      transition: transform 0.18s ease;
    }
    .live-toggle.on .live-toggle-knob { transform: translateX(18px); }
    .live-toggle.off .live-toggle-knob { transform: translateX(0); }
    .live-toggle-label {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .live-toggle.on .live-toggle-label { color: #2f6b3c; }
    .live-toggle.off .live-toggle-label { color: #8b3a2f; }

    .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .row-actions .btn { padding: 7px 11px; font-size: 0.72rem; }

    .drag-cell { width: 48px; padding-right: 0; }
    .drag-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      color: #7a7e74;
      font-size: 1.05rem;
      letter-spacing: -1px;
      user-select: none;
      cursor: grab;
      border-radius: 8px;
      border: 1px solid transparent;
      background: #f4f1ea;
    }
    .drag-handle:hover {
      border-color: var(--ui-line);
      color: var(--ink);
    }
    .drag-handle:active { cursor: grabbing; }
    .tree-row.drag-over td,
    .prod-row.drag-over td { background: #eef2e8; }
    .tree-row.dragging,
    .prod-row.dragging { opacity: 0.45; }

    .table-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 16px;
      color: var(--muted);
      font-size: 0.78rem;
      border-top: 1px solid var(--ui-line);
      background: #fcfbf9;
    }

    .crumb {
      font-size: 0.78rem;
      color: var(--muted);
      margin: 0 0 10px;
    }
    .crumb button {
      background: none;
      border: 0;
      padding: 0;
      color: var(--gold);
      cursor: pointer;
      font-weight: 700;
      font: inherit;
    }

    .mono { font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; }
    .muted-sm { font-size: 0.72rem; color: var(--muted); margin-top: 2px; }
    .opt-chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 320px; }
    .opt-chip {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      background: #eef2ea; color: #3d4b37; font-size: 0.72rem;
    }
    .attr-opt-row {
      display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px;
      align-items: center; margin-bottom: 8px;
    }
    .attr-opt-row input { margin: 0; }
    .modal-wide { max-width: 560px; }
    .modal-confirm { max-width: 420px; }
    .delete-copy {
      margin: 0 0 8px;
      font-size: 0.92rem;
      line-height: 1.45;
      color: var(--ink);
    }
    .alert-error {
      margin-top: 12px;
      padding: 10px 12px;
      background: #f8e8e6;
      color: var(--danger);
      border-radius: var(--ui-radius-sm);
      font-size: 0.8rem;
    }

    .ops-filters .btn.active {
      background: var(--ui-primary-soft);
      border-color: transparent;
      color: var(--ui-primary);
    }

    .settings-panel { padding: 18px; max-width: 520px; }
    .settings-panel label {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin: 0 0 6px;
      color: #4a4e46;
    }
    .settings-panel input,
    .settings-panel textarea {
      width: 100%;
      padding: 11px 12px;
      border: 1px solid var(--ui-line);
      border-radius: var(--ui-radius-sm);
      background: #fff;
      margin-bottom: 12px;
      font: inherit;
    }
    .settings-panel textarea { min-height: 78px; resize: vertical; }

    .alert {
      background: #f8e8e6;
      color: var(--danger);
      padding: 12px 14px;
      border-radius: var(--ui-radius-sm);
      margin-bottom: 16px;
      font-size: 0.85rem;
    }

    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--ink);
      color: #fff;
      padding: 12px 16px;
      font-size: 0.85rem;
      z-index: 60;
      border-radius: var(--ui-radius-sm);
      display: none;
    }
    .toast.show { display: block; }

    .modal-bg {
      position: fixed; inset: 0; background: rgba(28, 31, 27, 0.45);
      display: flex; align-items: flex-start; justify-content: center;
      padding: 40px 16px; z-index: 40; overflow: auto;
    }
    .modal {
      width: 100%; max-width: 560px; background: var(--ui-card);
      border: 1px solid var(--ui-line); border-radius: var(--ui-radius);
    }
    .modal header {
      padding: 16px 18px; border-bottom: 1px solid var(--ui-line);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal header h2 { font-size: 0.95rem; margin: 0; }
    .modal .body { padding: 18px; }
    .modal .body label {
      display: block; font-size: 0.7rem; font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 6px;
    }
    .modal .body input, .modal .body textarea, .modal .body select {
      width: 100%; padding: 11px 12px; border: 1px solid var(--ui-line);
      border-radius: var(--ui-radius-sm); margin-bottom: 12px; font: inherit;
    }
    .field-hint {
      margin: -4px 0 10px;
      font-size: 0.72rem;
      color: var(--muted, #7a766c);
      line-height: 1.4;
    }
    .cover-row {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .cover-preview {
      width: 96px;
      height: 120px;
      flex: none;
      border-radius: 8px;
      border: 1px solid var(--ui-line);
      background: #ece8de;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8a867c;
      font-size: 0.68rem;
    }
    .cover-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .cover-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 4px;
    }
    .file-btn { cursor: pointer; display: inline-flex; align-items: center; }
    .cover-pick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 8px;
      max-height: 220px;
      overflow: auto;
      margin: 4px 0 12px;
      padding: 2px;
    }
    .cover-pick {
      border: 1px solid var(--ui-line);
      border-radius: 8px;
      background: #fff;
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      text-align: left;
    }
    .cover-pick.is-on {
      border-color: #4b533c;
      box-shadow: 0 0 0 2px rgba(75, 83, 60, 0.25);
    }
    .cover-pick img {
      width: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      display: block;
      background: #ece8de;
    }
    .cover-pick span {
      display: block;
      padding: 6px 7px 7px;
      font-size: 0.62rem;
      line-height: 1.25;
      color: #3a3934;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modal-actions {
      display: flex; justify-content: flex-end; gap: 8px; padding: 0 18px 18px;
    }
    .btn-danger {
      background: var(--ui-danger-soft, #f8e8e6); color: var(--danger);
      border: 1px solid #efd2cd;
    }

    @media (max-width: 900px) {
      .ops-split { grid-template-columns: 1fr; }
    }

    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        position: static;
        height: auto;
      }
      .sidebar .spacer { display: none; }
      .brand { width: 100%; padding-bottom: 8px; }
    }
  `,
})
export class AdminPageComponent implements OnInit {
  readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly view = signal<AdminView>('overview');
  readonly catalogMode = signal<CatalogMode>('collections');
  readonly productsNavOpen = signal(true);
  readonly products = signal<Product[]>([]);
  readonly collections = signal<Category[]>([]);
  readonly brands = signal<ProductTag[]>([]);
  readonly attributes = signal<AttributeDefinition[]>([]);
  readonly enquiries = signal<Enquiry[]>([]);
  readonly enquiryStatus = signal('');
  /** Category ids that are collapsed in the tree list */
  readonly collapsedCategoryIds = signal<Set<string>>(new Set());
  readonly dragCategoryId = signal<string | null>(null);
  readonly dragParentId = signal<string | null>(null);
  readonly dragOverCategoryId = signal<string | null>(null);
  readonly dragProductId = signal<string | null>(null);
  readonly dragProductScope = signal<'all' | 'drill' | null>(null);
  readonly dragOverProductId = signal<string | null>(null);
  readonly productReorderBusy = signal(false);
  readonly drill = signal<Category | null>(null);
  readonly drillProductList = signal<Product[]>([]);
  readonly colSearch = signal('');
  readonly prodSearch = signal('');
  readonly error = signal('');
  readonly toastMsg = signal('');
  readonly editor = signal<ProductEditorState | null>(null);
  readonly deleteTarget = signal<Product | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal('');
  readonly statusBusyId = signal<string | null>(null);
  readonly colModalOpen = signal(false);
  readonly brandModalOpen = signal(false);
  readonly attrModalOpen = signal(false);
  readonly editingAttrId = signal<string | null>(null);
  readonly editingCollectionId = signal<string | null>(null);
  readonly colModalError = signal('');
  readonly brandModalError = signal('');
  readonly attrModalError = signal('');
  readonly apparelRootId = signal<string | null>(null);

  colForm = {
    name: '',
    slug: '',
    description: '',
    isActive: true,
    parentId: null as string | null,
    imageUrl: '',
  };
  brandFormName = '';
  attrForm = {
    name: '',
    code: '',
    valueType: 'text' as 'text' | 'number' | 'select' | 'multiselect' | 'boolean',
    options: [] as Array<{ value: string; label: string; sortOrder: number }>,
  };

  siteName = 'Threadgaff';
  defaultMoq = 150;
  samplingNote = 'Sampling available upon request';

  readonly liveCount = computed(
    () => this.products().filter((p) => p.isActive).length,
  );
  readonly hiddenCount = computed(
    () => this.products().filter((p) => !p.isActive).length,
  );
  readonly featuredCount = computed(
    () => this.products().filter((p) => p.isFeatured).length,
  );

  readonly filteredCollections = computed(() => {
    const q = this.colSearch().trim().toLowerCase();
    const list = this.collections();
    if (!q) return list;
    return list.filter((c) => this.categoryMatchesSearch(c, q));
  });

  /** Flat rows for indented category tree (parents + visible children). */
  readonly categoryTreeRows = computed(() => {
    const collapsed = this.collapsedCategoryIds();
    const q = this.colSearch().trim().toLowerCase();
    const roots = this.filteredCollections();
    const rows: CategoryTreeListRow[] = [];

    const walk = (nodes: Category[], depth: number) => {
      for (const cat of nodes) {
        if (q && !this.categoryMatchesSearch(cat, q)) continue;
        const kids = cat.children || [];
        const hasChildren = kids.length > 0;
        const isCollapsed = collapsed.has(cat.id);
        rows.push({
          category: cat,
          depth,
          hasChildren,
          childCount: kids.length,
          collapsed: hasChildren && isCollapsed,
        });
        if (hasChildren && (!isCollapsed || !!q)) {
          // When searching, always expand matches' children that match
          const childNodes = q
            ? kids.filter((ch) => this.categoryMatchesSearch(ch, q) || this.categoryMatchesSearch(cat, q))
            : kids;
          walk(childNodes, depth + 1);
        }
      }
    };

    walk(roots, 0);
    return rows;
  });

  private categoryMatchesSearch(c: Category, q: string): boolean {
    if (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    ) {
      return true;
    }
    return (c.children || []).some((ch) => this.categoryMatchesSearch(ch, q));
  }

  toggleCategoryExpand(id: string, event: Event) {
    event.stopPropagation();
    this.collapsedCategoryIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  productCountFor(c: Category): number {
    const ids = new Set<string>([c.id]);
    const collect = (node: Category) => {
      for (const ch of node.children || []) {
        ids.add(ch.id);
        collect(ch);
      }
    };
    collect(c);
    return this.products().filter(
      (p) =>
        (p.categoryId && ids.has(p.categoryId)) ||
        (p.extraCategoryIds || []).some((id) => ids.has(id)),
    ).length;
  }

  readonly filteredProducts = computed(() => {
    const q = this.prodSearch().trim().toLowerCase();
    let list = [...this.products()].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  });

  readonly drillProducts = computed(() => {
    const q = this.prodSearch().trim().toLowerCase();
    let list = [...this.drillProductList()].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  });

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingFromUrl = false;

  ngOnInit() {
    this.loadCatalog(() => this.restoreFromQuery(this.route.snapshot.queryParamMap));
    this.route.queryParamMap.subscribe((params) => {
      if (this.syncingFromUrl) return;
      this.restoreFromQuery(params);
    });
  }

  setView(v: AdminView) {
    this.view.set(v);
    this.drill.set(null);
    this.prodSearch.set('');
    this.editor.set(null);
    if (this.isProductsSectionView(v)) this.productsNavOpen.set(true);
    if (v === 'brands') this.loadBrands();
    if (v === 'attributes') this.loadAttributes();
    if (v === 'enquiries' || v === 'overview') this.loadEnquiries();
    this.syncAdminUrl();
  }

  loadEnquiries() {
    const status = this.enquiryStatus() || undefined;
    this.catalog.getEnquiries(status).subscribe({
      next: (list) => this.enquiries.set(list),
      error: () => this.error.set('Failed to load enquiries'),
    });
  }

  setEnquiryStatus(status: string) {
    this.enquiryStatus.set(status);
    this.loadEnquiries();
  }

  updateEnquiryStatus(id: string, status: string) {
    this.catalog.updateEnquiry(id, { status }).subscribe({
      next: () => {
        this.toast('Enquiry updated');
        this.loadEnquiries();
      },
      error: (err) =>
        this.error.set(err?.error?.message || 'Failed to update enquiry'),
    });
  }

  isProductsSection(): boolean {
    return this.isProductsSectionView(this.view()) || !!this.editor();
  }

  isProductsSectionView(v: AdminView): boolean {
    return (
      v === 'products' ||
      v === 'brands' ||
      v === 'categories' ||
      v === 'attributes' ||
      v === 'collections'
    );
  }

  toggleProductsNav() {
    this.productsNavOpen.update((o) => !o);
  }

  goProducts(tab: ProductNav) {
    this.productsNavOpen.set(true);
    this.drill.set(null);
    this.prodSearch.set('');
    if (tab === 'add') {
      this.startNewProduct(true);
      return;
    }
    this.editor.set(null);
    if (tab === 'all') {
      this.view.set('products');
      this.catalogMode.set('extras');
    } else if (tab === 'brands') {
      this.view.set('brands');
      this.loadBrands();
    } else if (tab === 'categories') {
      this.view.set('categories');
      this.catalogMode.set('collections');
    } else if (tab === 'attributes') {
      this.view.set('attributes');
      this.loadAttributes();
    }
    this.syncAdminUrl();
  }

  setCatalogMode(mode: CatalogMode) {
    this.catalogMode.set(mode);
    this.drill.set(null);
    this.editor.set(null);
    this.syncAdminUrl();
  }

  openCollection(c: Category) {
    this.drill.set(c);
    this.prodSearch.set('');
    if (this.view() !== 'categories') {
      this.view.set('categories');
    }
    this.catalogMode.set('collections');
    this.editor.set(null);
    this.reloadDrill();
    this.syncAdminUrl();
  }

  closeDrill() {
    this.drill.set(null);
    this.drillProductList.set([]);
    this.syncAdminUrl();
  }

  reloadDrill() {
    const c = this.drill();
    if (!c) return;
    this.catalog
      .getProducts({ limit: 100, categoryId: c.id, includeDescendants: true })
      .subscribe({
        next: (res) => {
          const sorted = [...(res.items || [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );
          this.drillProductList.set(sorted);
          this.hydrateProductRows(sorted);
        },
        error: () => this.error.set('Failed to load collection products'),
      });
  }

  startNewProduct(standalone: boolean) {
    const drill = this.drill();
    this.view.set('products');
    this.productsNavOpen.set(true);
    this.editor.set({
      productId: null,
      categoryId: standalone ? null : drill?.id ?? null,
      categoryName: standalone ? '' : drill?.name ?? '',
      lockCategory: !standalone && !!drill,
      startStandalone: standalone,
    });
    this.syncAdminUrl();
  }

  editProduct(p: Product) {
    this.view.set('products');
    this.productsNavOpen.set(true);
    this.editor.set({
      productId: p.id,
      categoryId: p.categoryId || p.category?.id || null,
      categoryName: p.category?.name || '',
      lockCategory: false,
      startStandalone: !(p.categoryId || p.category?.id),
    });
    this.syncAdminUrl();
  }

  closeEditor() {
    this.editor.set(null);
    this.syncAdminUrl();
  }

  onProductSaved(p: Product) {
    this.toast(`Saved “${p.name}” — live on the storefront`);
    this.editor.set(null);
    this.syncAdminUrl();
    this.loadCatalog();
    if (this.drill()) this.reloadDrill();
  }

  onProductDeleted() {
    this.toast('Product deleted');
    this.editor.set(null);
    this.syncAdminUrl();
    this.loadCatalog();
    if (this.drill()) this.reloadDrill();
  }

  confirmDeleteProduct(p: Product) {
    this.deleteError.set('');
    this.deleteBusy.set(false);
    this.deleteTarget.set(p);
  }

  toggleProductLive(p: Product) {
    if (this.statusBusyId()) return;
    const next = !p.isActive;
    this.statusBusyId.set(p.id);
    this.error.set('');
    this.auth
      .ensureFreshAccessToken()
      .pipe(
        switchMap(() =>
          this.catalog.updateProduct(p.id, { isActive: next }),
        ),
      )
      .subscribe({
        next: (saved) => {
          const active = saved.isActive ?? next;
          this.products.update((list) =>
            list.map((x) => (x.id === p.id ? { ...x, isActive: active } : x)),
          );
          this.drillProductList.update((list) =>
            list.map((x) => (x.id === p.id ? { ...x, isActive: active } : x)),
          );
          this.statusBusyId.set(null);
          this.toast(
            active
              ? `“${p.name}” is Live on the storefront`
              : `“${p.name}” hidden from storefront — data kept`,
          );
        },
        error: (err) => {
          this.statusBusyId.set(null);
          const msg = err?.error?.message;
          this.error.set(
            Array.isArray(msg)
              ? msg.join(', ')
              : msg || 'Could not update product status',
          );
        },
      });
  }

  cancelDeleteProduct() {
    this.deleteTarget.set(null);
    this.deleteError.set('');
    this.deleteBusy.set(false);
  }

  executeDeleteProduct() {
    const p = this.deleteTarget();
    if (!p || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteError.set('');
    this.error.set('');
    this.auth
      .ensureFreshAccessToken()
      .pipe(switchMap(() => this.catalog.deleteProduct(p.id)))
      .subscribe({
        next: () => {
          this.deleteBusy.set(false);
          this.deleteTarget.set(null);
          this.products.update((list) => list.filter((x) => x.id !== p.id));
          this.drillProductList.update((list) => list.filter((x) => x.id !== p.id));
          this.toast(`Deleted “${p.name}” permanently`);
          this.loadCatalog();
          if (this.drill()) this.reloadDrill();
        },
        error: (err) => {
          const msg = err?.error?.message;
          const text = Array.isArray(msg)
            ? msg.join(', ')
            : String(msg || '');
          // Idempotent: already gone from DB counts as success.
          if (
            err?.status === 404 ||
            /not found|already deleted/i.test(text)
          ) {
            this.deleteBusy.set(false);
            this.deleteTarget.set(null);
            this.products.update((list) => list.filter((x) => x.id !== p.id));
            this.drillProductList.update((list) =>
              list.filter((x) => x.id !== p.id),
            );
            this.toast(`Deleted “${p.name}” permanently`);
            this.loadCatalog();
            if (this.drill()) this.reloadDrill();
            return;
          }
          this.deleteBusy.set(false);
          this.deleteError.set(
            text || 'Could not permanently delete. Check the API and try again.',
          );
          this.error.set(
            text || 'Could not permanently delete. Check the API and try again.',
          );
        },
      });
  }

  openProduct(p: Product) {
    this.editProduct(p);
  }

  openCollectionModal(col?: Category) {
    this.editingCollectionId.set(col?.id ?? null);
    this.colForm = {
      name: col?.name || '',
      slug: col?.slug || '',
      description: col?.description || '',
      isActive: col?.isActive !== false,
      parentId: col?.parentId ?? this.apparelRootId(),
      imageUrl: col?.imageUrl || '',
    };
    this.colModalError.set('');
    this.colModalOpen.set(true);
  }

  collectionCoverOptions(): Array<{ key: string; label: string; url: string }> {
    const id = this.editingCollectionId();
    if (!id) return [];
    const opts: Array<{ key: string; label: string; url: string }> = [];
    const seen = new Set<string>();

    for (const p of this.products()) {
      const inCat =
        p.categoryId === id ||
        p.category?.id === id ||
        (p.extraCategoryIds || []).includes(id);
      if (!inCat) continue;

      const colors = p.colors?.length ? p.colors : [null];
      for (const color of colors) {
        const fromColor = color?.images?.[0]?.url;
        const fromProduct =
          p.images?.find((i) => i.role === 'card')?.url ||
          p.images?.[0]?.url;
        const url = fromColor || fromProduct || this.catalog.cardImageUrl(p);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        opts.push({
          key: `${p.id}-${color?.id || 'default'}-${url}`,
          label: color?.name ? `${p.name} · ${color.name}` : p.name,
          url,
        });
      }
    }
    return opts;
  }

  useCollectionCover(url: string) {
    this.colForm.imageUrl = url;
  }

  clearCollectionCover() {
    this.colForm.imageUrl = '';
  }

  onCollectionCoverFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.readCoverImage(file)
      .then((src) => {
        this.colForm.imageUrl = src;
      })
      .catch(() => {
        this.colModalError.set('Could not read that image file');
      });
  }

  private readCoverImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const img = new Image();
        img.onerror = () => reject(new Error('image failed'));
        img.onload = () => {
          const max = 960;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Parent choices for the category modal (exclude self + descendants when editing). */
  categoryParentOptions(): Array<{ id: string; label: string }> {
    const editingId = this.editingCollectionId();
    const excluded = new Set<string>();
    if (editingId) {
      excluded.add(editingId);
      const found = this.findCategoryInTree(editingId);
      const collectDesc = (node: Category) => {
        for (const ch of node.children || []) {
          excluded.add(ch.id);
          collectDesc(ch);
        }
      };
      if (found) collectDesc(found);
    }

    const opts: Array<{ id: string; label: string }> = [];
    const walk = (nodes: Category[], depth: number) => {
      for (const n of nodes) {
        if (!excluded.has(n.id)) {
          opts.push({
            id: n.id,
            label: `${'— '.repeat(depth)}${n.name}`,
          });
        }
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(this.collections(), 0);
    return opts;
  }

  private findCategoryInTree(id: string): Category | null {
    const walk = (nodes: Category[]): Category | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const hit = walk(n.children || []);
        if (hit) return hit;
      }
      return null;
    };
    return walk(this.collections());
  }

  deleteCategory(c: Category) {
    if (
      !confirm(
        `Delete “${c.name}”? Sub-categories must be removed first.`,
      )
    ) {
      return;
    }
    this.catalog.deleteCategory(c.id).subscribe({
      next: () => {
        this.toast('Category deleted');
        this.loadCatalog();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Delete failed',
        );
      },
    });
  }

  onCategoryDragStart(event: DragEvent, row: CategoryTreeListRow) {
    event.stopPropagation();
    this.dragCategoryId.set(row.category.id);
    this.dragParentId.set(row.category.parentId ?? null);
    event.dataTransfer?.setData('text/plain', row.category.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onCategoryDragOver(event: DragEvent, row: CategoryTreeListRow) {
    const dragId = this.dragCategoryId();
    const dragParent = this.dragParentId();
    if (!dragId || dragId === row.category.id) return;
    if ((row.category.parentId ?? null) !== dragParent) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverCategoryId.set(row.category.id);
  }

  onCategoryDragLeave(id: string) {
    if (this.dragOverCategoryId() === id) this.dragOverCategoryId.set(null);
  }

  onCategoryDragEnd() {
    this.dragCategoryId.set(null);
    this.dragParentId.set(null);
    this.dragOverCategoryId.set(null);
  }

  onCategoryDrop(event: DragEvent, row: CategoryTreeListRow) {
    event.preventDefault();
    event.stopPropagation();
    const fromId = this.dragCategoryId();
    const parentId = this.dragParentId();
    const toId = row.category.id;
    this.onCategoryDragEnd();
    if (!fromId || fromId === toId) return;
    if ((row.category.parentId ?? null) !== parentId) {
      this.toast('Reorder only within the same parent level');
      return;
    }
    this.reorderSiblings(parentId, fromId, toId);
  }

  private reorderSiblings(
    parentId: string | null,
    fromId: string,
    toId: string,
  ) {
    const apparelId = this.apparelRootId();
    const isRootLevel = !parentId || parentId === apparelId;

    let siblings: Category[];
    if (isRootLevel) {
      siblings = [...this.collections()];
    } else {
      const parent = this.findCategoryInTree(parentId!);
      siblings = [...(parent?.children || [])];
    }

    const fromIdx = siblings.findIndex((c) => c.id === fromId);
    const toIdx = siblings.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const [moved] = siblings.splice(fromIdx, 1);
    siblings.splice(toIdx, 0, moved);

    const items = siblings.map((c, i) => ({
      id: c.id,
      sortOrder: (i + 1) * 10,
    }));

    // Optimistic local update
    if (isRootLevel) {
      this.collections.set(
        siblings.map((c, i) => ({ ...c, sortOrder: items[i].sortOrder })),
      );
    } else {
      this.collections.update((roots) =>
        this.mapTree(roots, (node) => {
          if (node.id !== parentId) return node;
          return {
            ...node,
            children: siblings.map((c, i) => ({
              ...c,
              sortOrder: items[i].sortOrder,
            })),
          };
        }),
      );
    }

    this.catalog.reorderCategories(items).subscribe({
      next: () => this.toast('Order saved'),
      error: () => {
        this.error.set('Failed to save order');
        this.reloadCollections();
      },
    });
  }

  private mapTree(
    nodes: Category[],
    fn: (n: Category) => Category,
  ): Category[] {
    return nodes.map((n) => {
      const next = fn(n);
      return {
        ...next,
        children: next.children?.length
          ? this.mapTree(next.children, fn)
          : next.children,
      };
    });
  }

  openBrandModal() {
    this.brandFormName = '';
    this.brandModalError.set('');
    this.brandModalOpen.set(true);
  }

  saveBrand() {
    const name = this.brandFormName.trim();
    if (!name) {
      this.brandModalError.set('Name is required');
      return;
    }
    this.catalog.createBrand(name).subscribe({
      next: () => {
        this.brandModalOpen.set(false);
        this.toast('Brand created');
        this.loadBrands();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.brandModalError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Save failed',
        );
      },
    });
  }

  deleteBrand(b: ProductTag) {
    if (!confirm(`Delete brand “${b.name}”?`)) return;
    this.catalog.deleteTag(b.id).subscribe({
      next: () => {
        this.toast('Brand deleted');
        this.loadBrands();
      },
      error: (err) =>
        this.error.set(err?.error?.message || 'Delete failed'),
    });
  }

  openAttrModal(existing?: AttributeDefinition) {
    if (existing) {
      this.editingAttrId.set(existing.id);
      this.attrForm = {
        name: existing.name || '',
        code: existing.code || '',
        valueType: (existing.valueType as typeof this.attrForm.valueType) || 'text',
        options: (existing.options || []).map((o, i) => ({
          value: o.value,
          label: o.label,
          sortOrder: o.sortOrder ?? i,
        })),
      };
    } else {
      this.editingAttrId.set(null);
      this.attrForm = {
        name: '',
        code: '',
        valueType: 'select',
        options: [{ value: '', label: '', sortOrder: 0 }],
      };
    }
    this.attrModalError.set('');
    this.attrModalOpen.set(true);
  }

  addAttrOption() {
    this.attrForm.options.push({
      value: '',
      label: '',
      sortOrder: this.attrForm.options.length,
    });
  }

  onAttrOptionLabel(i: number) {
    const opt = this.attrForm.options[i];
    if (!opt) return;
    if (!opt.value.trim() && opt.label.trim()) {
      opt.value = opt.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  }

  saveAttribute() {
    const name = this.attrForm.name.trim();
    const code =
      this.attrForm.code.trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name) {
      this.attrModalError.set('Name is required');
      return;
    }
    const needsOptions =
      this.attrForm.valueType === 'select' || this.attrForm.valueType === 'multiselect';
    const options = this.attrForm.options
      .map((o, i) => ({
        label: o.label.trim(),
        value:
          o.value.trim() ||
          o.label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
        sortOrder: i,
      }))
      .filter((o) => o.label && o.value);
    if (needsOptions && !options.length) {
      this.attrModalError.set('Add at least one option for select attributes');
      return;
    }
    const payload = {
      name,
      code,
      valueType: this.attrForm.valueType,
      options: needsOptions ? options : undefined,
    };
    const id = this.editingAttrId();
    const req$ = id
      ? this.catalog.updateAttribute(id, payload)
      : this.catalog.createAttribute(payload);
    req$.subscribe({
      next: () => {
        this.attrModalOpen.set(false);
        this.editingAttrId.set(null);
        this.toast(id ? 'Attribute updated' : 'Attribute created');
        this.loadAttributes();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.attrModalError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Save failed',
        );
      },
    });
  }

  deleteAttribute(a: AttributeDefinition) {
    if (!confirm(`Delete attribute “${a.name}”?`)) return;
    this.catalog.deleteAttribute(a.id).subscribe({
      next: () => {
        this.toast('Attribute deleted');
        this.loadAttributes();
      },
      error: (err) =>
        this.error.set(err?.error?.message || 'Delete failed'),
    });
  }

  loadBrands() {
    this.catalog.getBrands().subscribe({
      next: (list) => this.brands.set(list),
      error: () => this.error.set('Failed to load brands'),
    });
  }

  loadAttributes() {
    this.catalog.getAttributes().subscribe({
      next: (list) => this.attributes.set(list),
      error: () => this.error.set('Failed to load attributes'),
    });
  }

  saveCollection() {
    if (!this.colForm.name.trim()) {
      this.colModalError.set('Name is required');
      return;
    }
    const parentId = this.colForm.parentId || this.apparelRootId();
    const payload = {
      name: this.colForm.name.trim(),
      slug: this.colForm.slug.trim() || undefined,
      description: this.colForm.description.trim() || undefined,
      isActive: this.colForm.isActive,
      parentId,
      imageUrl: this.colForm.imageUrl.trim() || '',
    };
    const id = this.editingCollectionId();
    const req$ = id
      ? this.catalog.updateCategory(id, payload)
      : this.catalog.createCategory(payload);
    req$.subscribe({
      next: () => {
        this.colModalOpen.set(false);
        this.toast(id ? 'Category updated' : 'Category created');
        this.loadCatalog();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.colModalError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Save failed',
        );
      },
    });
  }

  priceLabel(p: Product): string {
    return formatProductPrice(p, null, { from: true, fallback: 'Quote' });
  }

  productCategoryLabel(p: Product): string {
    return p.category?.name || p.template || 'Uncategorised';
  }

  productGenderLabel(p: Product): string {
    for (const av of p.attributeValues || []) {
      if (av.attributeDefinition?.code === 'gender') {
        return (av.option?.label || av.valueText || '').trim() || '—';
      }
    }
    return '—';
  }

  variantCount(p: Product): number {
    return p.colors?.length || 0;
  }

  onProductDragStart(event: DragEvent, p: Product, scope: 'all' | 'drill') {
    if (this.productReorderBusy()) {
      event.preventDefault();
      return;
    }
    if (this.prodSearch().trim()) {
      event.preventDefault();
      this.toast('Clear search to reorder products');
      return;
    }
    event.stopPropagation();
    this.dragProductId.set(p.id);
    this.dragProductScope.set(scope);
    event.dataTransfer?.setData('text/plain', p.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onProductDragOver(event: DragEvent, p: Product, scope: 'all' | 'drill') {
    const dragId = this.dragProductId();
    if (!dragId || dragId === p.id) return;
    if (this.dragProductScope() !== scope) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverProductId.set(p.id);
  }

  onProductDragLeave(id: string) {
    if (this.dragOverProductId() === id) this.dragOverProductId.set(null);
  }

  onProductDragEnd() {
    this.dragProductId.set(null);
    this.dragProductScope.set(null);
    this.dragOverProductId.set(null);
  }

  onProductDrop(event: DragEvent, p: Product, scope: 'all' | 'drill') {
    event.preventDefault();
    event.stopPropagation();
    const fromId = this.dragProductId();
    const toId = p.id;
    const dragScope = this.dragProductScope();
    this.onProductDragEnd();
    if (!fromId || fromId === toId || dragScope !== scope) return;
    this.reorderProducts(fromId, toId, scope);
  }

  private reorderProducts(
    fromId: string,
    toId: string,
    scope: 'all' | 'drill',
  ) {
    const source =
      scope === 'drill'
        ? [...this.drillProductList()].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          )
        : [...this.products()].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );

    const fromIdx = source.findIndex((x) => x.id === fromId);
    const toIdx = source.findIndex((x) => x.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const [moved] = source.splice(fromIdx, 1);
    source.splice(toIdx, 0, moved);

    const ordered = source.map((item, i) => ({
      ...item,
      sortOrder: (i + 1) * 10,
    }));

    if (scope === 'drill') {
      this.drillProductList.set(ordered);
      // Mirror sortOrder onto the master catalogue list too
      const byId = new Map(ordered.map((p) => [p.id, p.sortOrder]));
      this.products.update((list) =>
        list.map((p) =>
          byId.has(p.id) ? { ...p, sortOrder: byId.get(p.id)! } : p,
        ),
      );
    } else {
      this.products.set(ordered);
    }

    this.productReorderBusy.set(true);
    forkJoin(
      ordered.map((p) =>
        this.catalog.updateProduct(p.id, { sortOrder: p.sortOrder }).pipe(
          catchError(() => of(null)),
        ),
      ),
    ).subscribe({
      next: () => {
        this.productReorderBusy.set(false);
        this.toast('Homepage order saved');
      },
      error: () => {
        this.productReorderBusy.set(false);
        this.error.set('Failed to save product order');
        this.loadCatalog();
        if (this.drill()) this.reloadDrill();
      },
    });
  }

  toast(msg: string) {
    this.toastMsg.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(''), 2400);
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/login?next=/admin'),
      error: () => this.router.navigateByUrl('/login?next=/admin'),
    });
  }

  loadCatalog(after?: () => void) {
    let pending = 3;
    const done = () => {
      if (--pending <= 0) after?.();
    };
    this.catalog.getProducts({ limit: 100 }).subscribe({
      next: (res) => {
        const sorted = [...(res.items || [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
        this.products.set(sorted);
        this.hydrateProductRows(sorted);
        done();
      },
      error: () => {
        this.error.set('Failed to load products. Is the Nest API running?');
        done();
      },
    });
    this.catalog.getCollectionCategories(false).subscribe({
      next: (c) => {
        this.collections.set(c);
        done();
      },
      error: () => {
        this.error.set('Failed to load collections from API');
        done();
      },
    });
    this.catalog.getApparelRootId().subscribe({
      next: (id) => {
        this.apparelRootId.set(id);
        done();
      },
      error: () => done(),
    });
  }

  /** Fill gender / colours when the list payload omits attributeValues. */
  private hydrateProductRows(items: Product[]) {
    const need = items.filter((p) => {
      const hasGender = (p.attributeValues || []).some(
        (av) => av.attributeDefinition?.code === 'gender',
      );
      return !hasGender;
    });
    if (!need.length) return;
    forkJoin(
      need.map((p) =>
        this.catalog.getProduct(p.id).pipe(catchError(() => of(p))),
      ),
    ).subscribe({
      next: (full) => {
        const byId = new Map(full.map((p) => [p.id, p]));
        this.products.update((list) =>
          list.map((p) => {
            const f = byId.get(p.id);
            if (!f) return p;
            return {
              ...p,
              ...f,
              sortOrder: p.sortOrder ?? f.sortOrder,
            };
          }),
        );
        if (this.drill()) {
          this.drillProductList.update((list) =>
            list.map((p) => {
              const f = byId.get(p.id);
              if (!f) return p;
              return {
                ...p,
                ...f,
                sortOrder: p.sortOrder ?? f.sortOrder,
              };
            }),
          );
        }
      },
    });
  }

  reloadCollections() {
    this.catalog.getCollectionCategories(false).subscribe({
      next: (c) => this.collections.set(c),
      error: () => this.error.set('Failed to load collections from API'),
    });
  }

  /** Persist admin screen in the URL so reload keeps the same view/editor. */
  private syncAdminUrl() {
    if (this.syncingFromUrl) return;
    const ed = this.editor();
    const drill = this.drill();
    const queryParams: Record<string, string | null> = {
      view: this.view(),
      mode:
        this.view() === 'collections' && this.catalogMode() === 'extras'
          ? 'extras'
          : null,
      collection: drill?.id ?? null,
      product: ed ? ed.productId || 'new' : null,
      standalone: ed && !ed.productId && ed.startStandalone ? '1' : null,
      categoryId: ed?.categoryId ?? null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  private restoreFromQuery(params: ParamMap) {
    const allowed: AdminView[] = [
      'overview',
      'collections',
      'products',
      'brands',
      'categories',
      'attributes',
      'orders',
      'enquiries',
      'settings',
    ];
    const viewParam = params.get('view') as AdminView | null;
    const view = viewParam && allowed.includes(viewParam) ? viewParam : 'overview';

    this.syncingFromUrl = true;
    try {
      this.view.set(view);
      if (this.isProductsSectionView(view)) this.productsNavOpen.set(true);

      if (view === 'collections') {
        this.catalogMode.set(params.get('mode') === 'extras' ? 'extras' : 'collections');
      }
      if (view === 'products') this.catalogMode.set('extras');
      if (view === 'categories') this.catalogMode.set('collections');
      if (view === 'brands') this.loadBrands();
      if (view === 'attributes') this.loadAttributes();
      if (view === 'enquiries' || view === 'overview') this.loadEnquiries();

      const collectionId = params.get('collection');
      if (
        (view === 'collections' || view === 'categories') &&
        collectionId
      ) {
        const col = this.collections().find((c) => c.id === collectionId);
        if (col) {
          if (this.drill()?.id !== col.id) {
            this.drill.set(col);
            this.reloadDrill();
          }
        } else {
          this.drill.set(null);
        }
      } else if (!params.get('product')) {
        this.drill.set(null);
        this.drillProductList.set([]);
      }

      const product = params.get('product');
      if ((view === 'collections' || view === 'products' || view === 'categories') && product) {
        if (product === 'new') {
          const categoryId = params.get('categoryId');
          const standalone = params.get('standalone') === '1' || !categoryId;
          const col = categoryId
            ? this.collections().find((c) => c.id === categoryId)
            : null;
          this.editor.set({
            productId: null,
            categoryId: standalone ? null : categoryId,
            categoryName: col?.name || '',
            lockCategory: !standalone && !!categoryId,
            startStandalone: standalone,
          });
        } else {
          const p = this.products().find((x) => x.id === product);
          const categoryId =
            params.get('categoryId') ||
            p?.categoryId ||
            p?.category?.id ||
            null;
          const col = categoryId
            ? this.collections().find((c) => c.id === categoryId)
            : null;
          this.editor.set({
            productId: product,
            categoryId,
            categoryName: col?.name || p?.category?.name || '',
            lockCategory: false,
            startStandalone: !categoryId,
          });
        }
      } else {
        this.editor.set(null);
      }
    } finally {
      this.syncingFromUrl = false;
    }
  }
}
