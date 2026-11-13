import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, firstValueFrom, filter } from 'rxjs';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { ChatPanelComponent } from './chat-panel';
import { ActivatedRoute, Router } from '@angular/router';
@Component({
  selector: 'app-chats-page',
  standalone: true,
  imports: [CommonModule, ChatPanelComponent],
  templateUrl: './chats-page.html',
  styleUrls: ['./chats-page.css']
})
export class ChatsPageComponent implements OnInit, OnDestroy {
  me?: User;
  tasks: Task[] = [];
  selected?: Task;
  loading = true;
  error = '';

  private querySub?: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private router: Router,  
  ) {}

  async ngOnInit() {
    try {
      const u = await firstValueFrom(this.auth.currentUser$.pipe(filter(x => !!x)));
      this.me = (await this.firebase.getUserById(u!.uid)) ?? undefined;
      console.log('[chats] me', this.me);

      if (!this.me) {
        this.error = 'Could not load your profile.';
        return;
      }

      const isAdmin = this.me.role === 'admin';
      const all = isAdmin
        ? await this.firebase.getTasksByCompany(this.me.companyId)
        : await this.firebase.getTasksByAssignee(u!.uid, this.me.companyId);
      console.log('[chats] tasks loaded', all.length);

      this.tasks = all.sort((a, b) => this.created(b) - this.created(a));
    } catch (e) {
      console.error('[chats] load failed', e);
      this.error = 'Could not load your tasks.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }

    // runs now and again whenever ?task= changes
    this.querySub = this.route.queryParamMap.subscribe(p => {
      const wanted = p.get('task');
      this.selected =
        this.tasks.find(t => t.id === wanted) ?? this.selected ?? this.tasks[0];
      this.cdr.detectChanges();
    });
  }

  select(t: Task) {
    this.selected = t;
    this.cdr.detectChanges();
  }

  private created(t: Task): number {
    const c: any = t.createdAt;
    return c?.toMillis ? c.toMillis() : c ? new Date(c).getTime() : 0;
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
  }
  goBack() { this.router.navigate(['/dashboard']); }           // add this method
}