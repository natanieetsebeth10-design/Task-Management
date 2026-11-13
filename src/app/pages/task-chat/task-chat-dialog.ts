// src/app/pages/task-chat/task-chat-dialog.ts
import { Component, Inject, OnDestroy, AfterViewInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { FirebaseService, ChatMessage } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';

export interface TaskChatData {
  taskId: string;
  title: string;      // task details, shown in the header
  userName: string;   // the logged-in person's name
}

// Messages can hold a Firestore Timestamp (serverTimestamp), an ISO string
// (written by this dialog) or null (pending server timestamp). Normalise to Date | null.
function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

@Component({
  selector: 'app-task-chat-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './task-chat-dialog.html',
  styleUrls: ['./task-chat-dialog.css']
})
export class TaskChatDialogComponent implements AfterViewInit, OnDestroy {
  messages: any[] = [];
  draft = '';
  myId = '';
  loading = true;
  sending = false;
  error = '';

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  private stopListening?: () => void;
  private userSub?: Subscription;
  private destroyed = false;
  private ready = false;   // true once the view exists, so it is safe to call detectChanges()

  constructor(
  private firebase: FirebaseService,
  private auth: AuthService,
  private cdr: ChangeDetectorRef,
  @Inject(MatDialogRef) public dialogRef: MatDialogRef<TaskChatDialogComponent>,
  @Inject(MAT_DIALOG_DATA) public data: TaskChatData
) {
  console.log('[dialog] opened', {
    taskId: data.taskId,
    title: data.title,
    userName: data.userName
  });

  this.userSub = this.auth.currentUser$.subscribe(u => {
    if (u) {
      this.myId = u.uid;
      console.log('[dialog] I am', u.uid, u.email);
      this.refresh();
    }
  });

    this.stopListening = this.firebase.listenToTaskMessages(
      data.taskId,
      (msgs: ChatMessage[]) => {
         console.log('[dialog] msgs', msgs.map((m: any) => [m.senderId, m.text]));
        this.messages = msgs.map((m: any) => ({
          ...m,
          createdAt: toDate(m.createdAt)
        }));
        this.loading = false;
        this.error = '';
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
      await this.firebase.addTaskMessage(this.data.taskId, {
        senderId: this.myId,
        senderName: this.data.userName || 'Someone',
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

  // Enter sends, Shift+Enter adds a new line
  onEnter(ev: Event) {
    const e = ev as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  close() {
    this.dialogRef.close();
  }

  private refresh() {
    if (this.destroyed) return;
    if (this.ready) this.cdr.detectChanges();
    else this.cdr.markForCheck();
  }

  ngAfterViewInit() {
    this.ready = true;
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.stopListening) this.stopListening();
    if (this.userSub) this.userSub.unsubscribe();
  }
}