import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';
import { FirebaseService } from '../../services/firebase';
import { DueDateService } from '../../services/due-date/due-date';
import { SidebarComponent } from '../sidebar/sidebar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent],
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
    this.sub = this.auth.currentUser$.subscribe(user => {
      if (!user) return;

      this.auth.currentRole$.subscribe(async role => {
        this.isAdmin = role === 'admin';
        this.loadingRole = false;
        this.cdr.detectChanges();

        // Run due date checks on login
        const companyId = this.auth.currentCompanyId$.value;
        if (companyId) {
          await this.dueDateService.checkDueDates(
            companyId,
            user.uid,
            this.isAdmin
          );
        }
      });

      // Real time notification badge
      this.unsubscribeNotifs = this.firebase.listenToNotifications(
        user.uid,
        notifications => {
          this.unreadCount = notifications.filter(n => !n.read).length;
          this.cdr.detectChanges();
        }
      );
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