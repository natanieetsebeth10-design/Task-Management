import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FirebaseService, AppNotification } from '../services/firebase';
import { AuthService } from '../services/auth.services';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.html',
  styleUrls: ['./notifications.css']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  userId = '';
  loading = true;

  private userSub!: Subscription;
  private unsubscribeNotifs?: () => void;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userSub = this.auth.currentUser$.subscribe(user => {
      if (!user) return;
      this.userId = user.uid;

      this.unsubscribeNotifs = this.firebase.listenToNotifications(
        user.uid,
        notifications => {
          this.notifications = notifications;
          this.loading = false;
          this.cdr.detectChanges();
        }
      );
    });
  }

  async markAllRead() {
    await this.firebase.markAllNotificationsRead(this.userId);
  }

  async markRead(notification: AppNotification) {
    if (!notification.read) {
      await this.firebase.markNotificationRead(notification.id!);
    }
  }

  get unreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.unsubscribeNotifs) this.unsubscribeNotifs();
  }
}