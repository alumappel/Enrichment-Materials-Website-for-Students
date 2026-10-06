import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const colors = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[A-Fa-f0-9]{6})\s*;/g)].map(match => [match[1], match[2]]));
function rgb(hex) { return hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255); }
function luminance(channels) {
  const linear = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function contrast(a, b) {
  const values = [luminance(Array.isArray(a) ? a : rgb(a)), luminance(Array.isArray(b) ? b : rgb(b))].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
function checkPairs(pairs, minimum) {
  for (const [foreground, background] of pairs) {
    assert.ok(colors[foreground] && colors[background], 'Missing a design color');
    const ratio = contrast(colors[foreground], colors[background]);
    assert.ok(ratio >= minimum, foreground + ' on ' + background + ': ' + ratio.toFixed(2) + ':1; minimum ' + minimum);
  }
}
test('text and type icons use palette combinations with at least 4.5:1 contrast', () => {
  checkPairs([
    ['ink', 'paper'], ['ink', 'white'], ['navy', 'lavender'], ['navy', 'lavender-soft'],
    ['navy', 'white'], ['white', 'navy'], ['navy', 'banner'], ['muted', 'banner'], ['cocoa', 'orange'], ['cocoa', 'orange-hover'],
    ['cocoa', 'yellow'], ['muted', 'white'], ['muted', 'paper'],
    ['muted', 'lavender'], ['muted', 'lavender-soft'], ['danger', 'danger-soft']
  ], 4.5);
  // The grid's darkest point is the intersection of its two translucent navy lines.
  const opacity = 1 - (1 - 6 / 255) ** 2;
  const gridBackground = rgb(colors.paper).map((channel, i) => channel * (1 - opacity) + rgb(colors.navy)[i] * opacity);
  assert.ok(contrast(colors.muted, gridBackground) >= 4.5);
});
test('control boundaries and focus rings have at least 3:1 contrast with adjoining surfaces', () => {
  checkPairs([
    ['control-border', 'white'], ['control-border', 'paper'], ['control-border', 'lavender'],
    ['control-border', 'lavender-soft'], ['navy', 'white'], ['navy', 'paper'], ['navy', 'banner'],
    ['navy', 'lavender'], ['navy', 'lavender-soft'], ['navy', 'orange'], ['navy', 'yellow'],
    ['cocoa', 'orange'], ['danger', 'white'], ['danger', 'danger-soft']
  ], 3);
});
