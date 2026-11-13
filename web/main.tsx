import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { rememberApk } from './apk-version';
import { App } from './App';
import { setFirstRun, setOrgSettings } from './org-settings';
import { migrateStorageKeys } from './storage-migrate';
import './tokens.css';
import './base.css';
import './inbox.css';
import './detail.css';
import './ci.css';
import './diff.css';
import './issues.css';
import './closed.css';
import './sub-issues.css';
import './activity.css';
import './density.css';
import './density-list.css';
import './density-detail.css';
import './density-pr.css';
import './fix-checks.css';
import './status-box.css';
import './pr-detail.css';
import './orca.css';
import './timeline.css';
import './pair.css';
import './mentions/mentions.css';
import './settings.css';
import './phone/phone-shell.css';
import './phone/phone-list.css';
import './phone/phone-states.css';
import './phone/phone-sheets.css';
import './phone/phone-timeline.css';
import './phone/phone-diff.css';
import './phone/phone-issue.css';
import './phone/phone-actions.css';
import './phone/phone-picker.css';
import './phone/phone-swipe.css';

migrateStorageKeys();
rememberApk();

const root = document.getElementById('root');
if (root) {
  // Org and status names come from the server's settings file; defaults apply if it is unreachable.
  const loaded = api.settings().then(setOrgSettings, () => undefined);
  const saved = api.settingsSaved().then((r) => setFirstRun(!r.saved), () => undefined);
  void Promise.all([loaded, saved]).then(() =>
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
}
