/**
 * Draft 2020-12 validation of live detectInput() results.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeBase64 } from '../../src/core/base64.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../schemas/media/detection-result.v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

/** @type {(data: unknown) => boolean} */
let validate;
/** @type {() => object[]} */
let getErrors;

before(async () => {
  let Ajv;
  try {
    const mod = await import('ajv');
    Ajv = mod.default || mod.Ajv;
  } catch {
    throw new Error(
      'ajv is required for detection schema tests (devDependency). Run npm install.',
    );
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  validate = ajv.compile(schema);
  getErrors = () => validate.errors || [];
});

function assertValid(result, label) {
  const ok = validate(result);
  if (!ok) {
    const detail = JSON.stringify(getErrors(), null, 2);
    assert.fail(`${label} failed schema validation:\n${detail}`);
  }
}

function assertInvalid(obj, label) {
  const ok = validate(obj);
  assert.equal(ok, false, `${label} should be invalid`);
}

function clone(r) {
  return JSON.parse(JSON.stringify(r));
}

describe('detection-result.v1 schema (Ajv Draft 2020-12)', () => {
  it('ordinary text', async () => {
    assertValid(await detectInput('hello world'), 'text');
  });

  it('empty input', async () => {
    assertValid(await detectInput(''), 'empty');
  });

  it('whole-input Base64', async () => {
    assertValid(await detectInput('SGk='), 'b64');
  });

  it('embedded Base64 + nested PNG', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const token = encodeBase64(png);
    const r = await detectInput(`HEAD ${token} TAIL`, { decodeNested: true });
    assertValid(r, 'nested-png');

    const b64 = r.findings.find((f) => f.subtype === 'base64' && f.source_token === token);
    assert.ok(b64);
    assert.equal(typeof b64.char_start, 'number');
    assert.equal(typeof b64.char_end, 'number');

    const nested = r.findings.find((f) => f.parent_finding_id === b64.finding_id);
    assert.ok(nested);
    assert.ok(nested.evidence.includes('decoded-coordinate-space'));
    assert.ok(
      (nested.relationships || []).some(
        (rel) => rel.kind === 'decoded-from' && rel.target === b64.finding_id,
      ),
    );
  });

  it('binary input', async () => {
    assertValid(await detectInput(new Uint8Array([0, 1, 2, 3, 255])), 'binary');
  });

  it('truncated input', async () => {
    const r = await detectInput(new Uint8Array(400), { limits: { maxBytes: 40 } });
    assertValid(r, 'truncated');
    assert.equal(r.truncated, true);
  });

  it('type-hint conflict alert', async () => {
    const r = await detectInput(new Uint8Array([1, 2, 3, 4]), { typeHint: 'image/png' });
    assertValid(r, 'type-hint');
    assert.ok(r.alerts.some((a) => a.code === 'TYPE_HINT_CONFLICT'));
  });

  it('size-limit alert on truncation', async () => {
    const r = await detectInput(new Uint8Array(200), { limits: { maxBytes: 20 } });
    assertValid(r, 'size-limit');
    assert.ok(r.alerts.some((a) => a.code === 'SIZE_LIMIT'));
  });
});

describe('schema rejects malformed results', () => {
  it('missing required fields / bad types', async () => {
    const base = await detectInput('ok');
    assertValid(base, 'base');

    const missingSchema = clone(base);
    delete missingSchema.schema;
    assertInvalid(missingSchema, 'missing schema');

    const negLen = clone(base);
    negLen.byteLength = -1;
    assertInvalid(negLen, 'negative byteLength');

    const badConf = clone(base);
    if (badConf.findings[0]) {
      badConf.findings[0].confidence = 2;
      assertInvalid(badConf, 'confidence > 1');
    }

    const badComplete = clone(base);
    if (badComplete.findings[0]) {
      badComplete.findings[0].completeness = 'nope';
      assertInvalid(badComplete, 'bad completeness');
    }

    const badRel = clone(base);
    if (badRel.findings[0]) {
      badRel.findings[0].relationships = [{ kind: 'decoded-from' }];
      assertInvalid(badRel, 'relationship missing target');
    }

    const badAlert = clone(base);
    badAlert.alerts = [{ level: 'fatal', code: 'X', message: 'no' }];
    assertInvalid(badAlert, 'invalid alert level');

    const badAlertCode = clone(base);
    badAlertCode.alerts = [{ level: 'info', code: 1, message: 'x' }];
    assertInvalid(badAlertCode, 'non-string alert code');

    const negChar = clone(base);
    if (negChar.findings[0]) {
      negChar.findings[0].char_start = -3;
      assertInvalid(negChar, 'negative char_start');
    }
  });
});
