import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import {
  Chart, BarController, BarElement, CategoryScale,
  LinearScale, Tooltip, Legend, ArcElement, DoughnutController,
  PointElement, LineElement
} from 'chart.js';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';

Chart.register(
  BarController, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, ArcElement, DoughnutController,
  PointElement, LineElement
);

@Component({
  selector: 'app-admin-performance',
  standalone: true,
  imports: [CommonModule, DatePipe, BaseChartDirective],
  templateUrl: './admin-performance.html',
  styleUrls: ['./admin-performance.css'],
  providers: [DatePipe]
})
export class AdminPerformanceComponent implements OnInit, OnDestroy {
  adminId = '';
  companyId = '';
  admin: User | null = null;
  loading = true;

  weekStart = '';
  weekEnd = '';
  today = new Date().toISOString().slice(0, 10);

  totalAssigned = 0;
  totalApproved = 0;
  totalRejected = 0;
  autoApprovedCount = 0;
  overdueCount = 0;
  avgQualityGiven = 0;
  avgSpeedGiven = 0;

  statsChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  statsChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
  };

  doughnutChartData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'bottom' } }
  };

  ratingsChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  ratingsChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } }
  };

  private userSub!: Subscription;
  private companySub!: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe
  ) {}

  ngOnInit() {
    this.generateWeekRange();

    this.userSub = this.auth.currentUser$.subscribe(async user => {
      if (!user) return;
      this.adminId = user.uid;
      const adminDoc = await this.firebase.getUserById(user.uid);
      if (adminDoc) this.admin = adminDoc;
    });

    this.companySub = this.auth.currentCompanyId$.subscribe(async cid => {
      if (cid) {
        this.companyId = cid;
        await this.loadData();
      }
    });
  }

  generateWeekRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    this.weekStart = start.toISOString().slice(0, 10);
    this.weekEnd = end.toISOString().slice(0, 10);
  }

  async loadData() {
    if (!this.adminId || !this.companyId) return;
    this.loading = true;

    const allTasks = await this.firebase.getTasksByCompany(this.companyId);

    const myTasks = allTasks.filter(t => {
      const raw = t.startDate ?? '';
      const dateStr = typeof raw === 'string'
        ? raw
        : (raw as any)?.toDate?.().toISOString() ?? '';
      return t.assignerId === this.adminId &&
        dateStr >= this.weekStart &&
        dateStr <= this.weekEnd;
    });

    this.totalAssigned = myTasks.length;
    this.totalApproved = myTasks.filter(t => t.status === 'completed').length;
    this.totalRejected = myTasks
      .filter(t => t.rejectCount && t.rejectCount > 0)
      .reduce((s, t) => s + (t.rejectCount ?? 0), 0);
    this.autoApprovedCount = myTasks.filter(t => t.autoApproved).length;
    this.overdueCount = myTasks.filter(t =>
      t.dueDate && t.dueDate < this.today && t.status !== 'completed'
    ).length;

    const ratedTasks = myTasks.filter(t => t.rating && !t.autoApproved);
    this.avgQualityGiven = ratedTasks.length
      ? +(ratedTasks.reduce((s, t) => s + (t.rating?.quality ?? 0), 0) / ratedTasks.length).toFixed(1)
      : 0;
    this.avgSpeedGiven = ratedTasks.length
      ? +(ratedTasks.reduce((s, t) => s + (t.rating?.speed ?? 0), 0) / ratedTasks.length).toFixed(1)
      : 0;

    this.buildCharts(myTasks);
    this.loading = false;
    this.cdr.detectChanges();
  }

  buildCharts(tasks: Task[]) {
    this.statsChartData = {
      labels: ['Assigned', 'Approved', 'Rejections', 'Auto-Approved', 'Overdue'],
      datasets: [{
        data: [
          this.totalAssigned,
          this.totalApproved,
          this.totalRejected,
          this.autoApprovedCount,
          this.overdueCount
        ],
        backgroundColor: ['#a5b5f0', '#86efac', '#f87171', '#fbbf24', '#fb923c'],
        borderRadius: 8
      }]
    };

    const manualApproved = Math.max(0, this.totalApproved - this.autoApprovedCount);
    this.doughnutChartData = {
      labels: ['Manually Approved', 'Auto-Approved'],
      datasets: [{
        data: [manualApproved, this.autoApprovedCount],
        backgroundColor: ['#8fa3e6', '#fbbf24'],
        borderWidth: 0
      }]
    };

    const ratedOnly = tasks.filter(t => t.rating && !t.autoApproved);
    this.ratingsChartData = {
      labels: ratedOnly.map(t => t.assigneeName ?? t.details.slice(0, 10)),
      datasets: [
        {
          label: 'Quality',
          data: ratedOnly.map(t => t.rating?.quality ?? 0),
          backgroundColor: '#a5b5f0',
          borderRadius: 6
        },
        {
          label: 'Speed',
          data: ratedOnly.map(t => t.rating?.speed ?? 0),
          backgroundColor: '#c8d0f8',
          borderRadius: 6
        }
      ]
    };
  }

  get manualApprovalRate(): number {
    if (this.totalApproved === 0) return 0;
    return Math.round(((this.totalApproved - this.autoApprovedCount) / this.totalApproved) * 100);
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.companySub) this.companySub.unsubscribe();
  }
}