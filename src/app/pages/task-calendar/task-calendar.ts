// src/app/pages/task-calendar/task-calendar.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

import { FirebaseService, Task } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';

@Component({
  selector: 'app-task-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],
  templateUrl: './task-calendar.html'
})
export class TaskCalendarComponent implements OnInit {

  calendarOptions: any = {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    events: []
  };

  constructor(
    private firebaseService: FirebaseService,
    private auth: AuthService
  ) {}

  async ngOnInit() {

    // Use currentUser$ observable
    this.auth.currentUser$.subscribe(async (user) => {

      if (!user) return;

      const userDoc = await this.firebaseService.getUserById(user.uid);

      if (!userDoc || !userDoc.companyId) return;

      const companyId = userDoc.companyId;

      // Load tasks from all statuses
      const rejectedTasks = await this.firebaseService.getTasksByStatus(companyId, 'rejected');
      const approvalTasks = await this.firebaseService.getTasksByStatus(companyId, 'approved');
      const completedTasks = await this.firebaseService.getTasksByStatus(companyId, 'completed');
      const receivedTasks = await this.firebaseService.getTasksByStatus(companyId, 'received');

      // Merge all tasks
      const allTasks: Task[] = [
        ...rejectedTasks,
        ...approvalTasks,
        ...completedTasks,
        ...receivedTasks
      ];

      // Map to calendar events
      this.calendarOptions.events = allTasks.map(task => ({
        title: task.details,
        start: task.startDate,
        end: task.dueDate
      }));

    });

  }

}