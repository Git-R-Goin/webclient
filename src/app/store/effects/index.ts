import { RouterEffects } from './router.effect';
import { AuthEffects } from './auth.effects';
import { BlogEffects } from './blog.effects';
import { MailEffects } from './mail.effects';
import { UsersEffects } from './users.effects';
import { TimezoneEffects } from './timezone.effects';
import { BitcoinEffects } from './bitcoin.effects';
import { MailboxEffects } from './mailbox.effects';
import { SharedEffects } from './shared.effects';

export const effects: any[] = [
  RouterEffects, AuthEffects, BlogEffects,
  MailEffects, UsersEffects, TimezoneEffects, BitcoinEffects,
  MailboxEffects, SharedEffects,
];

export * from './router.effect';
export * from './auth.effects';
export * from './blog.effects';
export * from './mail.effects';
export * from './users.effects';
export * from './timezone.effects';
export * from './bitcoin.effects';
export * from './mailbox.effects';
export * from './shared.effects';
