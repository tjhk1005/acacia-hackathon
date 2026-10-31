import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { photos, photoPath, rankStyles, styles } from '../lib/inspiration.ts';

test('each setting has eight distinct directions and refresh never repeats a photo or decor plan', () => {
  assert.equal(styles.length, 8);
  assert.equal(new Set(styles.map(style => style.id)).size, 8);
  for (const style of styles) {
    assert.equal(style.directions.length, 8, style.title);
    assert.equal(new Set(style.directions.map(item => item.id)).size, 8, style.title);
    assert.equal(new Set(style.directions.map(item => item.photo.id)).size, 8, `${style.title}: duplicate photos`);
    assert.equal(new Set(style.directions.map(item => JSON.stringify(item.decor))).size, 8, `${style.title}: repeated decor plan`);
    for (const item of style.directions) {
      assert.ok(item.practical.length > 20, `${item.title}: missing planning guidance`);
      assert.equal(Object.values(item.decor).filter(Boolean).length, 3, item.title);
    }
  }
});

test('each displayed source image exists locally and is a real JPEG', () => {
  for (const photo of Object.values(photos)) {
    const path = new URL(`../public${photoPath(photo)}`, import.meta.url);
    const data = readFileSync(path);
    assert.equal(data[0], 0xff, photo.alt);
    assert.equal(data[1], 0xd8, photo.alt);
    assert.ok(data.length > 1000, photo.alt);
    assert.match(photo.source, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.ok(photo.photographer);
  }
});

test('a feeling surfaces relevant visual examples without losing alternatives', () => {
  assert.equal(rankStyles('')[0].id, 'garden');
  assert.equal(rankStyles('Barefoot by the sea')[0].id, 'beach');
  assert.equal(rankStyles('Wildflowers and laughter')[0].id, 'garden');
  assert.equal(rankStyles('A candlelit dinner')[0].id, 'intimate');
  for (const words of ['', 'minimal contemporary', 'wildflowers', 'an unusual feeling']) {
    const options = rankStyles(words);
    assert.equal(options.length, 8);
    assert.equal(new Set(options.map(item => item.photo.id)).size, 8);
    assert.equal(options.slice(0, 4).filter(item => options.slice(4).some(other => other.id === item.id)).length, 0);
  }
});
