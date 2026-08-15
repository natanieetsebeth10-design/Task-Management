import { Routes } from '@angular/router';
import { authGuard, guestGuard } from "./auth-gaurd/auth-gaurd"

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  // Guest only (logged-in users get sent to dashboard)
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'join-us',
    loadComponent: () => import('./pages/join/join').then(m => m.JoinComponent),
    canActivate: [guestGuard]
  },

  // Auth required
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'create-task',
    loadComponent: () => import('./pages/create-task/create-task').then(m => m.CreateTaskComponent),
    canActivate: [authGuard]
  },
  {
    path: 'view-tasks',
    loadComponent: () => import('./pages/view-tasks/view-tasks').then(m => m.ViewTasksComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin-board',
    loadComponent: () => import('./pages/admin-board/admin-board').then(m => m.AdminBoardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'add-user',
    loadComponent: () => import('./pages/add-user/add-user').then(m => m.AddUserComponent),
    canActivate: [authGuard]
  },
  {
    path: 'reports',
    loadComponent: () => import('./pages/report/report').then(m => m.ReportsComponent),
    canActivate: [authGuard]
  },
  {
  path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },
  {
  path: 'notifications',
  loadComponent: () => import('./notifications/notifications').then(m => m.NotificationsComponent),
  canActivate: [authGuard]
},
{
  path: 'task-search',
  loadComponent: () => import('./task-search/task-search').then(m => m.TaskSearchComponent),
  canActivate: [authGuard]
},
{
  path: 'my-performance',
  loadComponent: () => import('./pages/user-performance/user-performance').then(m => m.UserPerformanceComponent),
  canActivate: [authGuard]
},
{
  path: 'admin-performance',
  loadComponent: () => import('./pages/admin-performance/admin-performance').then(m => m.AdminPerformanceComponent),
  canActivate: [authGuard]
},
  // Catch-all
  { path: '**', redirectTo: 'home' }
];
