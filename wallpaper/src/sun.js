// Real sun → art-directed room light.
// Elevation and morning/afternoon come from the actual solar position (NOAA
// approximation); the beam's direction inside the room follows a directed path so
// the afternoon composition always lands on the floor and the back wall.
import { hex, cmix, clamp, smooth, deg, norm } from './math.js';

export function solar(date, lat, lon) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000; // fractional day of year (UTC)
  const g = ((2 * Math.PI) / 365) * (day - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (((utcMin + eqt + 4 * lon) % 1440) + 1440) % 1440; // true solar time, minutes
  const ha = (tst / 4 - 180) * rad; // hour angle
  const phi = lat * rad;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const elev = 90 - Math.acos(clamp(cosZ, -1, 1)) / rad;
  return { elevation: elev, afternoon: ha > 0, hourAngle: ha / rad };
}

const K = (h) => hex(h);

// Mood keys along a single "day phase" axis: 0 = deep night … 1 = midday … 2 = deep night again.
// Morning half (0→1) is the cool contrast mood; afternoon half (1→2) is the warm beam.
const AM = [[-12, 0.0], [-5, 0.14], [2, 0.3], [32, 0.55], [72, 1.0]];
const PM = [[62, 1.0], [30, 1.35], [12, 1.62], [2, 1.78], [-4, 1.88], [-12, 2.0]];
function piecewise(e, pts) {
  const asc = pts[0][0] < pts[pts.length - 1][0];
  const P = asc ? pts : [...pts].reverse();
  if (e <= P[0][0]) return P[0][1];
  if (e >= P[P.length - 1][0]) return P[P.length - 1][1];
  for (let i = 0; i < P.length - 1; i++) {
    if (e <= P[i + 1][0]) { const t = (e - P[i][0]) / (P[i + 1][0] - P[i][0]); return P[i][1] + (P[i + 1][1] - P[i][1]) * t; }
  }
  return P[P.length - 1][1];
}
function phaseOf(sun) {
  return piecewise(sun.elevation, sun.afternoon ? PM : AM);
}

const KEYS = [
  // phase, look
  [0.0, { name: 'night', skyTop: '#151D33', skyLow: '#26314F', sun: 0, sunCol: '#FFCC8F', amb: 0.30, ambTint: '#6E78A8', fill: 0.10, fillCol: '#7C88B8', cool: 0, lamp: 1, city: 1, dust: 0, warm: 0.0 }],
  [0.14, { name: 'pre-dawn', skyTop: '#2A3557', skyLow: '#6D6F8F', sun: 0, sunCol: '#FFCC8F', amb: 0.42, ambTint: '#7E86AE', fill: 0.16, fillCol: '#9AA3C8', cool: 0.25, lamp: 0.5, city: 0.6, dust: 0, warm: 0.0 }],
  [0.30, { name: 'dawn', skyTop: '#7D93BC', skyLow: '#E7B9A2', sun: 0, sunCol: '#FFCC8F', amb: 0.70, ambTint: '#A7A9C2', fill: 0.24, fillCol: '#C6CCE0', cool: 0.65, lamp: 0, city: 0, dust: 0, warm: 0.02 }],
  [0.55, { name: 'morning', skyTop: '#A9C2DA', skyLow: '#E7ECEA', sun: 0, sunCol: '#FFCC8F', amb: 0.98, ambTint: '#B7BCCF', fill: 0.30, fillCol: '#E2E7F5', cool: 1.0, lamp: 0, city: 0, dust: 0, warm: 0.0 }],
  [1.0, { name: 'midday', skyTop: '#A5C0D8', skyLow: '#DDE2D6', sun: 0.55, sunCol: '#FFE2B8', amb: 1.0, ambTint: '#B9B7B6', fill: 0.34, fillCol: '#EEEDEA', cool: 0.25, lamp: 0, city: 0, dust: 0.6, warm: 0.02 }],
  [1.35, { name: 'afternoon', skyTop: '#98B2CD', skyLow: '#EAC69B', sun: 1.0, sunCol: '#FFCC8F', amb: 0.86, ambTint: '#B4B3BA', fill: 0.38, fillCol: '#E3E6EC', cool: 0, lamp: 0, city: 0, dust: 1, warm: 0.05 }],
  [1.62, { name: 'golden', skyTop: '#8C9FC0', skyLow: '#F2AF79', sun: 1.05, sunCol: '#FFB877', amb: 0.74, ambTint: '#ACA4AA', fill: 0.36, fillCol: '#E9E1DC', cool: 0, lamp: 0, city: 0, dust: 1, warm: 0.07 }],
  [1.78, { name: 'sunset', skyTop: '#5E6E9C', skyLow: '#E58A63', sun: 0.6, sunCol: '#FF9E6A', amb: 0.58, ambTint: '#8F8098', fill: 0.28, fillCol: '#DCC5C4', cool: 0, lamp: 0.3, city: 0.2, dust: 0.6, warm: 0.06 }],
  [1.88, { name: 'dusk', skyTop: '#33416B', skyLow: '#9C7189', sun: 0, sunCol: '#FF9E6A', amb: 0.44, ambTint: '#757BA6', fill: 0.16, fillCol: '#9E95BA', cool: 0, lamp: 1, city: 0.8, dust: 0, warm: 0.02 }],
  [2.0, { name: 'night', skyTop: '#151D33', skyLow: '#26314F', sun: 0, sunCol: '#FFCC8F', amb: 0.30, ambTint: '#6E78A8', fill: 0.10, fillCol: '#7C88B8', cool: 0, lamp: 1, city: 1, dust: 0, warm: 0.0 }],
];

function blendKeys(phase) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] < phase) i++;
  const [p0, a] = KEYS[i], [p1, b] = KEYS[i + 1];
  const t = clamp((phase - p0) / (p1 - p0));
  const out = { name: t < 0.5 ? a.name : b.name };
  for (const k of Object.keys(a)) {
    if (k === 'name') continue;
    if (typeof a[k] === 'string') out[k] = cmix(K(a[k]), K(b[k]), t);
    else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
}

// Light for the room at a given moment.
export function roomLight(date, loc) {
  const sun = solar(date, loc.lat, loc.lon);
  const phase = phaseOf(sun);
  const m = blendKeys(phase);
  // The beam only exists in the afternoon half with the sun above the horizon,
  // and not when it is so high it cannot get past the window reveal.
  const e = Math.max(0, sun.elevation);
  const beam = sun.afternoon ? smooth(0.3, 3.5, sun.elevation) * (1 - smooth(64, 72, sun.elevation)) : 0;
  // Directed path: as the sun lowers, the beam swings deeper into the room.
  const low = 1 - smooth(4, 60, e);
  const elevArt = Math.max(9, Math.min(55, e)) * deg;
  const az = (58 - 12 * low) * deg; // swing deeper into the room as the sun lowers
  const S = norm([-Math.cos(elevArt) * Math.cos(az), Math.sin(elevArt), -Math.cos(elevArt) * Math.sin(az)]);
  return {
    ...m,
    phase,
    elevation: sun.elevation,
    afternoon: sun.afternoon,
    S, // unit vector pointing toward the sun (room space)
    sunI: m.sun * beam,
    dust: m.dust * beam,
  };
}
