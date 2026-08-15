import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserPerformance } from './user-performance';

describe('UserPerformance', () => {
  let component: UserPerformance;
  let fixture: ComponentFixture<UserPerformance>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserPerformance]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserPerformance);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
