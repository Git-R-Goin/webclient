// Angular
import { Injectable } from '@angular/core';
// Ngrx
import { Actions, Effect, ofType } from '@ngrx/effects';
// Rxjs
import { Observable } from 'rxjs';


import { catchError, map, switchMap } from 'rxjs/operators';
// Services
import { MailService } from '../../store/services';
// Custom Actions
import {
  CreateMailbox,
  CreateMailboxFailure,
  CreateMailboxSuccess,
  GetMailboxes,
  GetMailboxesSuccess,
  MailActionTypes,
  SetDefaultMailbox,
  SetDefaultMailboxSuccess,
  UpdateMailboxOrder,
  UpdateMailboxOrderSuccess
} from '../actions';
import { Mailbox } from '../models';
import { MailboxSettingsUpdate, MailboxSettingsUpdateSuccess } from '../actions/mail.actions';
import { SnackErrorPush } from '../actions/users.action';
import { EMPTY } from 'rxjs/internal/observable/empty';
import { of } from 'rxjs/internal/observable/of';


@Injectable()
export class MailboxEffects {

  constructor(private actions: Actions,
              private mailService: MailService) {}

  @Effect()
  getMailboxesEffect: Observable<any> = this.actions.pipe(
    ofType(MailActionTypes.GET_MAILBOXES),
    map((action: GetMailboxes) => action.payload),
    switchMap(payload => {
      return this.mailService.getMailboxes(payload.limit, payload.offset)
        .pipe(
          switchMap((mails) => of(new GetMailboxesSuccess(mails))),
          catchError((error) => EMPTY)
        );
    }));

  @Effect()
  mailboxSettingsUpdate: Observable<any> = this.actions.pipe(
    ofType(MailActionTypes.MAILBOX_SETTINGS_UPDATE),
    map((action: MailboxSettingsUpdate) => action.payload),
    switchMap((payload: Mailbox) => {
      return this.mailService.updateMailBoxSettings(payload)
        .pipe(
          switchMap(res => of(new MailboxSettingsUpdateSuccess(res))),
          catchError(err => of(new SnackErrorPush({ message: 'Failed to update email address settings.' }))),
        );
    }));

  @Effect()
  createMailbox: Observable<any> = this.actions.pipe(
    ofType(MailActionTypes.CREATE_MAILBOX),
    map((action: CreateMailbox) => action.payload),
    switchMap((payload: any) => {
      return this.mailService.createMailbox(payload)
        .pipe(
          switchMap(res => of(new CreateMailboxSuccess(res))),
          catchError(err => of(
            new CreateMailboxFailure(err.error),
            new SnackErrorPush({ message: 'Failed to create new email address.' })
          )),
        );
    }));

  @Effect()
  setDefaultMailbox: Observable<any> = this.actions.pipe(
    ofType(MailActionTypes.SET_DEFAULT_MAILBOX),
    map((action: SetDefaultMailbox) => action.payload),
    switchMap((payload: Mailbox) => {
      return this.mailService.updateMailBoxSettings({ ...payload, is_default: true })
        .pipe(
          switchMap(res => of(new SetDefaultMailboxSuccess(res))),
          catchError(err => of(
            new SnackErrorPush({ message: 'Failed to set email address as default.' })
          )),
        );
    }));


  @Effect()
  updateMailboxOrder: Observable<any> = this.actions.pipe(
    ofType(MailActionTypes.UPDATE_MAILBOX_ORDER),
    map((action: UpdateMailboxOrder) => action.payload),
    switchMap((payload: any) => {
      return this.mailService.updateMailboxOrder(payload.data)
        .pipe(
          switchMap(res => of(
            new SnackErrorPush({ message: 'Sort order saved successfully.' }),
            new UpdateMailboxOrderSuccess({ mailboxes: payload.mailboxes }))),
          catchError(err => of(new SnackErrorPush({ message: 'Failed to update emails sort order.' }))),
        );
    }));

}
