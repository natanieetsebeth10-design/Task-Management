import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { PdfExportService } from '../../services/pdf-export';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  Chart, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface UserReport {
  user: User;
  tasks: Task[];
  totalHours: number;
  utilization: number;
  avgQuality: number;
  avgSpeed: number;
  comments: { date: string; comment: string; taskDetails: string }[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './report.html',
  styleUrls: ['./report.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  companyId!: string;
  private companySub!: Subscription;

  users: User[] = [];
  allTasks: Task[] = [];
  reports: UserReport[] = [];
  Math = Math;

  // Filters
  filterUserId = 'all';
  filterDateFrom = '';
  filterDateTo = '';

  // Pagination
  pageSize = 10;
  pageSizeOptions = [5, 10, 25];
  currentPage = 1;

  weeklyBenchmark = 40;
  selectedUserId: string | null = null;

  ratingChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  ratingChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } }
  };
  gaugeValue = 0;

  get nonAdminUsers(): User[] {
    return this.users.filter(u => u.role !== 'admin');
  }

  get filteredReports(): UserReport[] {
    return this.reports.filter(r => {
      if (this.filterUserId !== 'all' && r.user.id !== this.filterUserId) return false;
      return true;
    });
  }

  get totalPages(): number {
    return Math.ceil(this.filteredReports.length / this.pageSize);
  }

  get pagedReports(): UserReport[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredReports.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get selectedReport(): UserReport | null {
    return this.reports.find(r => r.user.id === this.selectedUserId) ?? null;
  }

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private pdf: PdfExportService
  ) {}

  ngOnInit() {
    this.companySub = this.auth.currentCompanyId$.subscribe(cid => {
      if (cid) {
        this.companyId = cid;
        this.loadData();
      }
    });
  }

  ngOnDestroy() {
    if (this.companySub) this.companySub.unsubscribe();
  }

  async loadData() {
    [this.users, this.allTasks] = await Promise.all([
      this.firebase.getUsersByCompany(this.companyId),
      this.firebase.getTasksByCompany(this.companyId)
    ]);
    this.buildReports();
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

  buildReports() {
    const from = this.filterDateFrom;   // "YYYY-MM-DD" or ''
    const to = this.filterDateTo;

    this.reports = this.users
      .filter(u => u.role !== 'admin')
      .map(user => {
        let tasks = this.allTasks.filter(
          t => (t.assigneeId === user.id || !!t.assigneeIds?.includes(user.id!)) && t.status === 'completed'
        );

        // Apply date filter (inclusive on both ends)
        if (from || to) {
          tasks = tasks.filter(t => {
            const day = this.toDay(t.completedDate) || this.toDay(t.startDate);
            if (!day) return false;
            if (from && day < from) return false;
            if (to && day > to) return false;
            return true;
          });
        }

        const totalHours = tasks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
        const benchmark = user.benchmark ?? this.weeklyBenchmark;
        const utilization = benchmark > 0
          ? Math.min(Math.round((totalHours / benchmark) * 100), 100)
          : 0;

        const ratedTasks = tasks.filter(t => t.rating && !t.autoApproved);
        const avgQuality = ratedTasks.length
          ? +(ratedTasks.reduce((s, t) => s + (t.rating?.quality ?? 0), 0) / ratedTasks.length).toFixed(1)
          : 0;
        const avgSpeed = ratedTasks.length
          ? +(ratedTasks.reduce((s, t) => s + (t.rating?.speed ?? 0), 0) / ratedTasks.length).toFixed(1)
          : 0;

        const comments = tasks
          .filter(t => t.rating?.comment)
          .map(t => ({
            date: this.toDay(t.completedDate) || this.toDay(t.startDate),
            comment: t.rating!.comment!,
            taskDetails: t.details
          }))
          .sort((a, b) => b.date.localeCompare(a.date));

        return { user, tasks, totalHours, utilization, avgQuality, avgSpeed, comments };
      })
      .sort((a, b) => b.utilization - a.utilization);

    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  applyFilters() {
    this.selectedUserId = null;
    this.buildReports();
  }

  clearFilters() {
    this.filterUserId = 'all';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.buildReports();
  }

  selectUser(userId: string) {
    this.selectedUserId = this.selectedUserId === userId ? null : userId;
    if (this.selectedReport) this.buildUserChart(this.selectedReport);
  }

  buildUserChart(report: UserReport) {
    const labels = report.tasks.map(t => {
      const day = this.toDay(t.completedDate);
      return day || t.details.slice(0, 10);
    });
    this.ratingChartData = {
      labels,
      datasets: [
        { label: 'Quality', data: report.tasks.map(t => t.rating?.quality ?? 0), backgroundColor: '#a5b5f0' },
        { label: 'Speed', data: report.tasks.map(t => t.rating?.speed ?? 0), backgroundColor: '#c8d0f8' }
      ]
    };
    this.gaugeValue = report.utilization;
    this.cdr.detectChanges();
  }

  async updateBenchmark(user: User, value: number) {
    user.benchmark = value;
    await this.firebase.updateUserBenchmark(user.id!, value);
    this.buildReports();
  }

  onGlobalBenchmarkChange() {
    this.buildReports();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.selectedUserId = null;
    }
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.selectedUserId = null;
  }

  // Exports the whole filtered leaderboard (not just the page you are looking at)
  exportPdf() {
    const rows = this.filteredReports.map((r, i) => [
      i + 1,
      r.user.name,
      r.user.email,
      r.tasks.length,
      `${r.totalHours}h`,
      `${r.utilization}%`,
      `${r.avgQuality}/5`,
      `${r.avgSpeed}/5`,
      r.user.benchmark ?? this.weeklyBenchmark,
      r.user.autoAcceptCount ?? 0
    ]);

    const employee = this.filterUserId === 'all'
      ? 'All employees'
      : (this.users.find(u => u.id === this.filterUserId)?.name ?? '');

    this.pdf.exportTable({
      filename: 'performance-report',
      title: 'Performance Report',
      subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}, ranked by utilization`,
      filters: [
        `Employee: ${employee}`,
        `Completed from: ${this.filterDateFrom || 'any date'}   to: ${this.filterDateTo || 'any date'}`,
        `Global benchmark: ${this.weeklyBenchmark} hrs/wk`
      ],
      head: ['Rank', 'Employee', 'Email', 'Completed', 'Total hrs', 'Utilization', 'Avg quality', 'Avg speed', 'Benchmark', 'Auto-accepts'],
      rows,
      landscape: true
    });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}