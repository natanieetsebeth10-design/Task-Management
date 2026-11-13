import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';
import { FirebaseService } from '../../services/firebase';
import { DueDateService } from '../../services/due-date/due-date';
import { SidebarComponent } from '../sidebar/sidebar';
import { EMPTY, Subscription } from 'rxjs';
import { IconComponent } from '../../shared/icon/icon';
import { switchMap, map } from 'rxjs/operators';
import { auth as fbAuth } from '../../../firebase';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, IconComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  isAdmin = false;
  loadingRole = true;
  unreadCount = 0;

  private sub!: Subscription;
  private unsubscribeNotifs?: () => void;

  constructor(
    private auth: AuthService,
    private firebase: FirebaseService,
    private dueDateService: DueDateService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
  this.sub = this.auth.currentUser$
    .pipe(
      switchMap(user => {
        // tear down the previous user's notification listener
        this.unsubscribeNotifs?.();
        this.unsubscribeNotifs = undefined;

        if (!user) return EMPTY;   // signed out: stop everything

        this.unsubscribeNotifs = this.firebase.listenToNotifications(
          user.uid,
          notifications => {
            this.unreadCount = notifications.filter(n => !n.read).length;
            this.cdr.detectChanges();
          }
        );

        // switchMap cancels this inner stream automatically when the user changes
        return this.auth.currentRole$.pipe(map(role => ({ user, role })));
      })
    )
    .subscribe(async ({ user, role }) => {
      this.isAdmin = role === 'admin';
      this.loadingRole = false;
      this.cdr.detectChanges();

      const companyId = this.auth.currentCompanyId$.value;
      if (!companyId || !fbAuth.currentUser) return;   // never query while signed out

      try {
        await this.dueDateService.checkDueDates(companyId, user.uid, this.isAdmin);
      } catch (e) {
        console.warn('Due date check failed:', e);
      }
    });
}

  navigate(path: string) { this.router.navigate([path]); }
  goToSettings() { this.router.navigate(['/settings']); }
  goToNotifications() { this.router.navigate(['/notifications']); }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
    if (this.unsubscribeNotifs) this.unsubscribeNotifs();
  }
}