// ZIP or postal code to the three things the program actually needs:
// timezone, latitude, hemisphere. Nothing finer, and never a street address.
//
// WHY STATE-LEVEL AND NOT A GEOCODER.
// The program uses these for three jobs: which local date a member is on, how
// long daylight is where they live, and which seasonal list to show. All three
// are satisfied by the state. A geocoding API would add a network dependency,
// a key, a rate limit and a failure mode to a field that is filled in once, and
// would buy precision nothing here reads.
//
// WHAT IS EXACT AND WHAT IS APPROXIMATE, said plainly because the difference
// matters:
//   state       EXACT. ZIP prefix allocation is fixed and public.
//   hemisphere  EXACT for every US state.
//   timezone    EXACT for 37 states that have one. The 13 split states are
//               resolved by ZIP prefix where the split is clean, and where it
//               is not the member is asked. A wrong timezone sends the brief
//               on the wrong day, so it is never guessed silently.
//   latitude    APPROXIMATE, the state's population-weighted centre to the
//               nearest tenth of a degree. Daylight length changes by minutes
//               across a state, and the protocol asks for "morning light",
//               not a sunrise table.

// USPS ZIP prefix allocation. [low, high, state], inclusive, on the first
// three digits.
const ZIP3 = [
  [5,5,'NY'],[6,9,'PR'],[10,27,'MA'],[28,29,'RI'],[30,38,'NH'],[39,49,'ME'],
  [50,59,'VT'],[60,69,'CT'],[70,89,'NJ'],[90,98,'AA'],[100,149,'NY'],
  [150,196,'PA'],[197,199,'DE'],[200,205,'DC'],[206,219,'MD'],[220,246,'VA'],
  [247,268,'WV'],[270,289,'NC'],[290,299,'SC'],[300,319,'GA'],[320,349,'FL'],
  [350,369,'AL'],[370,385,'TN'],[386,397,'MS'],[398,399,'GA'],[400,427,'KY'],
  [430,459,'OH'],[460,479,'IN'],[480,499,'MI'],[500,528,'IA'],[530,549,'WI'],
  [550,567,'MN'],[570,577,'SD'],[580,588,'ND'],[590,599,'MT'],[600,629,'IL'],
  [630,658,'MO'],[660,679,'KS'],[680,693,'NE'],[700,714,'LA'],[716,729,'AR'],
  [730,749,'OK'],[750,799,'TX'],[800,816,'CO'],[820,831,'WY'],[832,838,'ID'],
  [840,847,'UT'],[850,865,'AZ'],[870,884,'NM'],[885,885,'TX'],[889,898,'NV'],[900,961,'CA'],
  [967,968,'HI'],[970,979,'OR'],[980,994,'WA'],[995,999,'AK'],
];

// State to timezone and approximate latitude. `split` means the state spans
// more than one zone and the single value here is the predominant one.
const STATE = {
  AL:['America/Chicago',32.8],   AK:['America/Anchorage',64.0,'split'],
  AZ:['America/Phoenix',34.2],   AR:['America/Chicago',34.8],
  CA:['America/Los_Angeles',36.8], CO:['America/Denver',39.1],
  CT:['America/New_York',41.6],  DE:['America/New_York',39.0],
  DC:['America/New_York',38.9],  FL:['America/New_York',28.6,'split'],
  GA:['America/New_York',32.7],  HI:['Pacific/Honolulu',20.8],
  ID:['America/Boise',44.4,'split'], IL:['America/Chicago',40.0],
  IN:['America/Indiana/Indianapolis',39.9,'split'],
  IA:['America/Chicago',42.0],   KS:['America/Chicago',38.5,'split'],
  KY:['America/New_York',37.5,'split'], LA:['America/Chicago',31.1],
  ME:['America/New_York',45.4],  MD:['America/New_York',39.0],
  MA:['America/New_York',42.3],  MI:['America/Detroit',44.3,'split'],
  MN:['America/Chicago',46.3],   MS:['America/Chicago',32.7],
  MO:['America/Chicago',38.4],   MT:['America/Denver',47.0],
  NE:['America/Chicago',41.5,'split'], NV:['America/Los_Angeles',39.3],
  NH:['America/New_York',43.7],  NJ:['America/New_York',40.2],
  NM:['America/Denver',34.4],    NY:['America/New_York',42.9],
  NC:['America/New_York',35.6],  ND:['America/Chicago',47.5,'split'],
  OH:['America/New_York',40.3],  OK:['America/Chicago',35.6],
  OR:['America/Los_Angeles',43.9,'split'], PA:['America/New_York',40.9],
  RI:['America/New_York',41.7],  SC:['America/New_York',33.9],
  SD:['America/Chicago',44.4,'split'], TN:['America/Chicago',35.8,'split'],
  TX:['America/Chicago',31.5,'split'], UT:['America/Denver',39.3],
  VT:['America/New_York',44.1],  VA:['America/New_York',37.5],
  WA:['America/Los_Angeles',47.4], WV:['America/New_York',38.6],
  WI:['America/Chicago',44.6],   WY:['America/Denver',43.0],
  PR:['America/Puerto_Rico',18.2],
};

// For a split state, the MINORITY zone's ZIP ranges. The predominant zone is
// in STATE above, so a ZIP that matches nothing here is in the predominant
// zone. `exhaustive: true` means the minority ranges below are the complete
// list, so a non-match is EXACT rather than a guess.
//
// Written this way round after getting it wrong the other way: listing both
// zones produced overlapping ranges for Tennessee and Kentucky where the first
// match won and the second was unreachable, and it flagged 78734 as uncertain
// when Texas is Central everywhere except El Paso.
const SPLIT_MINORITY = {
  FL: { exhaustive: true,  zone: 'America/Chicago',     ranges: [[320, 326]] },
  TX: { exhaustive: true,  zone: 'America/Denver',      ranges: [[798, 799], [885, 885]] },
  KS: { exhaustive: true,  zone: 'America/Denver',      ranges: [[679, 679]] },
  NE: { exhaustive: true,  zone: 'America/Denver',      ranges: [[691, 693]] },
  ND: { exhaustive: true,  zone: 'America/Denver',      ranges: [[586, 588]] },
  OR: { exhaustive: true,  zone: 'America/Boise',       ranges: [[979, 979]] },
  TN: { exhaustive: true,  zone: 'America/New_York',    ranges: [[377, 379]] },
  KY: { exhaustive: true,  zone: 'America/Chicago',     ranges: [[420, 424]] },
  // These four are genuinely messy at the county level and the ZIP prefix does
  // not settle them, so the member is asked rather than told something wrong.
  IN: { exhaustive: false, zone: 'America/Chicago',     ranges: [[463, 464], [473, 473]] },
  MI: { exhaustive: false, zone: 'America/Menominee',   ranges: [[498, 499]] },
  SD: { exhaustive: false, zone: 'America/Denver',      ranges: [[577, 577]] },
  ID: { exhaustive: false, zone: 'America/Los_Angeles', ranges: [[838, 838]] },
  AK: { exhaustive: false, zone: 'America/Anchorage',   ranges: [] },
};

export function stateForZip(zip) {
  const n = parseInt(String(zip || '').trim().slice(0, 3), 10);
  if (!Number.isFinite(n)) return null;
  for (const [lo, hi, st] of ZIP3) if (n >= lo && n <= hi) return st;
  return null;
}

/**
 * @returns {{ok:boolean, region, timezone, latitude, hemisphere, tz_confidence, why}}
 * tz_confidence is 'exact' when the state has one zone or the ZIP resolves it,
 * and 'ask' when the state is split and the ZIP does not. Never 'probably'.
 */
export function derive(postal, country) {
  const c = String(country || 'US').toUpperCase();
  if (c !== 'US') {
    // Outside the US the program has no prefix table, so nothing is invented.
    // Country fixes the hemisphere for the seasonal list; the member picks the
    // timezone, because a wrong one sends the brief on the wrong day.
    const SOUTH = new Set(['AU','NZ','AR','CL','ZA','UY','PY','PE','BO','BR',
                           'ID','FJ','NA','BW','ZW','MZ','MG','TZ','PG']);
    return { ok: true, region: null, timezone: null,
             latitude: null, hemisphere: SOUTH.has(c) ? 'S' : 'N',
             tz_confidence: 'ask',
             why: 'Outside the US there is no postal prefix table here, so the timezone is asked rather than guessed.' };
  }
  const st = stateForZip(postal);
  if (!st || !STATE[st]) {
    return { ok: false, region: null, timezone: null, latitude: null,
             hemisphere: 'N', tz_confidence: 'ask',
             why: 'That does not look like a US ZIP code.' };
  }
  const [tz, lat, split] = STATE[st];
  const n = parseInt(String(postal).slice(0, 3), 10);
  let zone = tz, conf = 'exact', why = null;
  if (split) {
    const s = SPLIT_MINORITY[st];
    const inMinority = s && s.ranges.some(([lo, hi]) => n >= lo && n <= hi);
    if (inMinority) {
      zone = s.zone;                       // the ZIP settles it
    } else if (!s || !s.exhaustive) {
      conf = 'ask';                        // the prefix cannot settle it
      why = st + ' spans more than one timezone and this ZIP does not settle ' +
            'it. Confirm the zone so the morning brief arrives on the right day.';
    }
    // exhaustive and not in the minority means the predominant zone, exactly
  }
  return { ok: true, region: st, timezone: zone, latitude: lat,
           hemisphere: 'N', tz_confidence: conf, why };
}

// The application form asks for a state by full name. The derivation returns a
// two-letter code. This maps one to the other so a disagreement between what a
// member typed and what their ZIP says can actually be detected rather than
// passing silently because the two were never comparable.
export const OUTSIDE_US = 'Outside the United States';
export const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan',
  MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana',
  NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey',
  NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota',
  OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
  TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
  WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};
