import { Injectable } from '@angular/core';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  writeBatch
} from 'firebase/firestore';

export interface AppNotification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  taskId?: string;
  type?: 'due_today' | 'overdue' | 'general';
  sentDate?: string;
}

export interface Task {
  id?: string;
  taskNumber?: string;
  details: string;
  urgency: string;
  status: 'received' | 'approved' | 'submitted' | 'completed' | 'rejected';
  assigneeId?: string;
  assigneeName?: string;
  assignerId?: string;
  assigner?: string;
  startDate?: string;
  dueDate?: string;
  duration?: number;
  submittedDate?: string;
  completedDate?: string;
  rejectedDate?: string;
  rating?: { quality: number; speed: number; comment?: string };
  adminFeedback?: string;
  rejectCount?: number;
  autoApproved?: boolean;
  autoAccepted?: boolean;
  reassigned?: boolean;
  companyId?: string;
  createdAt?: any;
}

export interface User {
  id?: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  benchmark?: number;
  autoAcceptCount?: number;
  autoApproveCount?: number;
  createdAt?: any;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {

  async addUser(user: User, uid: string) {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { ...user, createdAt: new Date() });
  }

  async getUsers(): Promise<User[]> {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async getUserById(uid: string): Promise<User | null> {
    const snapshot = await getDoc(doc(db, 'users', uid));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as any) };
  }

  async getUsersByCompany(companyId: string): Promise<User[]> {
    const q = query(collection(db, 'users'), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async addTask(task: Task) {
    await addDoc(collection(db, 'tasks'), {
      ...task,
      status: 'received',
      createdAt: new Date()
    });
  }

  async getTasksByCompany(companyId: string): Promise<Task[]> {
    const q = query(collection(db, 'tasks'), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async getTasksByAssignee(assigneeId: string, companyId: string): Promise<Task[]> {
    const q = query(
      collection(db, 'tasks'),
      where('assigneeId', '==', assigneeId),
      where('companyId', '==', companyId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async getTasksByStatus(
    companyId: string,
    status: 'received' | 'approved' | 'submitted' | 'completed' | 'rejected'
  ): Promise<Task[]> {
    const q = query(
      collection(db, 'tasks'),
      where('companyId', '==', companyId),
      where('status', '==', status)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async getActiveTasksByCompany(companyId: string): Promise<Task[]> {
    const q = query(
      collection(db, 'tasks'),
      where('companyId', '==', companyId),
      where('status', 'in', ['received', 'approved', 'submitted'])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  async updateTaskStatus(
    taskId: string,
    status: 'received' | 'approved' | 'submitted' | 'completed' | 'rejected'
  ) {
    const taskRef = doc(db, 'tasks', taskId);
    const update: any = { status };
    if (status === 'submitted') update.submittedDate = new Date().toISOString();
    if (status === 'completed') update.completedDate = new Date().toISOString();
    if (status === 'received')  update.rejectedDate  = new Date().toISOString();
    await updateDoc(taskRef, update);
  }

  async reassignTask(taskId: string, newAssigneeId: string) {
    await updateDoc(doc(db, 'tasks', taskId), {
      assigneeId: newAssigneeId,
      status: 'received'
    });
  }

  async updateTaskDetails(taskId: string, updatedFields: Partial<Task>) {
    await updateDoc(doc(db, 'tasks', taskId), updatedFields);
  }

  async updateTaskRating(
    taskId: string,
    rating: { quality: number; speed: number; comment?: string }
  ) {
    await updateDoc(doc(db, 'tasks', taskId), { rating });
  }

  async updateTaskFeedback(taskId: string, feedback: string) {
    await updateDoc(doc(db, 'tasks', taskId), { adminFeedback: feedback });
  }

  async incrementRejectCount(taskId: string) {
    const taskRef = doc(db, 'tasks', taskId);
    const snapshot = await getDoc(taskRef);
    const current = snapshot.data()?.['rejectCount'] || 0;
    await updateDoc(taskRef, { rejectCount: current + 1 });
  }

  async getNextTaskNumber(companyId: string): Promise<string> {
    const q = query(collection(db, 'tasks'), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    const count = snapshot.size + 1;
    return `TASK-${String(count).padStart(4, '0')}`;
  }

  async updateUserBenchmark(userId: string, benchmark: number) {
    await updateDoc(doc(db, 'users', userId), { benchmark });
  }

  async incrementUserAutoAccept(userId: string) {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    const current = snapshot.data()?.['autoAcceptCount'] || 0;
    await updateDoc(userRef, { autoAcceptCount: current + 1 });
  }

  async incrementUserAutoApprove(userId: string) {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    const current = snapshot.data()?.['autoApproveCount'] || 0;
    await updateDoc(userRef, { autoApproveCount: current + 1 });
  }

  async addNotification(notification: Omit<AppNotification, 'id'>) {
    await addDoc(collection(db, 'notifications'), notification);
  }

  async markNotificationRead(notificationId: string) {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  }

  async markAllNotificationsRead(userId: string) {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  listenToNotifications(
    userId: string,
    callback: (notifications: AppNotification[]) => void
  ) {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snapshot => {
      const notifications = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      }));
      callback(notifications);
    });
  }

  async dueDateNotificationExists(
    taskId: string,
    type: 'due_today' | 'overdue'
  ): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(
      collection(db, 'notifications'),
      where('taskId', '==', taskId),
      where('type', '==', type),
      where('sentDate', '==', today)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  async sendEmail(to: string, subject: string, body: string) {
    await addDoc(collection(db, 'mail'), {
      to,
      message: { subject, html: body }
    });
  }
}