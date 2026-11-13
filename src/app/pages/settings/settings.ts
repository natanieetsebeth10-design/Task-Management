import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.services';
import { FirebaseService } from '../../services/firebase';
import { Subscription } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { exportCompanyBackup } from '../../services/backup';
import { passwordProblems } from '../../core/password.util';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.html',
  styleUrls: ['./settings.css']
})
export class SettingsComponent implements OnInit, OnDestroy {
  userName = '';
  userEmail = '';
  userRole = '';
  backupMsg = '';
  backingUp = false;

  passwordForm!: FormGroup;
  passwordSuccess = '';
  passwordError = '';
  changingPassword = false;

  private sub!: Subscription;
  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }
  get passwordHint(): string {
  const m = passwordProblems(this.passwordForm.get('newPassword')?.value || '');
  return m.length ? 'Password needs ' + m.join(', ') + '.' : '';
}

 constructor(
  private auth: AuthService,
  private firebase: FirebaseService,
  private fb: FormBuilder,
  private router: Router,
  private cdr: ChangeDetectorRef
) {}

  ngOnInit() {
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, (c: any) =>
  passwordProblems(c.value || '').length ? { weak: true } : null]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    this.sub = this.auth.currentUser$.subscribe(async user => {
  if (!user) return;
  this.userEmail = user.email ?? '';
  const doc = await this.firebase.getUserById(user.uid);
  if (doc) {
    this.userName = doc.name;
    this.userRole = doc.role;
  }
  this.cdr.detectChanges();
});
  }

  passwordMatchValidator(group: FormGroup) {
    const newPw = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return newPw === confirm ? null : { mismatch: true };
  }

  async onChangePassword() {
    if (this.passwordForm.invalid) return;
    this.changingPassword = true;
    this.passwordError = '';
    this.passwordSuccess = '';

    const { currentPassword, newPassword } = this.passwordForm.value;

    try {
      await this.auth.changePassword(currentPassword, newPassword);
      this.passwordSuccess = 'Password changed successfully!';
      this.passwordForm.reset();
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        this.passwordError = 'Current password is incorrect.';
      } else if (err.code === 'auth/weak-password') {
        this.passwordError = 'New password is too weak.';
      } else {
        this.passwordError = err.message;
      }
    } finally {
      this.changingPassword = false;
      this.cdr.detectChanges();
    }
  }
  async backupNow() {
    this.backingUp = true;
    this.backupMsg = '';
    this.cdr.detectChanges();
    try {
      const companyId = await firstValueFrom(this.auth.currentCompanyId$);
      if (!companyId) throw new Error('No company found');
      const r = await exportCompanyBackup(companyId);
      this.backupMsg = `Backup downloaded: ${r.users} users, ${r.tasks} tasks.`;
    } catch (e) {
      this.backupMsg = 'Backup failed. Please try again.';
    } finally {
      this.backingUp = false;
      this.cdr.detectChanges();
    }
  }

  async onLogout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }
}