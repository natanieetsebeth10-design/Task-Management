import { Injectable } from '@angular/core';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { BehaviorSubject } from 'rxjs';
import { db, app } from '../../firebase';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private auth = getAuth(app);
  private database = db;

  public currentUser$ = new BehaviorSubject<FirebaseUser | null | undefined>(undefined);
  public currentRole$ = new BehaviorSubject<string | null>(null);
  public currentCompanyId$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.auth.onAuthStateChanged(async (user) => {
      this.currentUser$.next(user);
      if (!user) {
        this.currentRole$.next(null);
        this.currentCompanyId$.next(null);
        return;
      }
      const userDoc = await getDoc(doc(this.database, 'users', user.uid));
      const data = userDoc.data();
      if (data) {
        this.currentRole$.next(data['role']);
        this.currentCompanyId$.next(data['companyId']);
      }
    });
  }

  async login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async createUser(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  async logout() {
    await signOut(this.auth);
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('No user logged in');

    // Re-authenticate first — Firebase requires this before password change
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  }

  async registerCompany(
    companyName: string,
    email: string,
    password: string,
    name: string
  ) {
    const companyRef = doc(this.database, 'companies');
    await setDoc(companyRef, { companyName, createdAt: new Date() });

    const userCred = await this.createUser(email, password);
    await setDoc(doc(this.database, 'users', userCred.user.uid), {
      name, email, role: 'admin',
      companyId: companyRef.id,
      createdAt: new Date()
    });

    return { companyId: companyRef.id, uid: userCred.user.uid };
  }

  async addUserToCompany(
    uid: string, name: string, email: string,
    companyId: string, role = 'member'
  ) {
    await setDoc(doc(this.database, 'users', uid), {
      name, email, role, companyId, createdAt: new Date()
    });
  }

  async getUserRole(): Promise<string | null> {
    const user = this.currentUser$.value;
    if (!user) return null;
    const userDoc = await getDoc(doc(this.database, 'users', user.uid));
    const data = userDoc.data();
    return data ? data['role'] : null;
  }
}