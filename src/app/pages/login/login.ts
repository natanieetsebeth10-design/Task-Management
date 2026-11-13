// src/app/pages/login/login.ts
import { Component, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';

type Mode = 'login' | 'reset';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  info = '';
  showPassword = false;
  busy = false;
  mode: Mode = 'login';

  wrongPassword = false;       // true after a failed login, until the user edits a field
  failedAttempts = 0;

  @ViewChild('pwd') pwdInput?: ElementRef<HTMLInputElement>;

  // Rules (8+ characters, 1 capital, 1 symbol) are shown as a checklist, but they no longer
  // block logging in. A wrong password then gets Firebase's real answer, and older accounts
  // with weaker passwords can still log in. Set to true to block weak passwords at login.
  private readonly ENFORCE_RULES_ON_LOGIN = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  // ---- password rules: 8+ characters, 1 capital, 1 symbol ----
  get hasLength()  { return this.password.length >= 8; }
  get hasCapital() { return /[A-Z]/.test(this.password); }
  get hasSymbol()  { return /[^A-Za-z0-9\s]/.test(this.password); }
  get passwordValid() { return this.hasLength && this.hasCapital && this.hasSymbol; }

  // After two failed tries, offer the reset link right under the error
  get showResetNudge() { return this.failedAttempts >= 2; }

  // Called when the user edits either field: clear the red error state
  onInput() {
    this.error = '';
    this.wrongPassword = false;
  }

  async login() {
    if (this.busy) return;
    this.error = '';
    this.info = '';
    this.wrongPassword = false;

    if (!this.email.trim() || !this.password) {
      this.error = 'Please enter your email and password.';
      return;
    }
    if (this.ENFORCE_RULES_ON_LOGIN && !this.passwordValid) {
      this.error = 'Password must be at least 8 characters and include 1 capital letter and 1 symbol.';
      return;
    }

    this.busy = true;
    try {
      await this.auth.login(this.email.trim(), this.password);
      this.failedAttempts = 0;
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.failedAttempts++;
      this.error = this.friendlyError(err);

      // Wrong password / wrong email: clear the password box, mark it red and put the cursor back
      const credentialError = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']
        .includes(err?.code);
      if (credentialError) {
        this.wrongPassword = true;
        this.password = '';
        setTimeout(() => this.pwdInput?.nativeElement.focus(), 0);
      }
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async sendReset() {
    if (this.busy) return;
    this.error = '';
    this.info = '';

    const email = this.email.trim();
    if (!email) {
      this.error = 'Enter your email address first.';
      return;
    }

    this.busy = true;
    try {
      await this.auth.resetPassword(email);
    } catch (err: any) {
      // Don't reveal whether the email has an account.
      if (err?.code === 'auth/invalid-email') {
        this.error = 'That doesn’t look like a valid email address.';
        this.busy = false;
        this.cdr.markForCheck();
        return;
      }
    }
    this.info = 'If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.';
    this.busy = false;
    this.cdr.markForCheck();
  }

  openReset() {
    this.mode = 'reset';
    this.error = '';
    this.info = '';
    this.wrongPassword = false;
  }

  backToLogin() {
    this.mode = 'login';
    this.error = '';
    this.info = '';
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  // Back to the landing page. Change '/' if your landing route is different.
  goHome() {
    this.router.navigate(['/']);
  }

  private friendlyError(err: any): string {
    switch (err?.code) {
      case 'auth/wrong-password':
        return 'Wrong password. Please try again.';
      case 'auth/invalid-credential':
        // Firebase uses this one code for both a wrong password and an unknown email
        return 'Incorrect email or password. Please check them and try again.';
      case 'auth/user-not-found':
        return 'No account was found with that email.';
      case 'auth/invalid-email':
        return 'That doesn’t look like a valid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact your admin.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Wait a few minutes, or reset your password.';
      case 'auth/network-request-failed':
        return 'Network problem. Check your connection and try again.';
      default:
        return 'Could not log in. Please try again.';
    }
  }
}