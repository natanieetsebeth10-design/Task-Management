import { Component, Input, HostListener, OnDestroy } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { getAuth, signOut } from 'firebase/auth';
import { AuthService } from '../../services/auth.services';
import { IconComponent } from '../../shared/icon/icon';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css'],
  exportAs: 'sidebarComp'
})
export class SidebarComponent implements OnDestroy {

  @Input() isAdmin = false;
  isOpen = false;

  private navSub: Subscription;

  constructor(private router: Router, private auth: AuthService) {
    this.navSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.isOpen = false);
  }

  toggle() { this.isOpen = !this.isOpen; }
  close()  { this.isOpen = false; }

  // Esc closes it too
  @HostListener('document:keydown.escape')
  onEscape() { this.close(); }

  navigate(path: string) {
    this.close();                       // also closes when you click the page you are already on
    this.router.navigate([path]);
  }

  async logout() {
    this.close();
    try {
      // Use your AuthService's own logout if it has one (so it can reset its state),
      // otherwise sign out of Firebase directly.
      const svc: any = this.auth;
      if (typeof svc.logout === 'function') await svc.logout();
      else if (typeof svc.signOut === 'function') await svc.signOut();
      else await signOut(getAuth());
    } catch (err) {
      console.warn('Logout failed:', err);
    }
    this.router.navigate(['/login']);   // change if your login page lives at a different route
  }

  ngOnDestroy() {
    this.navSub.unsubscribe();
  }
}