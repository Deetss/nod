import { useCallback, useReducer, useRef } from 'react';
import { api } from '../api';
import { composerReducer, initialComposer, type ComposerTarget } from './composer-state';
import { commentRequestBody } from './request-body';

export interface InlinePostTarget {
  repo: string;
  number: number;
  /** Runs after a comment posts, so the PR detail and diff refetch, as other actions do. */
  onPosted: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

/**
 * The composer reducer with the posting around it. `submit` runs the API call and reports the
 * result to the reducer. A failed post keeps its text, and `submit` again retries it.
 */
export function useInlineComposer(post: InlinePostTarget) {
  const [state, dispatch] = useReducer(composerReducer, initialComposer);
  const latest = useRef(state);
  latest.current = state;
  const target = useRef(post);
  target.current = post;
  const lastDraft = useRef(false);
  const inFlight = useRef(false);

  const send = useCallback(async (to: ComposerTarget, text: string, draft: boolean) => {
    lastDraft.current = draft;
    const { repo, number, onPosted } = target.current;
    try {
      const body = commentRequestBody(to, text);
      if (!body) throw new Error('Write a comment first');
      const res = draft ? await api.addDraftComment(repo, number, body) : await api.addInlineComment(repo, number, body);
      if (res.ok) {
        dispatch({ type: 'succeed' });
        onPosted();
      } else {
        dispatch({ type: 'fail', error: res.message });
      }
    } catch (e) {
      dispatch({ type: 'fail', error: message(e) });
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Posts the comment (`draft` false) or adds it to the pending review. After a failure, this retries. */
  const submit = useCallback(
    (draft: boolean) => {
      const s = latest.current;
      if (inFlight.current || !s.target) return;
      if (s.status === 'failed') {
        inFlight.current = true;
        dispatch({ type: 'retry' });
        void send(s.target, s.text, lastDraft.current);
        return;
      }
      if ((s.status !== 'open' && s.status !== 'previewing') || s.text.trim() === '') return;
      inFlight.current = true;
      dispatch({ type: 'post' });
      void send(s.target, s.text, draft);
    },
    [send],
  );

  return { state, dispatch, submit };
}
