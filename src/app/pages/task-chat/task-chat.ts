import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { db, auth } from '../../../firebase';
import { cleanLink } from '../../core/link.util';
import { Component, Input, OnInit, OnDestroy, signal, inject } from '@angular/core';
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc
} from 'firebase/firestore';
import { FirebaseService } from '../../services/firebase';

@Component({
  selector: 'app-task-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat">
      <div class="chat-list">
        <p class="chat-empty" *ngIf="messages().length === 0">No messages yet. Start the conversation.</p>
        <div *ngFor="let m of messages()" class="msg" [class.mine]="m.senderId === myId">
          <div class="msg-head">{{ m.senderName }}
            <span>{{ m.createdAt?.toDate() | date:'d MMM, HH:mm' }}</span></div>
          <div class="msg-text">{{ m.text }}</div>
          <a *ngIf="m.link" [href]="m.link" target="_blank" rel="noopener noreferrer">Open file</a>
        </div>
      </div>
      <input class="chat-input" [(ngModel)]="text" placeholder="Type a message" (keyup.enter)="send()">
      <input class="chat-input" [(ngModel)]="link" placeholder="Paste a OneDrive or Drive link (optional)">
      <small>Make sure the link is shared so others can open it.</small>
      <p class="chat-error" *ngIf="error()">{{ error() }}</p>
      <button type="button" (click)="send()" [disabled]="sending()">Send</button>
    </div>`,
  styles: [`
    .chat { display:flex; flex-direction:column; gap:8px; }
    .chat-list { max-height:260px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:4px; }
    .msg { background:#f0f2ff; border-radius:10px; padding:8px 10px; align-self:flex-start; max-width:85%; }
    .msg.mine { background:#dfe4ff; align-self:flex-end; }
    .msg-head { font-size:.75rem; color:#3c4ba8; font-weight:600; }
    .msg-head span { font-weight:400; color:#8fa3e6; margin-left:6px; }
    .msg-text { white-space:pre-wrap; }
    .chat-input { padding:8px; border:1px solid #c7cdf0; border-radius:8px; }
    .chat-error { color:#c53030; margin:0; font-size:.85rem; }
    .chat-empty { color:#8fa3e6; text-align:center; }
  `]
})
export class TaskChatComponent implements OnInit, OnDestroy {
  @Input({ required: true }) taskId!: string;
  @Input() userName = '';

  messages = signal<any[]>([]);
  error = signal('');
  sending = signal(false);
  text = '';
  link = '';
  myId = auth.currentUser?.uid ?? '';
  private unsub?: () => void;
  private firebase = inject(FirebaseService);

  ngOnInit() {
    const q = query(collection(db, 'tasks', this.taskId, 'messages'), orderBy('createdAt'));
    this.unsub = onSnapshot(
      q,
      snap => this.messages.set(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => {
        console.error('Chat load failed:', err);
        this.error.set('Could not load messages.');
      }
    );
  }

  private async notifyOthers(text: string) {
    try {
      const snap = await getDoc(doc(db, 'tasks', this.taskId));
      if (!snap.exists()) return;
      const t = snap.data() as any;

      const people = new Set<string>(
        [...(t.assigneeIds?.length ? t.assigneeIds : [t.assigneeId]), t.assignerId].filter(Boolean)
      );
      people.delete(this.myId); // don't notify the sender

      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
      for (const uid of people) {
        await this.firebase.addNotification({
          userId: uid,
          title: 'New chat message',
          message: `${this.userName || 'Someone'} wrote on "${t.details}": ${preview}`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: this.taskId,
          type: 'general'
        });
      }
    } catch (e) {
      // a failed alert must never block the chat
      console.error('Chat notification failed:', e);
    }
  }

  async send() {
    const text = this.text.trim();
    const link = this.link;
    if (!text || this.sending()) return;

    const l = cleanLink(link);
    if (!l.ok) { this.error.set(l.error!); return; }

    this.error.set('');
    this.sending.set(true);
    this.text = ''; this.link = ''; // clear now so the inputs update straight away
    try {
      await addDoc(collection(db, 'tasks', this.taskId, 'messages'), {
        senderId: this.myId,
        senderName: this.userName || 'User',
        text: text.slice(0, 1000),
        link: l.url ?? '',
        createdAt: serverTimestamp()
      });
      this.notifyOthers(text); // fire-and-forget
    } catch (e: any) {
      console.error('Chat send failed:', e);
      this.text = text; this.link = link;
      this.error.set(`Message not sent (${e?.code ?? 'unknown'}).`);
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy() { this.unsub?.(); }
}