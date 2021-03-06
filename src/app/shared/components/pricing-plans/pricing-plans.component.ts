import { Component, Input, OnChanges, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Store } from '@ngrx/store';
import { ClearAuthErrorMessage, ClearSignUpState, FinalLoading, MembershipUpdate } from '../../../store/actions';
import { UpdateSignupData } from '../../../store/actions/auth.action';
import { PaymentMethod, PaymentType, PlanType } from '../../../store/datatypes';
import { SharedService } from '../../../store/services';
import { DEFAULT_CUSTOM_DOMAIN, DEFAULT_EMAIL_ADDRESS, DEFAULT_STORAGE } from '../../config';
import { DynamicScriptLoaderService } from '../../services/dynamic-script-loader.service';

@Component({
  selector: 'app-pricing-plans',
  templateUrl: './pricing-plans.component.html',
  styleUrls: ['./pricing-plans.component.scss']
})
export class PricingPlansComponent implements OnInit, OnChanges, OnDestroy {
  readonly defaultMonthlyPrice = 8;
  readonly championMonthlyPrice = 50;
  readonly championAnnualPricePerMonth = 37.5; // 25% discount on `championMonthlyPrice`
  readonly championAnnualPriceTotal = 450;
  readonly defaultStorage = DEFAULT_STORAGE;
  readonly defaultEmailAddress = DEFAULT_EMAIL_ADDRESS;
  readonly defaultCustomDomain = DEFAULT_CUSTOM_DOMAIN;
  readonly planType = PlanType;

  @Input() hideHeader: boolean;
  @Input() blockGapsZero: boolean; // Flag to add top and bottom gap conditionally
  @Input() showCurrentPlan: boolean;
  @Input() userPlanType: PlanType = PlanType.FREE;
  @Input() openBillingInfoInModal: boolean;
  @Input() selectedCurrency: string;
  @Input() paymentType: PaymentType;
  @Input() paymentMethod: PaymentMethod;
  @Input() selectedStorage: number = this.defaultStorage;
  @Input() selectedEmailAddress: number = this.defaultEmailAddress;
  @Input() selectedCustomDomain: number = this.defaultCustomDomain;

  @ViewChild('billingInfoModal') billingInfoModal;

  private billingInfoModalRef: NgbModalRef;

  selectedIndex: number = -1; // Assuming no element are selected initially
  selectedPlan: PlanType;
  availableStorage = [];
  availableEmailAddress = [];
  availableCustomDomain = [];
  monthlyPrice: number;
  annualPricePerMonth: number;
  annualPriceTotal: number;
  isValueChanged: boolean;

  constructor(private sharedService: SharedService,
              private store: Store<any>,
              private router: Router,
              private dynamicScriptLoader: DynamicScriptLoaderService,
              private modalService: NgbModal) {
  }

  ngOnInit() {
    this.sharedService.hideFooter.emit(true);
    for (let i = 6; i <= 50; i++) {
      this.availableStorage.push(i);
    }
    for (let i = 20; i <= 100; i += 10) {
      this.availableEmailAddress.push(i);
    }
    for (let i = 2; i <= 10; i++) {
      this.availableCustomDomain.push(i);
    }
    this.paymentType = this.paymentType || PaymentType.MONTHLY;
    this.paymentMethod = this.paymentMethod || PaymentMethod.STRIPE;
    this.selectedCurrency = this.selectedCurrency || 'USD';
    this.calculatePrices();
    this.store.dispatch(new FinalLoading({ loadingState: false }));
  }

  ngOnChanges(changes: any) {
    if (changes.selectedStorage || changes.selectedEmailAddress || changes.selectedCustomDomain) {
      this.selectedStorage = changes.selectedStorage && changes.selectedStorage.currentValue > 0 ?
        changes.selectedStorage.currentValue : this.selectedStorage || this.defaultStorage;
      this.selectedEmailAddress = changes.selectedEmailAddress && changes.selectedEmailAddress.currentValue > 0 ?
        changes.selectedEmailAddress.currentValue : this.selectedEmailAddress || this.defaultEmailAddress;
      this.selectedCustomDomain = changes.selectedCustomDomain && changes.selectedCustomDomain.currentValue > 0 ?
        changes.selectedCustomDomain.currentValue : this.selectedCustomDomain || this.defaultCustomDomain;
      this.calculatePrices();
    }
  }

  // == Toggle active state of the slide in price page
  toggleSlides(index) {
    this.selectedIndex = index;
    document.querySelector('.package-xs-tab > li').classList.remove('active');
    document
      .querySelector('.package-prime-col')
      .classList.remove('active-slide');
  }

  selectPlan(id) {
    this.store.dispatch(new MembershipUpdate({ id }));
    if (id === 1) {
      this.selectedPlan = PlanType.PRIME;
    } else if (id === 2) {
      this.selectedPlan = PlanType.CHAMPION;
    } else {
      this.selectedPlan = PlanType.FREE;
    }

    if (this.openBillingInfoInModal) {
      this.billingInfoModalRef = this.modalService.open(this.billingInfoModal, {
        centered: true,
        windowClass: 'modal-lg users-action-modal'
      });
    } else {
      this.store.dispatch(new ClearSignUpState());
      this.store.dispatch(new ClearAuthErrorMessage());
      if (id === 1) {
        this.store.dispatch(new UpdateSignupData({
          plan_type: PlanType.PRIME,
          payment_type: this.paymentType,
          payment_method: this.paymentMethod,
          currency: this.selectedCurrency,
          memory: this.selectedStorage,
          email_count: this.selectedEmailAddress,
          domain_count: this.selectedCustomDomain,
          monthlyPrice: this.monthlyPrice,
          annualPricePerMonth: this.annualPricePerMonth,
          annualPriceTotal: this.annualPriceTotal
        }));
      } else if (id === 2) {
        this.store.dispatch(new UpdateSignupData({
          plan_type: PlanType.CHAMPION,
          payment_type: this.paymentType,
          payment_method: this.paymentMethod,
          currency: this.selectedCurrency,
          monthlyPrice: this.championMonthlyPrice,
          annualPricePerMonth: this.championAnnualPricePerMonth,
          annualPriceTotal: this.championAnnualPriceTotal
        }));
      } else {
        this.selectedPlan = PlanType.FREE;
      }
      this.router.navigateByUrl('/create-account');
    }
  }

  changeCurrency(currency) {
    this.selectedCurrency = currency;
  }

  calculatePrices() {
    let monthlyPrice = this.defaultMonthlyPrice;
    monthlyPrice += (this.selectedStorage - this.defaultStorage);
    monthlyPrice += ((this.selectedEmailAddress - this.defaultEmailAddress) / 10);
    monthlyPrice += (this.selectedCustomDomain - this.defaultCustomDomain);
    this.monthlyPrice = monthlyPrice;
    this.annualPricePerMonth = +(this.monthlyPrice * 0.75).toFixed(2);
    this.annualPriceTotal = +(this.annualPricePerMonth * 12).toFixed(2);
  }

  ngOnDestroy() {
    this.sharedService.hideFooter.emit(false);
  }

}
