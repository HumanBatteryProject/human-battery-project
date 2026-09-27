// How a device reading is allowed to be spoken about. Section 3.9 of the brief.
//
// "They say 'your ring' or 'your watch' measured it, and never present a device reading as a
// lab result."
//
// WHY THIS IS A MODULE AND NOT A SENTENCE IN TWO PROMPTS. The brief and the coach both read
// wearable_daily, and if each carried its own wording they would drift: one would start
// calling an HRV number a result, or comparing a wrist reading against a blood panel. The
// distinction being protected is not stylistic. A device on the skin and a vein draw in a lab
// are different kinds of evidence about the same person, and the model has no way to know that
// unless it is told every time.

export const DEVICE_WORD = {
  oura: 'your ring',
  whoop: 'your strap',
  polar: 'your watch',
  withings: 'your scale',
  garmin: 'your watch',
  google_health: 'your phone',
  apple_health_upload: 'your phone',
};

// The instruction that travels with the data, in both agents.
export const WEARABLE_RULES = [
  'DEVICE READINGS. Some numbers below were measured by a device the participant wears or',
  'stands on, not by a laboratory. Three rules, and they are not stylistic:',
  '',
  '1. Name the device. Say "your ring measured" or "your watch measured", using the exact',
  '   phrase given with each reading. Never say "your results" or "your labs" about one.',
  '2. Never compare a device reading against a blood marker, a reference range or an optimal',
  '   range. A wrist HRV and a vein draw are different kinds of evidence and putting them in',
  '   one sentence implies they are not.',
  '3. A vendor score, such as Oura Readiness or WHOOP Recovery, carries the vendor name and is',
  '   theirs, not ours. It never enters the Human Battery Score and must not be described as',
  '   part of it.',
  '',
  'If a reading was held, it is not data. Do not mention a held value as though it were one.',
].join('\n');

/**
 * The readings, shaped for a prompt, with the wording attached to each one.
 *
 * Held rows are EXCLUDED entirely rather than passed with a flag. A held reading is a note
 * about our mapping, not a measurement about the person, and the surest way to stop a model
 * repeating one as fact is not to show it.
 */
export function wearableContext(rows) {
  const usable = (rows || []).filter((r) => r.is_held !== true);
  if (!usable.length) return null;

  const FIELDS = [
    ['sleep_duration_min', 'time asleep', 'minutes'],
    ['sleep_efficiency_pct', 'sleep efficiency', 'percent'],
    ['resting_hr_bpm', 'resting heart rate', 'bpm'],
    ['hrv_rmssd_ms', 'HRV', 'ms'],
    ['respiratory_rate_bpm', 'breathing rate', 'breaths per minute'],
    ['skin_temp_deviation_c', 'skin temperature change', 'degrees Celsius'],
    ['steps', 'steps', 'count'],
    ['time_in_daylight_min', 'time in daylight', 'minutes'],
    ['weight_kg', 'weight', 'kilograms'],
    ['systolic_mmhg', 'blood pressure upper', 'mmHg'],
    ['diastolic_mmhg', 'blood pressure lower', 'mmHg'],
  ];

  return usable.map((r) => {
    const measured = {};
    for (const [key, label, unit] of FIELDS) {
      if (r[key] === null || r[key] === undefined) continue;
      measured[label] = `${r[key]} ${unit}`;
    }
    return {
      day: r.day,
      // The phrase the model is told to use, rather than the provider's name, so it cannot
      // say "Oura says" as though the company were a witness.
      say: DEVICE_WORD[r.provider] || 'your device',
      basis: 'MEASURED',
      measured_by_a_device_not_a_laboratory: true,
      measured,
      ...(r.vendor_score_name ? {
        vendor_score: {
          name: r.vendor_score_name,
          value: r.vendor_score_value,
          whose: 'the vendor, not this program',
          part_of_battery_score: false,
        },
      } : {}),
    };
  });
}

/**
 * The sentence the portal and the brief use when a device number is shown.
 * One phrasing, so two screens cannot describe the same thing differently.
 */
export function measuredByLine(provider, day) {
  const word = DEVICE_WORD[provider] || 'your device';
  return `${word} measured this on ${day}. It is a device reading, not a laboratory result.`;
}
