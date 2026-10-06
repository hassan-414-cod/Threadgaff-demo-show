import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';
import { authGuard, adminGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        title: 'Threadgaff — Wholesale apparel',
        loadComponent: () =>
          import('./features/home/home-page.component').then(
            (m) => m.HomePageComponent,
          ),
      },
      {
        path: 'products',
        title: 'Products — Threadgaff',
        loadComponent: () =>
          import('./features/products/products-page.component').then(
            (m) => m.ProductsPageComponent,
          ),
      },
      {
        path: 'designer',
        title: 'Custom Designer — Threadgaff',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/designer/designer-page.component').then(
            (m) => m.DesignerPageComponent,
          ),
      },
      {
        path: 'quote',
        title: 'Start Your Range — Threadgaff',
        loadComponent: () =>
          import('./features/quote/quote-page.component').then(
            (m) => m.QuotePageComponent,
          ),
      },
      {
        path: 'about',
        title: 'About — Threadgaff',
        loadComponent: () =>
          import('./features/about/about-page.component').then(
            (m) => m.AboutPageComponent,
          ),
      },
      {
        path: 'how-we-work',
        title: 'How We Work — Threadgaff',
        loadComponent: () =>
          import('./features/how-we-work/how-we-work-page.component').then(
            (m) => m.HowWeWorkPageComponent,
          ),
      },
      {
        path: 'solutions',
        title: 'Solutions — Threadgaff',
        loadComponent: () =>
          import('./features/solutions/solutions-page.component').then(
            (m) => m.SolutionsPageComponent,
          ),
      },
      {
        path: 'order/:type',
        title: 'Order — Threadgaff',
        loadComponent: () =>
          import('./features/order/order-page.component').then(
            (m) => m.OrderPageComponent,
          ),
      },
      {
        path: 'shop',
        title: 'Shop — Threadgaff',
        loadComponent: () =>
          import('./features/shop/shop-page.component').then(
            (m) => m.ShopPageComponent,
          ),
      },
    ],
  },
  {
    path: 'login',
    title: 'Sign in — Threadgaff',
    loadComponent: () =>
      import('./features/login/login-page.component').then(
        (m) => m.LoginPageComponent,
      ),
  },
  {
    path: 'admin',
    title: 'Admin — Threadgaff',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-page.component').then(
        (m) => m.AdminPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
