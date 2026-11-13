import { readFileSync } from 'node:fs';
import { buildClientSchema, parse, validate, type IntrospectionQuery } from 'graphql';
import { describe, expect, it } from 'vitest';
import { allDocuments } from './graphql-docs';

const introspection = JSON.parse(
  readFileSync(new URL('./fixtures/github-schema-subset.json', import.meta.url), 'utf8'),
) as IntrospectionQuery;
const schema = buildClientSchema(introspection);
const docs = Object.entries(allDocuments());

describe('GraphQL documents against GitHub schema', () => {
  it('finds the documents', () => {
    expect(docs.length).toBeGreaterThanOrEqual(24);
  });

  it('includes the project status documents', () => {
    const names = docs.map(([name]) => name);
    expect(names).toEqual(expect.arrayContaining(['PROJECT_META_QUERY', 'ADD_PROJECT_ITEM', 'SET_PROJECT_STATUS']));
  });

  it('rejects an unknown project mutation input field', () => {
    const bad =
      'mutation M($p: ID!, $i: ID!, $f: ID!) { updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, status: "x" }) { clientMutationId } }';
    expect(validate(schema, parse(bad)).length).toBeGreaterThan(0);
  });

  it('rejects an unknown field on a project item', () => {
    const bad =
      '{ repository(owner: "o", name: "n") { issue(number: 1) { projectItems(first: 5) { nodes { id bogusField } } } } }';
    expect(validate(schema, parse(bad)).length).toBeGreaterThan(0);
  });

  it('rejects an unknown input field', () => {
    const bad = 'mutation M($id: ID!) { closeIssue(input: { issueId: $id, reason: COMPLETED }) { clientMutationId } }';
    expect(validate(schema, parse(bad)).length).toBeGreaterThan(0);
  });

  it.each(docs)('%s is valid', (_name, source) => {
    const errors = validate(schema, parse(source));
    expect(errors.map((e) => e.message)).toEqual([]);
  });
});
