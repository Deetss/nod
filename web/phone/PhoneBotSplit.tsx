import type { SplitPart } from '../../shared/issue-types';
import { splitCommand } from '../../shared/bot';
import { bot } from '../org-settings';
import { SplitParts, splitHeading } from '../issues/SplitDialog';
import { useFocusTrap } from '../useFocusTrap';

interface PhoneBotSplitProps {
  number: number;
  parts: SplitPart[];
  onSplit: () => void;
  onClose: () => void;
}

/** Bottom sheet previewing the bot's split. Split posts the split command and closes the sheet. */
export function PhoneBotSplit(p: PhoneBotSplitProps) {
  const trap = useFocusTrap(p.onClose);
  const heading = splitHeading(p.parts.length, p.number);
  return (
    <div className="ph-scrim" style={{ zIndex: 60 }} onClick={p.onClose}>
      <div ref={trap} className="ph-asheet" role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <span className="ph-handle" aria-hidden="true" />
        <h2 className="ph-asheet-title ph-split-heading">{heading}</h2>
        <div className="ph-asheet-body">
          <SplitParts parts={p.parts} className="ph-split-parts" />
          <p className="ph-muted ph-split-note">Posts {splitCommand(bot())}. Each new issue starts unlabelled; use Start work on it when it is ready.</p>
          <div className="ph-split-actions">
            <button type="button" className="ph-btn is-primary" onClick={p.onSplit}>
              Split
            </button>
            <button type="button" className="ph-btn" onClick={p.onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
