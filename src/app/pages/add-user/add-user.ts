// src/app/pages/add-user/add-user.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';
import { passwordProblems } from '../../core/password.util';

@Component({
  selector: 'app-add-user',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-user.html',
  styleUrls: ['./add-user.css']
})
export class AddUserComponent implements OnInit {
  addUserForm!: FormGroup;
  success = '';
  error = '';
  currentCompanyId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.addUserForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['member', Validators.required]
    });

    this.auth.currentCompanyId$.subscribe(companyId => {
      this.currentCompanyId = companyId;
    });
  }

  async onSubmit() {
    this.error = '';
    this.success = '';

    if (!this.currentCompanyId) {
      this.error = 'Cannot determine your company. Are you logged in as admin?';
      return;
    }
    if (this.addUserForm.invalid) {
      this.error = 'Please fill in all fields with a valid email.';
      return;
    }

    const { name, email, password, role } = this.addUserForm.value;

    const missing = passwordProblems(password);
    if (missing.length) {
      this.error = 'Password needs ' + missing.join(', ') + '.';
      return;
    }

    try {
      const userCred = await this.auth.createUser(email, password);
      const uid = userCred.user.uid;

      await this.auth.addUserToCompany(uid, name, email, this.currentCompanyId, role);

      this.success = 'User added successfully!';
      this.addUserForm.reset({ role: 'member' });
    } catch (err: any) {
      this.error = this.friendlyError(err?.code);
    } finally {
      this.cdr.detectChanges();
    }
  }

  private friendlyError(code?: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'That email is already registered.';
      case 'auth/invalid-email':
        return 'That email address doesn’t look right.';
      case 'auth/weak-password':
        return 'That password is too weak. Please choose a stronger one.';
      case 'auth/network-request-failed':
        return 'Network problem. Check your internet connection.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}