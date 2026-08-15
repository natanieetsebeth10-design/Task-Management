import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TasksByDatePipe } from './tasks-by-date.pipe';

describe('TasksByDatePipe', () => {
  let component: TasksByDatePipe;
  let fixture: ComponentFixture<TasksByDatePipe>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksByDatePipe]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksByDatePipe);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
