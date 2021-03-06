// Angular
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
// Helpers
import { apiUrl } from '../../shared/config';
// Models
import { Attachment, Folder, Mail, Mailbox } from '../models';
// Rxjs
import { Observable, of } from 'rxjs';
import { MailFolderType } from '../models/mail.model';
import { map } from 'rxjs/operators';

@Injectable()
export class MailService {

  constructor(private http: HttpClient) {}

  getMessages(
    payload: {
      limit: number, offset: number, folder: MailFolderType,
      read: null, seconds?: number, searchText?: string
    }): Observable<any> {
    payload.limit = payload.limit ? payload.limit : 20;
    if (payload.searchText && payload.folder === MailFolderType.SEARCH) {
      return this.searchMessages(payload);
    }
    let url = `${apiUrl}emails/messages/?limit=${payload.limit}&offset=${payload.offset}`;
    if (!payload.folder) {
      payload.folder = MailFolderType.INBOX;
    }
    if (payload.folder === MailFolderType.STARRED) {
      url = `${url}&starred=true`;
    } else {
      url = `${url}&folder=${payload.folder}`;
    }
    if (payload.read === false || payload.read === true) {
      url = `${url}&read=${payload.read}`;
    }
    if (payload.seconds) {
      url = `${url}&seconds=${payload.seconds}`;
    }
    return this.http.get<Mail[]>(url);
  }

  searchMessages(payload: any): Observable<any> {
    const url = `${apiUrl}search/messages/?q=${payload.searchText}&limit=${payload.limit}&offset=${payload.offset}`;
    return this.http.get<Mail[]>(url);
  }

  getMessage(payload: {messageId: number, folder: string}): Observable<Mail> {
    const url = `${apiUrl}emails/messages/?id__in=${payload.messageId}&folder=${payload.folder}`;
    return this.http.get<Mail>(url).pipe(map(data => {
      return data['results'] ? data['results'][0] : null;
    }));
  }

  getUnreadMailsCount(): Observable<any> {
    return this.http.get<Mail>(`${apiUrl}emails/unread/`);
  }

  getMailboxes(limit: number = 50, offset: number = 0): Observable<any> {
    const url = `${apiUrl}emails/mailboxes/?limit=${limit}&offset=${offset}`;
    return this.http.get<any>(url).pipe(map(data => {
      const newData = data['results'].map(mailbox => {
        mailbox.customFolders = mailbox.custom_folders;
        return mailbox;
      });
      return newData;
    }));
  }

  getUsersPublicKeys(emails: Array<string>): Observable<any> {
    const body = { emails };
    return this.http.post<any>(`${apiUrl}emails/keys/`, body);
  }

  getSecureMessage(hash: string, secret: string): Observable<any> {
    const url = `${apiUrl}emails/secure-message/${hash}/${secret}/`;
    return this.http.get<any>(url);
  }

  getSecureMessageKeys(hash: string, secret: string): Observable<any> {
    const url = `${apiUrl}emails/secure-message/${hash}/${secret}/keys/`;
    return this.http.get<any>(url);
  }

  createFolder(folder: Folder): Observable<any> {
    if (folder.id) {
      return this.http.patch<any>(`${apiUrl}emails/custom-folder/${folder.id}/`, folder);
    }
    return this.http.post<any>(`${apiUrl}emails/custom-folder/`, folder);
  }

  updateFoldersOrder(data: any) {
    return this.http.post<any>(`${apiUrl}emails/folder-order/`, data);
  }

  createMail(data: any): Observable<any[]> {
    let url = `${apiUrl}emails/messages/`;
    if (data.id) {
      url = url + data.id + '/';
      return this.http.patch<any>(url, data);
    }
    return this.http.post<any>(url, data);
  }

  secureReply(hash: string, secret: string, data: any): Observable<any> {
    const url = `${apiUrl}emails/secure-message/${hash}/${secret}/reply/`;
    return this.http.post<any>(url, data);
  }

  markAsRead(ids: string, isMailRead: boolean): Observable<any[]> {
    return this.http.patch<any>(`${apiUrl}emails/messages/?id__in=${ids}`, { read: isMailRead });
  }

  markAsStarred(ids: string, isMailStarred: boolean): Observable<any[]> {
    return this.http.patch<any>(`${apiUrl}emails/messages/?id__in=${ids}`, { starred: isMailStarred });
  }

  moveMail(ids: string, folder: string): Observable<any[]> {
    return this.http.patch<any>(`${apiUrl}emails/messages/?id__in=${ids}`, { folder: folder });
  }

  deleteMails(ids: string): Observable<any[]> {
    return this.http.delete<any>(`${apiUrl}emails/messages/?id__in=${ids}`);
  }

  deleteFolder(id: string): Observable<any[]> {
    return this.http.delete<any>(`${apiUrl}emails/custom-folder/${id}/`);
  }

  uploadFile(data: Attachment): Observable<HttpEvent<any>> {
    const formData = new FormData();
    formData.append('document', data.document);
    formData.append('message', data.message.toString());
    formData.append('is_inline', data.is_inline.toString());

    const request = new HttpRequest('POST', `${apiUrl}emails/attachments/create/`, formData, {
      reportProgress: true
    });

    return this.http.request(request);
  }

  deleteAttachment(attachment: Attachment): Observable<any> {
    return this.http.delete<any>(`${apiUrl}emails/attachments/${attachment.id}/`);
  }

  updateMailBoxSettings(data: Mailbox) {
    return this.http.patch<any>(`${apiUrl}emails/mailboxes/${data.id}/`, data);
  }

  createMailbox(data: any) {
    return this.http.post<any>(`${apiUrl}emails/mailboxes/`, data);
  }

  updateMailboxOrder(data: any) {
    return this.http.post<any>(`${apiUrl}emails/mailbox-order/`, data);
  }

  emptyTrash() {
    return this.http.post<any>(`${apiUrl}emails/empty-trash/`, null);
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {

      // TODO: send the error to remote logging infrastructure
      console.error(error); // log to console instead

      // Let the app keep running by returning an empty result.
      return of(result as T);
    };
  }
}
