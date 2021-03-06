// Angular
import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
// Services
import { SharedService } from './store/services';
// import { UsersService } from './users/shared/users.service';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState, AuthState, LoadingState } from './store/datatypes';
import { quotes } from './store/quotes';


import { OnDestroy, TakeUntilDestroy } from 'ngx-take-until-destroy';
import { TranslateService } from '@ngx-translate/core';
import { FinalLoading } from './store/actions';
import { REFFERAL_CODE_KEY } from './shared/config';
import { filter, takeUntil } from 'rxjs/operators';
import Timer = NodeJS.Timer;

@TakeUntilDestroy()
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  readonly destroyed$: Observable<boolean>;

  public hideFooter: boolean = false;
  public hideHeader: boolean = false;
  public windowIsResized: boolean = false;
  public resizeTimeout: Timer = null;
  public isLoading: boolean = true;
  public isMail: boolean = false;
  public isHomepage: boolean;
  quote: object;
  isAuthenticated: boolean;

  constructor(public router: Router,
              private sharedService: SharedService,
              private activatedRoute: ActivatedRoute,
              private store: Store<AppState>,
              private translate: TranslateService) {
    this.store.dispatch(new FinalLoading({ loadingState: true }));
    this.sharedService.hideHeader.subscribe(data => (this.hideHeader = data));
    this.sharedService.hideFooter.subscribe(data => (this.hideFooter = data));
    this.sharedService.isMail.subscribe(data => (this.isMail = data));

    // this language will be used as a fallback when a translation isn't found in the current language
    this.translate.setDefaultLang('en');
    setTimeout(() => {
      this.updateLoadingStatus();
      this.store.dispatch(new FinalLoading({ loadingState: false }));
    }, 2000);

    this.activatedRoute.queryParams.pipe(takeUntil(this.destroyed$))
      .subscribe((params: any) => {
        if (params && params.referral_code) {
          localStorage.setItem(REFFERAL_CODE_KEY, params.referral_code);
        }
      });

  }


  ngOnInit() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((routeEvent: NavigationEnd) => {
        this.isHomepage = routeEvent.url === '/';
        window.scrollTo(0, 0);
      });

    this.quote = quotes[Math.floor(Math.random() * 5)];

    this.store.select((state: AppState) => state.auth).pipe(takeUntil(this.destroyed$))
      .subscribe((authState: AuthState) => {
        this.isAuthenticated = authState.isAuthenticated;
      });
  }

  // Resize event for window object
  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.windowIsResized = true;
    if (this.resizeTimeout && this.windowIsResized) {
      // this.windowIsResized = true;
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(
      (() => {
        this.windowIsResized = false;
      }).bind(this),
      10
    );
  }

  private updateLoadingStatus(): void {
    this.store.select(state => state.loading).pipe(takeUntil(this.destroyed$))
      .subscribe((loadingState: LoadingState) => {
        this.isLoading = loadingState.Loading;
      });
  }

  ngOnDestroy(): void {
  }
}
