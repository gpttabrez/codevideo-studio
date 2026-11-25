import {describe, expect, it} from 'vitest';
import {
  characterToSource,
  createCharacterRig,
  DEFAULT_PALETTE,
  setExpression,
  updatePalette,
} from './index.js';

describe('character rig', () => {
  it('generates editable SVG with separate body parts', () => {
    const rig = createCharacterRig('Nova');
    for (const part of [
      'head',
      'torso',
      'leftArm',
      'rightArm',
      'leftLeg',
      'rightLeg',
      'leftEye',
      'rightEye',
      'mouth',
    ]) {
      expect(rig.svg).toContain(`data-part="${part}"`);
    }
  });

  it('changes mouth and brows when expression changes', () => {
    const neutral = createCharacterRig('Nova');
    const happy = setExpression(neutral, 'happy');
    expect(neutral.parts.mouth).not.toBe(happy.parts.mouth);
    expect(happy.svg).toContain('data-expression="happy"');
  });

  it('applies palette updates', () => {
    const rig = createCharacterRig('Nova');
    const updated = updatePalette(rig, {shirt: '#ff0000'});
    expect(updated.svg).toContain('#ff0000');
    expect(updated.config.palette.skin).toBe(DEFAULT_PALETTE.skin);
  });

  it('creates runnable scene source with an embedded SVG data URL', () => {
    const rig = createCharacterRig('Nova');
    const source = characterToSource(rig);
    expect(source).toContain('makeScene2D');
    expect(source).toContain('data:image/svg+xml');
  });
});
