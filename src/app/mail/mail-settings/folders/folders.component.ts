import { Component, OnInit, ViewChild } from '@angular/core';
import { Folder } from '../../../store/models';
import { AppState, UserState } from '../../../store/datatypes';
import { Store } from '@ngrx/store';
import { OnDestroy, TakeUntilDestroy } from 'ngx-take-until-destroy';
import { Observable } from 'rxjs/Observable';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { DeleteFolder } from '../../../store/actions';
import { CreateFolderComponent } from '../../dialogs/create-folder/create-folder.component';
import { NotificationService } from '../../../store/services/notification.service';

@TakeUntilDestroy()
@Component({
  selector: 'app-folders',
  templateUrl: './folders.component.html',
  styleUrls: ['../mail-settings.component.scss', './folders.component.scss']
})
export class FoldersComponent implements OnInit, OnDestroy {
  readonly destroyed$: Observable<boolean>;
  folders: Array<Folder> = [];
  userState: UserState;
  @ViewChild('confirmationModal') confirmationModal;
  confirmModalRef: NgbModalRef;
  selectedFolder: Folder;

  constructor(private store: Store<AppState>,
              private modalService: NgbModal,
              private notificationService: NotificationService) { }

  ngOnInit() {
    this.store.select(state => state.user).takeUntil(this.destroyed$)
      .subscribe((user: UserState) => {
        this.userState = user;
        this.folders = user.customFolders;
      });
  }

  showConfirmationModal(folder: Folder) {
    this.confirmModalRef = this.modalService.open(this.confirmationModal, {
      centered: true,
      windowClass: 'modal-sm users-action-modal'
    });
    this.selectedFolder = folder;
  }

  /**
   * @description
   * Prime Users - Can create as many folders as they want
   * Free Users - Only allow a maximum of 3 folders per account
   */
  // == Open NgbModal
  addFolder() {
    if (this.userState.isPrime) {
      this.modalService.open(CreateFolderComponent, { centered: true, windowClass: 'modal-sm mailbox-modal' });
    } else if (this.userState.customFolders === null || this.userState.customFolders.length < 3) {
      this.modalService.open(CreateFolderComponent, { centered: true, windowClass: 'modal-sm mailbox-modal' });
    } else {
      this.notificationService.showSnackBar('Free users can only create a maximum of 3 folders.');
    }
  }


  deleteFolder() {
    this.store.dispatch(new DeleteFolder(this.selectedFolder));
    setTimeout(() => {
      this.confirmModalRef.dismiss();
    }, 1000);
  }


  ngOnDestroy(): void {
  }

}
