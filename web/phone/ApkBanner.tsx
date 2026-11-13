import { useEffect, useState } from 'react';
import { apkBanner, type AndroidRelease } from '../../shared/android-release';
import { api } from '../api';
import { dismissApk, dismissedApk, installedApk } from '../apk-version';

/** The published APK when it is newer than the installed app and not dismissed. Checked once per launch. */
export function useApkUpdate() {
  const [latest, setLatest] = useState<AndroidRelease>();
  const [dismissed, setDismissed] = useState(dismissedApk);
  const installed = installedApk();

  useEffect(() => {
    if (installed === undefined) return;
    api.androidLatest().then(setLatest, () => undefined);
  }, [installed]);

  const shown = apkBanner({ latest, installed, dismissed });
  const dismiss = () => {
    if (!shown) return;
    dismissApk(shown.versionCode);
    setDismissed(shown.versionCode);
  };
  return { shown, dismiss };
}

interface ApkBannerProps {
  release: AndroidRelease;
  onDismiss: () => void;
}

/** "App update available" with a download link. Android takes over from the downloaded file. */
export function ApkBanner({ release, onDismiss }: ApkBannerProps) {
  return (
    <div className="ph-apk-banner" role="region" aria-label="App update available">
      <div className="ph-apk-text">
        <strong>App update available</strong>
        <span>
          Version {release.versionName}. The first time, Android asks to allow installs from Nod or Chrome.
        </span>
      </div>
      <a className="ph-apk-install" href="/api/android/nod.apk" download>
        Install
      </a>
      <button type="button" className="ph-apk-close" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
