import {defaults, normalize} from './solver.mjs';
import {defaultRibs, ribKeys} from './section.mjs';
import {steelDefaults} from './steel.mjs';
import {calibrationValues, signature} from './design.mjs';

export const CUSTOM_DRAFT_KEY = 'pvc-custom-draft-v1';
export const FULL_DRAFT_KEY = 'pvc-draft-v2';

// Build the independent custom-mode draft without changing the full-mode record.
export function customOnlyDesign(input = defaults) {
  const settings = normalize(input);
  const wasCustom = settings.section === 'ribbed' && settings.profilePreset === 'custom';
  const hadSteel = !!settings.steel.enabled;
  const ribs = settings.ribbed;
  const needsRibs = settings.section !== 'ribbed' || !ribs || typeof ribs !== 'object' || Array.isArray(ribs) || ribKeys.some(key => !Object.hasOwn(ribs, key));

  settings.section = 'ribbed';
  settings.profilePreset = 'custom';
  if (needsRibs) settings.ribbed = defaultRibs(settings.width, settings.height);
  settings.steel = structuredClone(steelDefaults);
  // The original full draft retains migration and inactive assembly records.
  settings.sectionMigration = null;

  if (!wasCustom || hadSteel || needsRibs || settings.calibration?.signature !== signature(settings)) {
    settings.calibration = null;
  } else if (settings.calibration) {
    try { calibrationValues(settings.calibration); } catch { settings.calibration = null; }
  }

  const material = settings.material;
  if (material.reference?.mode === 'auto') material.reference.mode = 'off';
  // An adjusted reference remains recorded as an assumption, but Custom has no
  // preset reference eligibility. Do not relabel it as a specimen measurement.
  if (material.bendingBasis === 'young' && material.youngMPa == null) material.bendingBasis = 'auto';
  return settings;
}
