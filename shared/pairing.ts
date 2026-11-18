/**
 * What a paired device may do over the tailnet. A phone and a desktop use the inbox; an admin
 * device may also manage devices and pairing codes and save settings, as loopback can.
 */
export const DEVICE_ROLES = ['phone', 'desktop', 'admin'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

export const isDeviceRole = (v: unknown): v is DeviceRole => DEVICE_ROLES.includes(v as DeviceRole);

/** A paired device as the desktop sees it. Never carries the key or its hash. */
export interface DeviceInfo {
  id: string;
  name: string;
  role: DeviceRole;
  createdAt: string;
  lastSeen: string;
}

export interface DevicesResponse {
  /** `https://<tailnet host>` (plus a non-default port), or undefined when phone access is off. */
  phoneUrl: string | undefined;
  devices: DeviceInfo[];
}

export interface PairCode {
  code: string;
  /** ISO time the code stops working. */
  expiresAt: string;
  /** The full link to put in the QR code. */
  link: string;
  /** The role the paired device gets. */
  role: DeviceRole;
}

/** `GET /api/devices/me`: the role this request acts with. Loopback is always admin. */
export interface DeviceSelf {
  role: DeviceRole;
  /** The server's app version, when it knows it. */
  version?: string;
}
