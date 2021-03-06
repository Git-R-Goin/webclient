import { AfterViewInit, Component, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbDateStruct, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Store } from '@ngrx/store';
import { MatKeyboardComponent, MatKeyboardRef, MatKeyboardService } from 'ngx7-material-keyboard';
import { OnDestroy, TakeUntilDestroy } from 'ngx-take-until-destroy';
import * as Parchment from 'parchment';
import * as QuillNamespace from 'quill';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { COLORS, ESCAPE_KEYCODE, FONTS, VALID_EMAIL_REGEX } from '../../../shared/config';
import { FilenamePipe } from '../../../shared/pipes/filename.pipe';
import { FilesizePipe } from '../../../shared/pipes/filesize.pipe';
import {
  CloseMailbox,
  DeleteAttachment,
  GetUsersKeys,
  MoveMail,
  NewDraft,
  SnackErrorPush,
  SnackPush,
  UpdateLocalDraft,
  UploadAttachment
} from '../../../store/actions';
import { AppState, AuthState, ComposeMailState, Contact, Draft, MailBoxesState, MailState, UserState } from '../../../store/datatypes';
import { Attachment, Mail, Mailbox, MailFolderType } from '../../../store/models';
import { DateTimeUtilService } from '../../../store/services/datetime-util.service';
import { OpenPgpService } from '../../../store/services/openpgp.service';

const Quill: any = QuillNamespace;

const FontAttributor = Quill.import('attributors/style/font');
FontAttributor.whitelist = [...FONTS];
Quill.register(FontAttributor, true);

const SizeAttributor = Quill.import('attributors/style/size');
SizeAttributor.whitelist = ['10px', '18px', '32px'];
Quill.register(SizeAttributor, true);
Quill.register(Quill.import('attributors/style/align'), true);
Quill.register(Quill.import('attributors/style/background'), true);
Quill.register(Quill.import('attributors/style/color'), true);

const QuillBlockEmbed = Quill.import('blots/block/embed');

class BlockEmbed extends Parchment.default.Embed {
}

BlockEmbed.prototype = QuillBlockEmbed.prototype;

class ImageBlot extends BlockEmbed {
  static create(value) {
    const node: any = super.create(value);
    node.setAttribute('src', value.url);
    if (value.content_id) {
      node.setAttribute('data-content-id', value.content_id);
    }
    return node;
  }

  static value(node) {
    return {
      content_id: node.getAttribute('data-content-id'),
      url: node.getAttribute('src')
    };
  }
}

ImageBlot.blotName = 'image';
ImageBlot.tagName = 'img';

Quill.register(ImageBlot);

class SignatureBlot extends BlockEmbed {
  static create(value) {
    const node: any = super.create(value);
    value = value.replace(/<br>/g, '\n');
    node.innerText = value;
    return node;
  }

  static value(node) {
    return node.innerHTML;
  }
}

SignatureBlot.blotName = 'signature';
SignatureBlot.tagName = 'div';
SignatureBlot.className = 'ctemplar-signature';

Quill.register(SignatureBlot);

export class PasswordValidation {

  static MatchPassword(AC: AbstractControl) {
    const password = AC.get('password').value; // to get value in input tag
    const confirmPassword = AC.get('confirmPwd').value; // to get value in input tag
    if (password !== confirmPassword) {
      AC.get('confirmPwd').setErrors({ MatchPassword: true });
    } else {
      return null;
    }
  }
}

@TakeUntilDestroy()
@Component({
  selector: 'app-compose-mail',
  templateUrl: './compose-mail.component.html',
  styleUrls: ['./compose-mail.component.scss', './../mail-sidebar.component.scss']
})
export class ComposeMailComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() receivers: Array<string>;
  @Input() cc: Array<string>;
  @Input() content: string;
  @Input() messageHistory: string;
  @Input() subject: string;
  @Input() draftMail: Mail;
  @Input() selectedMailbox: Mailbox;
  @Input() parentId: number;
  @Input() showSaveButton: boolean = true;
  @Input() forwardAttachmentsMessageId: number;

  @Output() hide: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild('editor') editor;
  @ViewChild('toolbar') toolbar;
  @ViewChild('attachImagesModal') attachImagesModal;
  @ViewChild('selfDestructModal') selfDestructModal;
  @ViewChild('delayedDeliveryModal') delayedDeliveryModal;
  @ViewChild('deadManTimerModal') deadManTimerModal;
  @ViewChild('encryptionModal') encryptionModal;

  draftId: number;
  colors = COLORS;
  fonts = FONTS;
  mailData: any = {};
  options: any = {};
  selfDestruct: any = {};
  delayedDelivery: any = {};
  deadManTimer: any = {};
  attachments: Attachment[] = [];
  isKeyboardOpened: boolean;
  encryptForm: FormGroup;
  contacts: Contact[];
  datePickerMinDate: NgbDateStruct;
  valueChanged$: Subject<any> = new Subject<any>();
  inProgress: boolean;
  isLoaded: boolean;
  showEncryptFormErrors: boolean;
  isTrialPrimeFeaturesAvailable: boolean;
  mailBoxesState: MailBoxesState;
  isUploadingAttachment: boolean;

  private quill: any;
  private autoSaveSubscription: Subscription;
  private DEBOUNCE_DURATION: number = 5000; // duration in milliseconds
  private attachImagesModalRef: NgbModalRef;
  private selfDestructModalRef: NgbModalRef;
  private delayedDeliveryModalRef: NgbModalRef;
  private deadManTimerModalRef: NgbModalRef;
  private encryptionModalRef: NgbModalRef;
  private _keyboardRef: MatKeyboardRef<MatKeyboardComponent>;
  private defaultLocale: string = 'US International';

  readonly destroyed$: Observable<boolean>;
  private draft: Draft;
  private attachmentsQueue: Array<Attachment> = [];
  private inlineAttachmentContentIds: Array<string> = [];
  private isSignatureAdded: boolean;
  private isAuthenticated: boolean;
  public userState: UserState;
  private decryptedContent: string;
  private encryptionData: any = {};

  constructor(private modalService: NgbModal,
              private store: Store<AppState>,
              private formBuilder: FormBuilder,
              private openPgpService: OpenPgpService,
              private _keyboardService: MatKeyboardService,
              private dateTimeUtilService: DateTimeUtilService,
              private filesizePipe: FilesizePipe,
              private filenamePipe: FilenamePipe) {

  }

  ngOnInit() {
    this.encryptForm = this.formBuilder.group({
      'password': ['', [Validators.required]],
      'confirmPwd': ['', [Validators.required]],
      'passwordHint': ['']
    }, {
      validator: PasswordValidation.MatchPassword
    });

    this.initializeDraft();
    this.initializeAutoSave();
    this.resetMailData();

    this.store.select((state: AppState) => state.composeMail).pipe(takeUntil(this.destroyed$))
      .subscribe((response: ComposeMailState) => {
        const draft = response.drafts[this.draftId];
        if (draft) {
          this.draftMail = draft.draft;
          this.inProgress = draft.inProgress;
          if (draft.draft) {
            if (draft.draft.id && this.attachmentsQueue.length > 0) {
              this.attachmentsQueue.forEach(attachment => {
                attachment.message = draft.draft.id;
                this.store.dispatch(new UploadAttachment({ ...attachment }));
              });
              this.attachmentsQueue = [];
            }
          }
          if (!this.inProgress) {
            this.handleAttachment(draft);
          }
        }

        this.draft = draft;
      });

    this.store.select((state: AppState) => state.user).pipe(takeUntil(this.destroyed$))
      .subscribe((user: UserState) => {
        this.contacts = user.contact;
        this.isTrialPrimeFeaturesAvailable = this.dateTimeUtilService.getDiffToCurrentDateTime(user.joinedDate, 'days') < 14;
        this.userState = user;
      });

    this.store.select((state: AppState) => state.auth).pipe(takeUntil(this.destroyed$))
      .subscribe((authState: AuthState) => {
        this.isAuthenticated = authState.isAuthenticated;
      });

    this.store.select(state => state.mailboxes).pipe(takeUntil(this.destroyed$))
      .subscribe((mailBoxesState: MailBoxesState) => {
        if (!this.selectedMailbox) {
          if (this.draftMail && this.draftMail.mailbox) {
            this.selectedMailbox = mailBoxesState.mailboxes.find(mailbox => mailbox.id === this.draftMail.mailbox);
          } else if (mailBoxesState.currentMailbox) {
            this.selectedMailbox = mailBoxesState.currentMailbox;
            this.updateSignature();
          }
        }
        if (this.selectedMailbox && mailBoxesState.currentMailbox && this.selectedMailbox.id === mailBoxesState.currentMailbox.id) {
          this.selectedMailbox = mailBoxesState.currentMailbox;
          this.updateSignature();
        }
        this.mailBoxesState = mailBoxesState;
      });

    if (this.draftMail) {
      this.store.select(state => state.mail).pipe(takeUntil(this.destroyed$))
        .subscribe((mailState: MailState) => {
          if (!this.decryptedContent) {
            const decryptedContent = mailState.decryptedContents[this.draftMail.id];
            if (decryptedContent && !decryptedContent.inProgress && decryptedContent.content) {
              this.decryptedContent = decryptedContent.content;
              this.addDecryptedContent();
            }
          }
        });
    }

    const now = new Date();
    this.datePickerMinDate = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }

  ngAfterViewInit() {
    this.initializeQuillEditor();
  }

  ngOnDestroy(): void {
    if (this.isAuthenticated) {
      this.store.dispatch(new CloseMailbox(this.draft));
    }
  }

  initializeDraft() {
    this.draftId = Date.now();

    if (this.draftMail && this.draftMail.content) {
      this.openPgpService.decrypt(this.draftMail.mailbox, this.draftMail.id, this.draftMail.content);
      this.isSignatureAdded = true;
      this.inlineAttachmentContentIds = this.draftMail.attachments
        .filter((attachment: Attachment) => attachment.is_inline)
        .map(attachment => attachment.content_id);
    }

    this.encryptionData = {};
    if (this.draftMail && this.draftMail.encryption) {
      this.encryptionData.password = this.draftMail.encryption.password;
      this.encryptionData.password_hint = this.draftMail.encryption.password_hint;
    }

    const draft: Draft = {
      id: this.draftId,
      draft: this.draftMail,
      inProgress: false,
      attachments: this.draftMail ? this.draftMail.attachments.map(attachment => {
        attachment.progress = 100;
        attachment.name = this.filenamePipe.transform(attachment.document);
        attachment.draftId = this.draftId;
        attachment.attachmentId = performance.now();
        return attachment;
      }) : [],
      usersKeys: null
    };
    this.store.dispatch(new NewDraft({ ...draft }));
  }

  initializeQuillEditor() {
    this.quill = new Quill(this.editor.nativeElement, {
      modules: {
        toolbar: this.toolbar.nativeElement
      },
      clipboard: {
        matchVisual: false
      },
    });
    this.quill.clipboard.addMatcher(Node.TEXT_NODE, (node, delta) => {
      const regex = /https?:\/\/[^\s]+/g;
      if (typeof (node.data) !== 'string') {
        return;
      }
      const matches = node.data.match(regex);

      if (matches && matches.length > 0) {
        const ops = [];
        let str = node.data;
        matches.forEach((match) => {
          const split = str.split(match);
          const beforeLink = split.shift();
          ops.push({ insert: beforeLink });
          ops.push({ insert: match, attributes: { link: match } });
          str = split.join(match);
        });
        ops.push({ insert: str });
        delta.ops = ops;
      }
      return delta;
    });

    this.quill.format('font', this.userState.settings.default_font);
    this.quill.getModule('toolbar').addHandler('image', () => {
      this.quillImageHandler();
    });

    this.quill.on('text-change', (delta, oldDelta, source) => {
      this.valueChanged$.next();
    });

    if (this.content) {
      this.quill.clipboard.dangerouslyPasteHTML(0, this.content);
    }

    this.updateSignature();

    if (this.messageHistory) {
      const index = this.quill.getLength();
      this.quill.insertText(index, '\n', 'silent');
      this.quill.clipboard.dangerouslyPasteHTML(index + 1, this.messageHistory);
    }

    setTimeout(() => {
      this.quill.setSelection(0, 0, 'silent');
    }, 100);
  }

  initializeAutoSave() {
    this.autoSaveSubscription = this.valueChanged$
      .pipe(
        debounceTime(this.DEBOUNCE_DURATION)
      )
      .subscribe(data => {
        this.updateEmail();
      });
  }

  quillImageHandler() {
    this.attachImagesModalRef = this.modalService.open(this.attachImagesModal, {
      centered: true,
      windowClass: 'modal-sm users-action-modal'
    });
  }

  onFromChanged(mailbox: Mailbox) {
    this.selectedMailbox = mailbox;
    this.updateSignature();
    this.valueChanged$.next(this.selectedMailbox);
  }

  onImagesSelected(files: FileList) {
    if (!this.draftMail || !this.draftMail.id) {
      this.updateEmail();
    }
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (/^image\//.test(file.type)) {
        this.uploadAttachment(file, true);
      } else {
        // TODO: add error notification here
      }
    }
  }

  onFilesSelected(files: FileList) {
    if (!this.draftMail || !this.draftMail.id) {
      this.updateEmail();
    }
    for (let i = 0; i < files.length; i++) {
      const file: File = files.item(i);
      this.uploadAttachment(file, false);
    }
  }

  uploadAttachment(file: File, isInline = false) {
    const sizeInMBs = file.size / (1024 * 1024);

    if (this.userState.isPrime && sizeInMBs > 25) {
      this.store.dispatch(new SnackErrorPush({ message: 'Maximum allowed file size is 25MB.' }));
    } else if (!this.userState.isPrime && sizeInMBs > 5) {
      this.store.dispatch(new SnackErrorPush({ message: 'Maximum allowed file size is 5MB. Please upgrade your account to prime to send larger attachments.' }));
    } else {
      const attachment: Attachment = {
        draftId: this.draftId,
        document: file,
        name: file.name,
        size: this.filesizePipe.transform(file.size),
        attachmentId: performance.now(),
        message: this.draftMail.id,
        is_inline: isInline,
        inProgress: false
      };
      this.attachments.push(attachment);
      if (!this.draftMail.id) {
        this.attachmentsQueue.push(attachment);
      } else {
        this.store.dispatch(new UploadAttachment({ ...attachment }));
      }
    }
  }

  handleAttachment(draft: Draft) {
    // usage Object.assign to create new copy and avoid storing reference of draft.attachments
    this.attachments = Object.assign([], draft.attachments);
    this.isUploadingAttachment = false;
    this.attachments.forEach(attachment => {
      if (attachment.is_inline && attachment.progress === 100 && !attachment.isRemoved &&
        attachment.content_id && !this.inlineAttachmentContentIds.includes(attachment.content_id)) {
        this.inlineAttachmentContentIds.push(attachment.content_id);
        this.embedImageInQuill(attachment.document, attachment.content_id);
      }
      if (attachment.progress < 100 && !attachment.isRemoved) {
        this.isUploadingAttachment = true;
      }
    });
  }

  onAttachImageURL(url: string) {
    this.embedImageInQuill(url);
    this.attachImagesModalRef.dismiss();
  }

  saveInDrafts() {
    this.updateEmail();
    this.hide.emit();
    this.resetValues();
  }

  discardEmail() {
    if (this.draftMail && this.draftMail.id) {
      this.store.dispatch(new MoveMail({
        ids: this.draftMail.id,
        folder: MailFolderType.TRASH,
        sourceFolder: MailFolderType.DRAFT,
        mail: this.draftMail,
        allowUndo: true
      }));
    }
    this.hide.emit();
    this.resetValues();
  }

  sendEmail() {
    if (!this.selectedMailbox.is_enabled) {
      this.store.dispatch(new SnackPush({ message: 'Selected email address is disabled. Please select a different email address.' }));
      return;
    }
    if (this.userState.isPrime) {
      if (this.mailData.receiver.length > 20) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 20 "TO" addresses are allowed.' }));
        return;
      } else if (this.mailData.cc.length > 20) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 20 "CC" addresses are allowed.' }));
        return;
      } else if (this.mailData.bcc.length > 20) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 20 "BCC" addresses are allowed.' }));
        return;
      }
    } else {
      if (this.mailData.receiver.length > 20) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 20 "TO" addresses are allowed.' }));
        return;
      } else if (this.mailData.cc.length > 20) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 20 "CC" addresses are allowed.' }));
        return;
      } else if (this.mailData.bcc.length > 1) {
        this.store.dispatch(new SnackErrorPush({ message: 'Maximum 1 "BCC" address is allowed. Please upgrade your account to prime to add more addresses.' }));
        return;
      }
    }
    const receivers: string[] = [
      ...this.mailData.receiver.map(receiver => receiver.display),
      ...this.mailData.cc.map(cc => cc.display),
      ...this.mailData.bcc.map(bcc => bcc.display)
    ];
    if (receivers.length === 0) {
      this.store.dispatch(new SnackErrorPush({ message: 'Please enter receiver email.' }));
      return false;
    }
    const validEmailRegex = new RegExp(VALID_EMAIL_REGEX);
    const invalidAddress = receivers.find(receiver => !validEmailRegex.test(receiver));
    if (invalidAddress) {
      this.store.dispatch(new SnackErrorPush({ message: `"${invalidAddress}" is not valid email address.` }));
      return;
    }
    if (this.encryptionData.password) {
      this.openPgpService.generateEmailSshKeys(this.encryptionData.password, this.draftId);
    }
    this.setMailData(true, false);
    this.store.dispatch(new GetUsersKeys({ draftId: this.draftId, emails: receivers }));
    this.resetValues();
    this.hide.emit();
  }

  removeAttachment(attachment: Attachment) {
    this.store.dispatch(new DeleteAttachment(attachment));
  }

  updateSignature() {
    if (this.quill && this.selectedMailbox) {
      if (!this.isSignatureAdded) {
        const index = this.quill.getLength();
        this.quill.insertText(index, '\n', 'silent');
        this.quill.insertEmbed(index + 1, 'signature', this.selectedMailbox.signature || '', 'silent');
        this.isSignatureAdded = true;
      } else {
        const updatedContents = this.quill.getContents().map(op => {
          if (op.insert && op.insert.signature) {
            op.insert.signature = this.selectedMailbox.signature || '';
          }
          return op;
        });
        this.quill.setContents(updatedContents);
      }
    }
  }

  addDecryptedContent() {
    if (this.quill && this.decryptedContent) {
      this.quill.setText('');
      this.quill.clipboard.dangerouslyPasteHTML(0, this.decryptedContent, 'silent');
    }
  }

  openSelfDestructModal() {
    if (this.selfDestruct.value) {
      // reset to previous confirmed value
      this.selfDestruct = {
        ...this.selfDestruct,
        ...this.dateTimeUtilService.getNgbDateTimeStructsFromDateTimeStr(this.selfDestruct.value)
      };
    } else {
      this.resetSelfDestructValues();
    }
    this.selfDestructModalRef = this.modalService.open(this.selfDestructModal, {
      centered: true,
      windowClass: 'modal-sm users-action-modal'
    });
  }

  openDelayedDeliveryModal() {
    if (this.delayedDelivery.value) {
      // reset to previous confirmed value
      this.delayedDelivery = {
        ...this.delayedDelivery,
        ...this.dateTimeUtilService.getNgbDateTimeStructsFromDateTimeStr(this.delayedDelivery.value)
      };
    } else {
      this.resetDelayedDeliveryValues();
    }
    this.delayedDeliveryModalRef = this.modalService.open(this.delayedDeliveryModal, {
      centered: true,
      windowClass: 'modal-sm users-action-modal'
    });
  }

  openDeadManTimerModal() {
    if (!this.deadManTimer.value) {
      this.resetDeadManTimerValues();
    }
    this.deadManTimerModalRef = this.modalService.open(this.deadManTimerModal, {
      centered: true,
      windowClass: 'modal-sm users-action-modal'
    });
  }

  openEncryptionModal() {
    this.encryptForm.controls['password'].setValue(this.encryptionData.password || '');
    this.encryptForm.controls['passwordHint'].setValue(this.encryptionData.password_hint || '');
    this.encryptionModalRef = this.modalService.open(this.encryptionModal, {
      centered: true,
      windowClass: 'modal-md users-action-modal'
    });
  }

  closeEncryptionModal() {
    this.encryptionModalRef.dismiss();
  }

  toggleOSK() {
    if (this._keyboardService.isOpened) {
      this.closeOSK();
    } else {
      this._keyboardRef = this._keyboardService.open(this.defaultLocale, {});
      this.isKeyboardOpened = true;
    }
  }

  closeOSK() {
    if (this._keyboardRef) {
      this._keyboardRef.dismiss();
      this.isKeyboardOpened = false;
    }
  }

  setSelfDestructValue() {
    this.selfDestruct.error = null;
    if (this.selfDestruct.date && this.selfDestruct.time) {
      const dateTimeStr = this.dateTimeUtilService.createDateTimeStrFromNgbDateTimeStruct(this.selfDestruct.date,
        this.selfDestruct.time);
      if (this.dateTimeUtilService.isDateTimeInPast(dateTimeStr)) {
        this.selfDestruct.error = 'Selected datetime is in past.';
      } else {
        this.selfDestruct.value = dateTimeStr;
        this.closeSelfDestructModal();
        this.clearDelayedDeliveryValue();
        this.clearDeadManTimerValue();
        this.valueChanged$.next(this.selfDestruct.value);
      }
    }
  }

  clearSelfDestructValue() {
    this.resetSelfDestructValues();
    this.closeSelfDestructModal();
    this.valueChanged$.next(this.selfDestruct.value);
  }

  setDelayedDeliveryValue() {
    if (this.delayedDelivery.date && this.delayedDelivery.time) {
      const dateTimeStr = this.dateTimeUtilService.createDateTimeStrFromNgbDateTimeStruct(this.delayedDelivery.date,
        this.delayedDelivery.time);
      if (this.dateTimeUtilService.isDateTimeInPast(dateTimeStr)) {
        this.delayedDelivery.error = 'Selected datetime is in past.';
      } else {
        this.delayedDelivery.value = dateTimeStr;
        this.closeDelayedDeliveryModal();
        this.clearSelfDestructValue();
        this.clearDeadManTimerValue();
        this.valueChanged$.next(this.delayedDelivery.value);
      }
    }
  }

  clearDelayedDeliveryValue() {
    this.resetDelayedDeliveryValues();
    this.closeDelayedDeliveryModal();
    this.valueChanged$.next(this.delayedDelivery.value);
  }

  setDeadManTimerValue() {
    this.deadManTimer.days =
      !this.deadManTimer.days || isNaN(this.deadManTimer.days) || this.deadManTimer.days < 0 ? 0 : Math.floor(this.deadManTimer.days);
    this.deadManTimer.hours =
      !this.deadManTimer.hours || isNaN(this.deadManTimer.hours) || this.deadManTimer.hours < 0 ? 0 : Math.floor(this.deadManTimer.hours);
    this.deadManTimer.value = this.deadManTimer.days * 24 + this.deadManTimer.hours;
    this.closeDeadManTimerModal();
    if (this.deadManTimer.value) {
      this.clearSelfDestructValue();
      this.clearDelayedDeliveryValue();
    }
    this.valueChanged$.next(this.deadManTimer.value);
  }

  clearDeadManTimerValue() {
    this.resetDeadManTimerValues();
    this.closeDeadManTimerModal();
    this.valueChanged$.next(this.deadManTimer.value);
  }

  onSubmitEncryption() {
    this.showEncryptFormErrors = true;
    if (this.encryptForm.valid) {
      this.encryptionData = {
        password: this.encryptForm.controls['password'].value,
        passwordHint: this.encryptForm.controls['passwordHint'].value
      };
      this.valueChanged$.next(true);
      this.closeEncryptionModal();
    }
  }

  clearEncryption() {
    this.encryptForm.reset();
    this.encryptionData = {};
    this.valueChanged$.next(true);
    this.closeEncryptionModal();
  }

  hasData() {
    // using >1 because there is always a blank line represented by ‘\n’ (quill docs)
    return this.quill.getLength() > 1 ||
      this.mailData.receiver.length > 0 || this.mailData.cc.length > 0 || this.mailData.bcc.length > 0 || this.mailData.subject;
  }

  private embedImageInQuill(url: string, contentId?: string) {
    if (url) {
      const selection = this.quill.getSelection();
      const index = selection ? selection.index : this.quill.getLength();
      this.quill.insertEmbed(index, 'image', {
        url: url,
        content_id: contentId
      });
      this.quill.setSelection(index + 1);
    }
  }

  private updateEmail() {
    this.setMailData(false, true);
    this.openPgpService.encrypt(this.draftMail.mailbox, this.draftId, this.draftMail.content);
  }

  setMailData(shouldSend: boolean, shouldSave: boolean) {
    if (!this.draftMail) {
      this.draftMail = { content: null, folder: 'draft' };
    }
    this.draftMail.mailbox = this.selectedMailbox ? this.selectedMailbox.id : null;
    this.draftMail.sender = this.selectedMailbox.email;
    this.draftMail.receiver = this.mailData.receiver.map(receiver => receiver.display);
    this.draftMail.cc = this.mailData.cc.map(cc => cc.display);
    this.draftMail.bcc = this.mailData.bcc.map(bcc => bcc.display);
    this.draftMail.subject = this.mailData.subject;
    this.draftMail.destruct_date = this.selfDestruct.value || null;
    this.draftMail.delayed_delivery = this.delayedDelivery.value || null;
    this.draftMail.dead_man_duration = this.deadManTimer.value || null;
    this.draftMail.content = this.editor.nativeElement.firstChild.innerHTML;
    if (!shouldSave) {
      this.draftMail.content = this.draftMail.content.replace('class="ctemplar-signature"', '');
    }

    if (shouldSend) {
      this.draftMail.content = this.draftMail.content.replace(new RegExp('<p>', 'g'), '<div>');
      this.draftMail.content = this.draftMail.content.replace(new RegExp('</p>', 'g'), '</div>');
    }

    if (this.forwardAttachmentsMessageId) {
      this.draftMail.forward_attachments_of_message = this.forwardAttachmentsMessageId;
    }
    if (this.parentId) {
      this.draftMail.parent = this.parentId;
    }
    if (this.encryptionData.password) {
      this.draftMail.encryption = this.draftMail.encryption || {};
      this.draftMail.encryption.password = this.encryptForm.controls['password'].value || null;
      this.draftMail.encryption.password_hint = this.encryptForm.controls['passwordHint'].value || null;
    } else if (this.draftMail.encryption) {
      this.draftMail.encryption = {};
    }

    this.checkInlineAttachments();
    this.store.dispatch(new UpdateLocalDraft({ ...this.draft, shouldSave, shouldSend, draft: { ...this.draftMail } }));
  }

  checkInlineAttachments() {
    const contents = this.quill.getContents().ops;
    const currentAttachments = [];
    contents.forEach(item => {
      if (item.insert && item.insert.image && item.insert.image.content_id) {
        currentAttachments.push(item.insert.image.content_id);
      }
    });
    this.inlineAttachmentContentIds = this.inlineAttachmentContentIds.filter(contentId => {
      if (!currentAttachments.includes(contentId)) {
        const attachmentToRemove = this.attachments.find(attachment => attachment.content_id === contentId);
        if (attachmentToRemove) {
          this.removeAttachment(attachmentToRemove);
        }
        return false;
      } else {
        return true;
      }
    });
  }

  private resetValues() {
    this.unSubscribeAutoSave();
    this.options = {};
    this.attachments = [];
    this.quill.setText('');
    this.resetMailData();
    this.clearSelfDestructValue();
    this.clearDelayedDeliveryValue();
    this.clearDeadManTimerValue();
  }

  private closeSelfDestructModal() {
    if (this.selfDestructModalRef) {
      this.selfDestructModalRef.dismiss();
    }
  }

  private closeDelayedDeliveryModal() {
    if (this.delayedDeliveryModalRef) {
      this.delayedDeliveryModalRef.dismiss();
    }
  }

  private closeDeadManTimerModal() {
    if (this.deadManTimerModalRef) {
      this.deadManTimerModalRef.dismiss();
    }
  }

  private unSubscribeAutoSave() {
    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
  }

  private resetMailData() {
    this.resetSelfDestructValues();
    this.resetDelayedDeliveryValues();
    this.resetDeadManTimerValues();
    this.mailData = {
      receiver: this.receivers ?
        this.receivers.map(receiver => ({ display: receiver, value: receiver })) :
        this.draftMail ?
          this.draftMail.receiver.map(receiver => ({ display: receiver, value: receiver })) :
          [],
      cc: this.cc ? this.cc.map(address => ({ display: address, value: address })) :
        this.draftMail ?
          this.draftMail.cc.map(receiver => ({ display: receiver, value: receiver })) :
          [],
      bcc: this.draftMail ? this.draftMail.bcc.map(receiver => ({ display: receiver, value: receiver })) : [],
      subject: this.subject ? this.subject : this.draftMail ? this.draftMail.subject : ''
    };
    if (this.mailData.cc.length > 0) {
      this.options.isCcVisible = true;
    }
    if (this.mailData.bcc.length > 0) {
      this.options.isBccVisible = true;
    }
    this.selfDestruct.value = this.draftMail ? this.draftMail.destruct_date : null;
    this.deadManTimer.value = this.draftMail ? this.draftMail.dead_man_duration : null;
    this.delayedDelivery.value = this.draftMail ? this.draftMail.delayed_delivery : null;
    this.isLoaded = true;
  }

  private resetSelfDestructValues() {
    this.selfDestruct.value = null;
    this.selfDestruct.date = null;
    this.selfDestruct.time = {
      hour: 0,
      minute: 0,
      second: 0
    };
    this.selfDestruct.meridian = true;
    this.selfDestruct.error = null;
  }

  private resetDelayedDeliveryValues() {
    this.delayedDelivery.value = null;
    this.delayedDelivery.date = null;
    this.delayedDelivery.time = {
      hour: 0,
      minute: 0,
      second: 0
    };
    this.delayedDelivery.meridian = true;
    this.delayedDelivery.error = null;
  }

  private resetDeadManTimerValues() {
    this.deadManTimer.value = null;
    this.deadManTimer.days = 0;
    this.deadManTimer.hours = 0;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (event.keyCode === ESCAPE_KEYCODE) {
      this.closeOSK();
    }
  }

  onFilesDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this.onFilesSelected(event.dataTransfer.files);
  }
}
