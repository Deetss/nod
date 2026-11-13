/** A paired phone as the desktop sees it. Never carries the key or its hash. */
export interface DeviceInfo {
  id: string;
  name: string;
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
}
