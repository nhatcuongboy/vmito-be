import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<true>();

/**
 * Runs [work] without per-rental notifications. A series acts on up to twelve
 * rentals at once and sends one message itself, instead of twelve pushes.
 */
export const withoutRentalNotifications = <T>(work: () => Promise<T>) =>
  scope.run(true, work);

export const areRentalNotificationsMuted = () => scope.getStore() === true;
