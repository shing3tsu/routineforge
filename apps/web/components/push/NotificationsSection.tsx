/**
 * NotificationsSection — client island powering the "Notifications" block on
 * the account page.
 *
 * Renders inside the existing `.section` card from `account/page.module.css`.
 * Owns:
 *
 *   - The master "enable notifications on this device" toggle.
 *   - The recovery hint when `Notification.permission === 'denied'`.
 *   - The disabled state when the browser doesn't support push.
 *   - The "Devices" list (subscriptions for this user).
 *
 * Three failure modes (per the dispatch spec):
 *
 *   1. Browser doesn't support push -> disabled toggle + explanation row.
 *   2. Permission denied -> recovery hint with browser-settings copy.
 *   3. Subscribe fails (incl. 503 push_not_configured) -> Alert banner.
 *
 * Why client-only: we need `Notification.permission`, `navigator.serviceWorker`,
 * and `pushManager` — all browser-globals. The initial subscriptions list is
 * also fetched client-side so we can match the current device's endpoint
 * against the server-known list (the list endpoint deliberately doesn't return
 * endpoints, which are secrets — see `apps/web/lib/push/queries.ts`).
 */
'use client';

import * as React from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  getCurrentSubscription,
  getNotificationPermission,
  isPushSupported,
  requestNotificationPermission,
  subscribe,
  unsubscribe,
} from '@/lib/push/client';
import { formatRelative, formatUserAgent } from './formatUserAgent';
import styles from './NotificationsSection.module.css';

type DeviceSummary = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

type Banner = { variant: 'success' | 'danger' | 'info'; message: string };

type Support =
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'prompt'; subscribed: boolean }
  | { kind: 'granted'; subscribed: boolean };

/**
 * Compose the high-level state from the three browser-globals (support,
 * permission, current subscription). Pure helper for testability.
 */
function deriveSupport(
  supported: boolean,
  permission: NotificationPermission | 'unsupported',
  hasSub: boolean,
): Support {
  if (!supported || permission === 'unsupported') return { kind: 'unsupported' };
  if (permission === 'denied') return { kind: 'denied' };
  if (permission === 'granted') return { kind: 'granted', subscribed: hasSub };
  return { kind: 'prompt', subscribed: hasSub };
}

export function NotificationsSection() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [supported, setSupported] = React.useState<boolean>(false);
  const [permission, setPermission] = React.useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [currentEndpoint, setCurrentEndpoint] = React.useState<string | null>(
    null,
  );
  const [devices, setDevices] = React.useState<DeviceSummary[]>([]);
  const [devicesLoading, setDevicesLoading] = React.useState<boolean>(true);
  const [banner, setBanner] = React.useState<Banner | null>(null);
  const [pending, setPending] = React.useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Bootstrap on mount
  // -------------------------------------------------------------------------
  const refreshLocalState = React.useCallback(async () => {
    setSupported(isPushSupported());
    setPermission(getNotificationPermission());
    try {
      const sub = await getCurrentSubscription();
      setCurrentEndpoint(sub?.endpoint ?? null);
    } catch {
      setCurrentEndpoint(null);
    }
  }, []);

  const refreshDevices = React.useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch('/api/push/subscriptions', { cache: 'no-store' });
      if (!res.ok) {
        setDevices([]);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; subscriptions?: DeviceSummary[] }
        | null;
      setDevices(data?.subscriptions ?? []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshLocalState();
    void refreshDevices();
  }, [refreshLocalState, refreshDevices]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const onEnable = async () => {
    setBanner(null);
    setPending(true);
    try {
      // Prompt the OS dialog if the user hasn't decided yet. If they've
      // already granted, this is a fast no-op.
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm === 'denied') {
        setBanner({
          variant: 'danger',
          message:
            'Notifications are blocked. Open this site’s settings in your browser to re-enable them.',
        });
        return;
      }
      if (perm !== 'granted') {
        // User dismissed the prompt without choosing.
        setBanner({
          variant: 'info',
          message: 'Permission prompt dismissed. Try again when you’re ready.',
        });
        return;
      }
      const { endpoint } = await subscribe();
      setCurrentEndpoint(endpoint);
      setBanner({
        variant: 'success',
        message: 'Notifications enabled on this device.',
      });
      // Refresh the devices list so the new row appears (and the "this device"
      // badge attaches correctly).
      await refreshDevices();
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'push_not_configured') {
        setBanner({
          variant: 'danger',
          message:
            'Push notifications aren’t set up on this server yet. Ask the admin to configure VAPID keys.',
        });
      } else {
        setBanner({
          variant: 'danger',
          message: err.message ?? 'Could not enable notifications.',
        });
      }
    } finally {
      setPending(false);
    }
  };

  const onDisable = async () => {
    setBanner(null);
    setPending(true);
    try {
      await unsubscribe();
      setCurrentEndpoint(null);
      setBanner({
        variant: 'success',
        message: 'Notifications disabled on this device.',
      });
      await refreshDevices();
    } catch (e) {
      setBanner({
        variant: 'danger',
        message:
          e instanceof Error ? e.message : 'Could not disable notifications.',
      });
    } finally {
      setPending(false);
    }
  };

  /**
   * Remove a device from the server-side list. Only possible for THIS device
   * (where we know the endpoint) — see the "remove-other-device" note in the
   * frontend dispatch log.
   */
  const onRemoveDevice = async (device: DeviceSummary) => {
    if (!currentEndpoint) {
      // Defensive: button should be disabled, but if a stale handler fires
      // without an endpoint, fail loud.
      setBanner({
        variant: 'danger',
        message:
          'Only the current device can be removed. Sign in on that device to remove it.',
      });
      return;
    }
    setBanner(null);
    setPending(true);
    try {
      await unsubscribe();
      setCurrentEndpoint(null);
      setBanner({
        variant: 'success',
        message: 'Device removed.',
      });
      await refreshDevices();
    } catch (e) {
      setBanner({
        variant: 'danger',
        message:
          e instanceof Error ? e.message : 'Could not remove device.',
      });
    } finally {
      setPending(false);
      // suppress unused-var lint until the per-id delete is wired:
      void device;
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const state = deriveSupport(supported, permission, currentEndpoint !== null);
  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : null;

  // Pre-compute the "this device" id (by matching the current endpoint to the
  // server's view of the subscription's lastSeenAt — we don't have endpoints
  // server-side. The cleanest signal we DO have is: there is exactly one
  // subscription whose `id` corresponds to the current endpoint, but we can't
  // identify it from this side. Use a heuristic: when the user just enabled
  // notifications, the device whose `lastSeenAt` is most recent is almost
  // certainly THIS device. This isn't bulletproof but is the best we can do
  // without the endpoint round-tripping.
  const thisDeviceId = React.useMemo(() => {
    if (!currentEndpoint || devices.length === 0) return null;
    // Sort by lastSeenAt desc and take the most recent.
    const sorted = [...devices].sort(
      (a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
    return sorted[0]?.id ?? null;
  }, [currentEndpoint, devices]);

  return (
    <div className={styles.wrap}>
      {/* ---- Master toggle row ---- */}
      <div className={styles.row}>
        <div className={styles.rowBody}>
          <div className={styles.rowTitle}>
            Enable notifications on this device
          </div>
          <div className={styles.rowDesc}>
            {state.kind === 'unsupported'
              ? 'This browser doesn’t support web push notifications.'
              : state.kind === 'denied'
                ? 'Notifications are blocked in your browser settings.'
                : state.kind === 'granted' && state.subscribed
                  ? `Active on this device: ${formatUserAgent(userAgent)}.`
                  : 'Get reminded at the times you pick on each routine and habit.'}
          </div>
        </div>

        {/* Switch — visual + ARIA. We render a <button> with switch role
            rather than a checkbox so the click handler can run our async
            subscribe / unsubscribe flow without coordinating with form
            semantics. */}
        <button
          type="button"
          role="switch"
          aria-checked={state.kind === 'granted' && state.subscribed}
          aria-disabled={
            state.kind === 'unsupported' || state.kind === 'denied' || pending
          }
          aria-label="Enable notifications on this device"
          className={styles.switch}
          disabled={
            state.kind === 'unsupported' || state.kind === 'denied' || pending
          }
          onClick={() => {
            if (state.kind === 'granted' && state.subscribed) {
              void onDisable();
            } else {
              void onEnable();
            }
          }}
        />
      </div>

      {/* ---- Recovery / status row(s) ---- */}
      {state.kind === 'denied' ? (
        <div className={styles.alertWrap}>
          <Alert variant="warning" title="Notifications are blocked">
            Open this site&rsquo;s settings in your browser (the padlock icon
            in the address bar on most browsers) and switch notifications back
            on, then return here.
          </Alert>
        </div>
      ) : null}

      {state.kind === 'unsupported' ? (
        <div className={styles.alertWrap}>
          <Alert variant="info" title="Push isn’t available here">
            Try a recent version of Chrome, Edge, Firefox, or Safari (iOS 16.4
            and up).
          </Alert>
        </div>
      ) : null}

      {banner ? (
        <div className={styles.alertWrap}>
          <Alert variant={banner.variant} onDismiss={() => setBanner(null)}>
            {banner.message}
          </Alert>
        </div>
      ) : null}

      {state.kind === 'granted' && state.subscribed ? (
        <div className={styles.row}>
          <div className={styles.rowBody}>
            <div className={styles.rowTitle}>Active on this device</div>
            <div className={styles.rowDesc}>
              {formatUserAgent(userAgent)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onDisable()}
            loading={pending}
          >
            Disable on this device
          </Button>
        </div>
      ) : null}

      {/* ---- Devices list ---- */}
      <div className={styles.devicesHeader}>Devices</div>
      {devicesLoading ? (
        <div className={styles.emptyDevices}>Loading devices&hellip;</div>
      ) : devices.length === 0 ? (
        <div className={styles.emptyDevices}>
          No devices subscribed yet. Enable notifications above.
        </div>
      ) : (
        devices.map((d) => {
          const isThisDevice = d.id === thisDeviceId;
          return (
            <div key={d.id} className={styles.row}>
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>
                  {formatUserAgent(d.userAgent)}
                  {isThisDevice ? (
                    <span className={styles.thisDeviceBadge}>This device</span>
                  ) : null}
                </div>
                <div className={styles.rowDesc}>
                  Added {formatRelative(d.createdAt)} &middot; Last seen{' '}
                  {formatRelative(d.lastSeenAt)}
                </div>
              </div>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                disabled={!isThisDevice || pending}
                title={
                  isThisDevice
                    ? 'Disable notifications on this device.'
                    : 'Sign in on that device to remove it.'
                }
                onClick={() => void onRemoveDevice(d)}
              >
                Remove
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
