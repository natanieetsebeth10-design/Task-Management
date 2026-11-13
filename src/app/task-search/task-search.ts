import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseService, Task, User } from '../services/firebase';
import { AuthService } from '../services/auth.services';
import { PdfExportService } from '../services/pdf-export';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-task-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-search.html',
  styleUrls: ['./task-search.css']
})
export class TaskSearchComponent implements OnInit, OnDestroy {
  companyId = '';
  allTasks: Task[] = [];
  filteredTasks: Task[] = [];
  users: User[] = [];

  // Filters
  searchTaskId = '';
  searchAssignee = '';
  searchStatus = 'all';
  searchDateFrom = '';
  searchDateTo = '';

  // Pagination properties
  pageSize = 10;
  pageSizeOptions = [5, 10, 25];
  currentPage = 1;
  Math = Math;

  loading = true;
  private sub!: Subscription;

  statusOptions = ['all', 'received', 'approved', 'submitted', 'completed', 'rejected'];

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private pdf: PdfExportService
  ) {}

  ngOnInit() {
    this.sub = this.auth.currentCompanyId$.subscribe(async cid => {
      if (cid) {
        this.companyId = cid;
        await this.loadData();
      }
    });
  }

  async loadData() {
    [this.allTasks, this.users] = await Promise.all([
      this.firebase.getTasksByCompany(this.companyId),
      this.firebase.getUsersByCompany(this.companyId)
    ]);
    this.filteredTasks = [...this.allTasks];
    this.loading = false;
    this.cdr.detectChanges();
  }

  getAssigneeName(assigneeId: string): string {
    return this.users.find(u => u.id === assigneeId)?.name ?? assigneeId;
  }

  // Turns a string / ISO string / Firestore Timestamp / Date into "YYYY-MM-DD" (local time)
  private toDay(val: any): string {
    if (!val) return '';
    let d: Date;
    if (typeof val === 'string') {
      if (val.length <= 10) return val;          // already "YYYY-MM-DD"
      d = new Date(val);
    } else if (typeof val.toDate === 'function') {
      d = val.toDate();
    } else if (val instanceof Date) {
      d = val;
    } else {
      return '';
    }
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  applyFilters() {
    const id = this.searchTaskId.trim().toLowerCase();
    const name = this.searchAssignee.trim().toLowerCase();

    this.filteredTasks = this.allTasks.filter(t => {
      // Task ID (older tasks have no taskNumber, so default to '')
      if (id && !(t.taskNumber ?? '').toLowerCase().includes(id)) return false;

      // Assignee name
      if (name) {
        const assignee = (t.assigneeName ?? this.getAssigneeName(t.assigneeId ?? '')).toLowerCase();
        if (!assignee.includes(name)) return false;
      }

      // Status
      if (this.searchStatus !== 'all' && t.status !== this.searchStatus) return false;

      // Due date range (inclusive)
      const due = this.toDay(t.dueDate);
      if (this.searchDateFrom && (!due || due < this.searchDateFrom)) return false;
      if (this.searchDateTo && (!due || due > this.searchDateTo)) return false;

      return true;
    });

    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  clearFilters() {
    this.searchTaskId = '';
    this.searchAssignee = '';
    this.searchStatus = 'all';
    this.searchDateFrom = '';
    this.searchDateTo = '';
    this.filteredTasks = [...this.allTasks];
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  // Exports every task that matches the current search (not just the visible page)
  exportPdf() {
    const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

    const rows = this.filteredTasks.map(t => [
      t.taskNumber ?? '-',
      t.details,
      t.assigner ?? '-',
      (t.assigneeNames && t.assigneeNames.length > 1)
        ? t.assigneeNames.join(', ')
        : (t.assigneeName ?? this.getAssigneeName(t.assigneeId ?? '')),
      cap(t.urgency),
      cap(t.status),
      this.toDay(t.startDate) || '-',
      this.toDay(t.dueDate) || '-',
      t.duration ? `${t.duration}h` : '-',
      t.rejectCount ?? 0
    ]);

    const filters: string[] = [];
    if (this.searchTaskId.trim())   filters.push(`Task ID contains: ${this.searchTaskId.trim()}`);
    if (this.searchAssignee.trim()) filters.push(`Assignee contains: ${this.searchAssignee.trim()}`);
    if (this.searchStatus !== 'all') filters.push(`Status: ${cap(this.searchStatus)}`);
    if (this.searchDateFrom || this.searchDateTo) {
      filters.push(`Due from: ${this.searchDateFrom || 'any date'}   to: ${this.searchDateTo || 'any date'}`);
    }
    if (filters.length === 0) filters.push('Filters: none (all tasks)');

    this.pdf.exportTable({
      filename: 'task-overview',
      title: 'Task Overview',
      subtitle: `Showing ${this.filteredTasks.length} of ${this.allTasks.length} tasks`,
      filters,
      head: ['Task ID', 'Details', 'Assigned by', 'Assignee', 'Urgency', 'Status', 'Start', 'Due', 'Duration', 'Rejects'],
      rows,
      landscape: true,
      columnStyles: { 1: { cellWidth: 62 } }
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      received: 'status-received',
      approved: 'status-approved',
      submitted: 'status-submitted',
      completed: 'status-completed',
      rejected: 'status-rejected'
    };
    return map[status] ?? '';
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  isOverdue(task: Task): boolean {
    if (!task.dueDate) return false;
    if (task.status === 'completed') return false;
    const today = new Date().toISOString().slice(0, 10);
    return task.dueDate < today;
  }

  get totalPages(): number {
    return Math.ceil(this.filteredTasks.length / this.pageSize);
  }

  get pagedTasks(): Task[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTasks.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onPageSizeChange() {
    this.currentPage = 1;
  }
}