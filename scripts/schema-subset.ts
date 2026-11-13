/**
 * Builds tests/fixtures/github-schema-subset.json from a full introspection result.
 * Keeps only the fields the app's documents select, plus every type they touch.
 *
 *   gh api graphql -F query=@introspection.graphql > full.json
 *   tsx scripts/schema-subset.ts full.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildClientSchema,
  getNamedType,
  isInputObjectType,
  parse,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  type GraphQLNamedType,
} from 'graphql';
import { allDocuments } from '../tests/graphql-docs';

const full = JSON.parse(readFileSync(process.argv[2], 'utf8')).data;
const schema = buildClientSchema(full);
const usedFields = new Map<string, Set<string>>();
const keep = new Set<string>(['Query', 'Mutation']);
const queue: GraphQLNamedType[] = [];

function want(t: GraphQLNamedType) {
  if (keep.has(t.name)) return;
  keep.add(t.name);
  queue.push(t);
}

for (const doc of Object.values(allDocuments())) {
  const info = new TypeInfo(schema);
  visit(
    parse(doc),
    visitWithTypeInfo(info, {
      Field(node) {
        const parent = info.getParentType();
        const field = info.getFieldDef();
        if (!parent || !field) return;
        if (!usedFields.has(parent.name)) usedFields.set(parent.name, new Set());
        usedFields.get(parent.name)!.add(node.name.value);
        want(getNamedType(field.type));
        for (const a of field.args) want(getNamedType(a.type));
        want(parent);
      },
      InlineFragment() {
        const t = info.getType();
        if (t) want(getNamedType(t));
      },
      VariableDefinition() {
        const t = info.getInputType();
        if (t) want(getNamedType(t));
      },
    }),
  );
}

while (queue.length) {
  const t = queue.pop()!;
  if (isInputObjectType(t)) for (const f of Object.values(t.getFields())) want(getNamedType(f.type));
}

const kept = full.__schema.types.filter((t: { name: string }) => keep.has(t.name));

/** Field names kept on each object or interface. A type needs at least one. */
const picks = new Map<string, Set<string>>();
for (const t of kept) {
  if (t.kind !== 'OBJECT' && t.kind !== 'INTERFACE') continue;
  const used = usedFields.get(t.name) ?? new Set<string>();
  const picked = t.fields.filter((f: { name: string }) => used.has(f.name));
  picks.set(t.name, new Set((picked.length ? picked : t.fields.slice(0, 1)).map((f: { name: string }) => f.name)));
}

const types = kept
  .map((t: any) => {
    if (t.kind === 'OBJECT' || t.kind === 'INTERFACE') {
      // Links to kept interfaces stay, so fragments on a `Node` validate; implementers keep the interface's fields.
      const interfaces = (t.interfaces ?? []).filter((i: { name: string }) => picks.has(i.name));
      const names = new Set([...picks.get(t.name)!, ...interfaces.flatMap((i: { name: string }) => [...picks.get(i.name)!])]);
      const fields = t.fields.filter((f: { name: string }) => names.has(f.name));
      const possibleTypes = t.possibleTypes?.filter((p: { name: string }) => keep.has(p.name));
      return { ...t, fields, interfaces, ...(possibleTypes ? { possibleTypes } : {}) };
    }
    if (t.kind === 'UNION') {
      return { ...t, possibleTypes: t.possibleTypes.filter((p: { name: string }) => keep.has(p.name)) };
    }
    return t;
  });

const out = {
  __schema: {
    queryType: full.__schema.queryType,
    mutationType: full.__schema.mutationType,
    subscriptionType: null,
    directives: full.__schema.directives,
    types,
  },
};
writeFileSync('tests/fixtures/github-schema-subset.json', JSON.stringify(out));
console.log(`${types.length} types`);
