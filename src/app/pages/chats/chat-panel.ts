import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FirebaseService, ChatMessage } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-panel.html',
  styleUrls: ['./chat-panel.css']
})
export class ChatPanelComponent implements OnChanges, OnDestroy {
  @Input() taskId = '';
  @Input() userName = '';

  messages: any[] = [];
  draft = '';
  myId = '';
  loading = true;
  sending = false;
  error = '';

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  private stopListening?: () => void;
  private userSub: Subscription;
  private destroyed = false;
  private ready = false;

ngAfterViewInit() { this.ready = true; }

private refresh() {
  if (this.destroyed) return;
  if (this.ready) this.cdr.detectChanges();
  else this.cdr.markForCheck();
}

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.userSub = this.auth.currentUser$.subscribe(u => {
      if (u) { this.myId = u.uid; this.refresh(); }
    });
  }

  // Re-subscribe whenever a different task is selected
  ngOnChanges(changes: SimpleChanges) {
    if (changes['taskId'] && this.taskId) this.listen();
  }

  private listen() {
    this.stopListening?.();
    this.messages = [];
    this.loading = true;
    this.error = '';

    this.stopListening = this.firebase.listenToTaskMessages(
      this.taskId,
      (msgs: ChatMessage[]) => {
        this.messages = msgs.map((m: any) => ({ ...m, createdAt: toDate(m.createdAt) }));
        this.loading = false;
        this.refresh();
        this.scrollToBottom();
      },
      () => {
        this.loading = false;
        this.error = 'Could not load messages.';
        this.refresh();
      }
    );
  }

  async send() {
    const text = this.draft.trim();
    if (!text || this.sending || !this.myId) return;
    this.sending = true;
    this.error = '';
    try {
      await this.firebase.addTaskMessage(this.taskId, {
        senderId: this.myId,
        senderName: this.userName || 'Someone',
        text
      });
      this.draft = '';
    } catch {
      this.error = 'Message not sent. Please try again.';
    } finally {
      this.sending = false;
      this.refresh();
    }
  }

  onEnter(ev: Event) {
    const e = ev as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.stopListening?.();
    this.userSub.unsubscribe();
  }
}