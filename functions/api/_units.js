// Unit normalization, with the conversion recorded.
//
// Brief 06 section 6 rule 3: units are normalized on ingest with the
// conversion recorded, and a value with no unit is HELD. Both halves matter.
// A converted value with no record of what was done to it is unauditable, and
// a wrong factor produces a number that looks exactly like a real result. A
// value with no unit cannot be converted at all, and assuming the canonical
// unit is the single most dangerous guess available here: mmol/L glucose read
// as mg/dL turns 5.5 into a number that looks like severe hypoglycaemia.

// canonical unit per marker slug, then the factors that reach it
export const CANONICAL = {
  'glucose-fasting':   'mg/dL',
  'hba1c':             '%',
  'insulin-fasting':   'uIU/mL',
  'triglycerides':     'mg/dL',
  'hdl':               'mg/dL',
  'trig-hdl-ratio':    'ratio',
  'homa-ir':           'index',
  'omega3-index':      '%',
  'aa-epa-ratio':      'ratio',
  'hs-crp':            'mg/L',
  'vitamin-d':         'ng/mL',
  'ferritin':          'ng/mL',
  'homocysteine':      'umol/L',
  'uric-acid':         'mg/dL',
  'ggt':               'U/L',
  'magnesium-rbc':     'mg/dL',
};

// from -> to -> [factor, statement]
const FACTORS = {
  'mmol/L': {
    'mg/dL': { 'glucose-fasting': [18.0182, 'mmol/L to mg/dL, x 18.0182'],
               'triglycerides':   [88.57,   'mmol/L to mg/dL, x 88.57'],
               'hdl':             [38.67,   'mmol/L to mg/dL, x 38.67'],
               'uric-acid':       [16.81,   'mmol/L to mg/dL, x 16.81'] },
  },
  'nmol/L': {
    'ng/mL': { 'vitamin-d': [1 / 2.496, 'nmol/L to ng/mL, divide by 2.496'] },
    'umol/L': { 'homocysteine': [0.001, 'nmol/L to umol/L, divide by 1000'] },
  },
  'mg/dL': { 'mg/L': { 'hs-crp': [10, 'mg/dL to mg/L, x 10'] } },
  'pmol/L': { 'uIU/mL': { 'insulin-fasting': [1 / 6.945, 'pmol/L to uIU/mL, divide by 6.945'] } },
  'mmol/mol': { '%': { 'hba1c': [null, 'IFCC mmol/mol to NGSP percent, (x 0.09148) + 2.152'] } },
};

export function normalize(slug, value, unit) {
  const v = Number(value);
  if (!isFinite(v)) return { held: 'implausible_value' };
  const u = String(unit || '').trim();
  if (!u) return { held: 'missing_unit' };

  const want = CANONICAL[slug];
  if (!want) return { value: v, unit: u, conversion: null };   // no canonical form declared
  if (u.toLowerCase() === want.toLowerCase()) {
    return { value: v, unit: want, conversion: null };
  }
  // IFCC HbA1c is an affine conversion, not a factor, so it is special-cased
  // rather than forced into the factor table where it would be wrong.
  if (slug === 'hba1c' && u.toLowerCase() === 'mmol/mol') {
    return { value: +(v * 0.09148 + 2.152).toFixed(2), unit: '%',
             conversion: FACTORS['mmol/mol']['%']['hba1c'][1], value_raw: v, unit_raw: u };
  }
  const row = FACTORS[u] && FACTORS[u][want] && FACTORS[u][want][slug];
  if (!row) return { held: 'unconvertible_unit' };
  return { value: +(v * row[0]).toFixed(4), unit: want, conversion: row[1],
           value_raw: v, unit_raw: u };
}
