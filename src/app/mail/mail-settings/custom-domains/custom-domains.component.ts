import { Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbDropdownConfig, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
// Store
import { Store } from '@ngrx/store';
import { OnDestroy, TakeUntilDestroy } from 'ngx-take-until-destroy';
import { Observable } from 'rxjs';

import { CreateDomain, DeleteDomain, GetDomains, VerifyDomain } from '../../../store/actions';

import { AppState, AuthState, Domain, Settings, UserState } from '../../../store/datatypes';
import { SharedService } from '../../../store/services';
import { takeUntil } from 'rxjs/operators';

@TakeUntilDestroy()
@Component({
  selector: 'app-custom-domains',
  templateUrl: './custom-domains.component.html',
  styleUrls: ['./custom-domains.component.scss']
})
export class CustomDomainsComponent implements OnInit, OnDestroy {
  readonly destroyed$: Observable<boolean>;

  @Output() onGotoAddresses = new EventEmitter<any>();

  @ViewChild('confirmDeleteModal') confirmDeleteModal;

  userState: UserState;
  authState: AuthState;
  settings: Settings;
  domains: Domain[] = [];
  newDomain: Domain;
  newDomainError: string;

  isAddingNewDomain = false;
  currentStep: number = 0;
  domainNameForm: FormGroup;
  verifyForm: FormGroup;
  mxForm: FormGroup;
  spfForm: FormGroup;
  dkimForm: FormGroup;
  dmarcForm: FormGroup;
  isEditing: boolean;

  private confirmModalRef: NgbModalRef;

  constructor(
    config: NgbDropdownConfig,
    private modalService: NgbModal,
    private store: Store<AppState>,
    private formBuilder: FormBuilder,
    private sharedService: SharedService,
  ) {
    // customize default values of dropdowns used by this component tree
    config.autoClose = true; // ~'outside';
  }

  ngOnInit() {
    this.store.select(state => state.auth).pipe(takeUntil(this.destroyed$))
      .subscribe((authState: AuthState) => {
        this.authState = authState;
      });
    this.store.select(state => state.user).pipe(takeUntil(this.destroyed$))
      .subscribe((user: UserState) => {
        this.userState = user;
        if (!user.inProgress) {
          this.settings = user.settings;
          this.domains = user.customDomains;
          this.newDomain = user.newCustomDomain;
          this.newDomainError = user.newCustomDomainError;
          this.currentStep = user.currentCreationStep;
        }
      });

    this.domainNameForm = this.formBuilder.group({
      domainNameCtrl: ['', Validators.required]
    });

    this.verifyForm = this.formBuilder.group({});

    this.mxForm = this.formBuilder.group({});

    this.spfForm = this.formBuilder.group({});

    this.dkimForm = this.formBuilder.group({});

    this.dmarcForm = this.formBuilder.group({});
  }

  ngOnDestroy(): void {
  }

  startAddingNewDomain(domain: any = null) {
    this.newDomainError = null;
    if (domain) {
      this.currentStep = 1;
      this.isEditing = true;
      this.newDomain = domain;
      this.isAddingNewDomain = true;

    } else if (!this.userState.inProgress) {
      this.currentStep = 0;
      domain = {};
      this.newDomain = domain;
      this.isAddingNewDomain = true;
      this.isEditing = false;
    }
  }

  createDomain() {
    const domain = this.domainNameForm.value.domainNameCtrl;
    if (domain !== '') {
      this.store.dispatch(new CreateDomain(domain));
    }
  }

  copyToClipboard(text: string) {
    this.sharedService.copyToClipboard(text);
  }

  verifyDomain(id: number, gotoNextStep: boolean = false) {
    if (id !== null) {
      this.store.dispatch(new VerifyDomain({ id, gotoNextStep, currentStep: this.currentStep }));
    }
  }

  finishAddingNewDomain() {
    this.isAddingNewDomain = false;
    this.currentStep = 0;
    this.newDomain = null;
    this.domainNameForm.setValue({ domainNameCtrl: '' });
    this.store.dispatch(new GetDomains());
  }

  openConfirmDeleteModal(domain: Domain) {
    if (!this.userState.inProgress) {
      this.newDomain = domain;
      this.confirmModalRef = this.modalService.open(this.confirmDeleteModal, {
        centered: true,
        windowClass: 'modal-sm users-action-modal'
      });
    }
  }

  cancelDelete() {
    this.confirmModalRef.close();
  }

  deleteDomain() {
    this.confirmModalRef.close();
    this.store.dispatch(new DeleteDomain(this.newDomain.id));
  }

  gotoAddresses() {
    this.onGotoAddresses.emit();
  }
}
