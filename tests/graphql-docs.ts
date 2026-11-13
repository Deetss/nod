import * as closedQueries from '../server/closed';
import * as issueQueries from '../server/issue-queries';
import * as prQueries from '../server/queries';

/** Every GraphQL document the app sends, by name. */
export function allDocuments(): Record<string, string> {
  const docs: Record<string, string> = {};

  for (const mod of [prQueries, issueQueries, closedQueries]) {
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value === 'string' && /^\s*(query|mutation)\b/.test(value)) docs[key] = value;
    }
  }
  docs.pollQuery = issueQueries.pollQuery(prQueries.PR_FIELDS);

  return docs;
}
