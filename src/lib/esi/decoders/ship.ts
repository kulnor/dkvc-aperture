import { z } from 'zod';

/**
 * Workaround for a long-standing ESI bug: `get_characters_character_id_ship`
 * returns `ship_name` as a Python `repr()` string — `u'๓໐ຖ
 * ScannaScanna'` — whenever the name contains non-ASCII characters. Pure-ASCII
 * names come back as plain strings. We undo the repr here, at the boundary, so
 * the rest of the app only ever sees real Unicode.
 *
 * Detection is deliberately narrow: the value must be wrapped in `u'…'` or
 * `u"…"`. Anything else (the common, well-formed case) passes through verbatim.
 */
const PYTHON_UNICODE_REPR = /^u(['"])([\s\S]*)\1$/;

const PYTHON_STRING_ESCAPE =
  /\\(?:U([0-9a-fA-F]{8})|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\\'"abfnrtv0]))/g;

const SIMPLE_ESCAPES: Record<string, string> = {
  '\\': '\\',
  "'": "'",
  '"': '"',
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '0': '\0',
};

export function normalizeShipName(raw: string): string {
  const wrapped = PYTHON_UNICODE_REPR.exec(raw);
  if (!wrapped) return raw;
  // Group 2 is `[\s\S]*` — it always participates when the match succeeds, so
  // this is never undefined; the assertion just tells `noUncheckedIndexedAccess`.
  const body = wrapped[2]!;
  return body.replace(
    PYTHON_STRING_ESCAPE,
    (_match, longHex, shortHex, byteHex, simple) => {
      if (longHex) return String.fromCodePoint(parseInt(longHex, 16));
      if (shortHex) return String.fromCharCode(parseInt(shortHex, 16));
      if (byteHex) return String.fromCharCode(parseInt(byteHex, 16));
      return SIMPLE_ESCAPES[simple] ?? simple;
    },
  );
}

/**
 * `getCharacterShip` → `get_characters_character_id_ship`. Current ship the
 * character is in. `ship_type_id` is the type stored as
 * `ap_character.last_ship_type_id` for the head-of-page breadcrumb.
 *
 * `ship_item_id` is an instance id (per-ship, persists across docking until
 * the ship is repackaged); useful for the future "did the pilot swap ships?"
 * signal but not consumed by the poll today.
 *
 * `ship_name` is normalized through `normalizeShipName` to undo the ESI
 * Python-repr bug (see above).
 */
export const characterShipSchema = z.object({
  ship_type_id: z.number().int(),
  ship_item_id: z.number().int(),
  ship_name: z.string().transform(normalizeShipName),
});

export type EsiCharacterShip = z.infer<typeof characterShipSchema>;
