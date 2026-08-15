import { Pipe, PipeTransform } from '@angular/core';
import { Task } from '../../services/firebase';

@Pipe({ name: 'tasksByDate', standalone: true })
export class TasksByDatePipe implements PipeTransform {
  transform(tasks: Task[], date: Date): Task[] {
    if (!tasks) return [];
    const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return tasks.filter(t => t.startDate === isoDate);
  }
}