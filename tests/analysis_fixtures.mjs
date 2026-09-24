// Analysis agent fixtures. These exercise what is decided in CODE: the unit
// conversions, the hold rules, the coverage rule and the score band.
//
// The conversions are the part most worth testing. A wrong factor produces a
// number that looks exactly like a real result, and mmol/L glucose read as
// mg/dL turns a normal 5.5 into something that reads as severe hypoglycaemia.

import { normalize, CANONICAL } from '../functions/api/_units.js';

let bad = 0;
const t = (label, got, want, tol = 0.01) => {
  const ok = (typeof want === 'number')
    ? (typeof got === 'number' && Math.abs(got - want) <= tol)
    : got === want;
  if (!ok) bad++;
  console.log('%s %s  got=%s want=%s', ok ? 'ok  ' : 'FAIL', label.padEnd(58),
    JSON.stringify(got), JSON.stringify(want));
};

// --- conversions that must be exact ---
t('glucose 5.5 mmol/L becomes mg/dL',
  normalize('glucose-fasting', 5.5, 'mmol/L').value, 99.10, 0.02);
t('glucose 99 mg/dL is already canonical, no conversion recorded',
  normalize('glucose-fasting', 99, 'mg/dL').conversion, null);
t('HbA1c 42 mmol/mol IFCC becomes NGSP percent (affine, not a factor)',
  normalize('hba1c', 42, 'mmol/mol').value, 6.00, 0.02);
t('vitamin D 75 nmol/L becomes ng/mL',
  normalize('vitamin-d', 75, 'nmol/L').value, 30.05, 0.05);
t('hs-CRP 0.3 mg/dL becomes mg/L',
  normalize('hs-crp', 0.3, 'mg/dL').value, 3.0, 0.01);
t('triglycerides 1.7 mmol/L becomes mg/dL',
  normalize('triglycerides', 1.7, 'mmol/L').value, 150.57, 0.05);

// --- the conversion must be RECORDED, not just applied ---
t('a converted value records what was done to it',
  typeof normalize('glucose-fasting', 5.5, 'mmol/L').conversion, 'string');
t('a converted value keeps the raw number',
  normalize('glucose-fasting', 5.5, 'mmol/L').value_raw, 5.5);

// --- holds ---
t('no unit is HELD, never assumed canonical',
  normalize('glucose-fasting', 5.5, '').held, 'missing_unit');
t('a unit with no known conversion is HELD',
  normalize('glucose-fasting', 5.5, 'furlongs').held, 'unconvertible_unit');
t('a non-numeric value is HELD',
  normalize('glucose-fasting', 'high', 'mg/dL').held, 'implausible_value');

// --- a marker with no declared canonical unit passes through unchanged ---
t('a marker with no canonical unit is not converted',
  normalize('albumin', 4.2, 'g/dL').unit, 'g/dL');

console.log('\n%d case(s) failed', bad);
process.exit(bad ? 1 : 0);
