import {createId} from '@codevideo/shared';

export const EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'angry',
  'thinking',
  'talking',
] as const;

export type Expression = (typeof EXPRESSIONS)[number];

export interface CharacterPalette {
  skin: string;
  hair: string;
  eye: string;
  shirt: string;
  pants: string;
  shoes: string;
  accent: string;
  background: string;
}

export interface CharacterConfig {
  height: number;
  build: 'slim' | 'average' | 'broad';
  hairStyle: 'short' | 'wavy' | 'long' | 'buzz';
  expression: Expression;
  palette: CharacterPalette;
}

export interface CharacterRig {
  id: string;
  name: string;
  config: CharacterConfig;
  parts: Record<string, string>;
  svg: string;
}

export const DEFAULT_PALETTE: CharacterPalette = {
  skin: '#f1c9a5',
  hair: '#2f241d',
  eye: '#3b4a5a',
  shirt: '#6d5efc',
  pants: '#243044',
  shoes: '#111827',
  accent: '#22d3ee',
  background: '#0b1020',
};

export const DEFAULT_CONFIG: CharacterConfig = {
  height: 1,
  build: 'average',
  hairStyle: 'short',
  expression: 'neutral',
  palette: DEFAULT_PALETTE,
};

export function createCharacterRig(
  name: string,
  config: Partial<CharacterConfig> = {},
  id = createId('character'),
): CharacterRig {
  const merged: CharacterConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    palette: {...DEFAULT_PALETTE, ...(config.palette ?? {})},
  };
  const rig: CharacterRig = {
    id,
    name,
    config: merged,
    parts: {},
    svg: '',
  };
  rig.parts = buildParts(rig);
  rig.svg = assembleSvg(rig);
  return rig;
}

export function setExpression(rig: CharacterRig, expression: Expression): CharacterRig {
  const next: CharacterRig = {
    ...rig,
    config: {...rig.config, expression},
    parts: {},
    svg: '',
  };
  next.parts = buildParts(next);
  next.svg = assembleSvg(next);
  return next;
}

export function updatePalette(
  rig: CharacterRig,
  palette: Partial<CharacterPalette>,
): CharacterRig {
  return createCharacterRig(rig.name, {
    ...rig.config,
    palette: {...rig.config.palette, ...palette},
  }, rig.id);
}

export function characterToSource(rig: CharacterRig): string {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rig.svg)}`;
  const svgLiteral = JSON.stringify(dataUrl);
  return `import {Img} from '@motion-canvas/2d';
import {createRef} from '@motion-canvas/core';
import {fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const character = createRef<Img>();
  view.add(
    new Img({
      src: ${svgLiteral},
      height: 640,
      radius: 12,
      ref: character,
      opacity: 0,
    }),
  );
  yield* fadeIn(character(), 0.7);
});
`;
}

function buildParts(rig: CharacterRig): Record<string, string> {
  const {palette, build, hairStyle, expression, height} = rig.config;
  const widthScale = build === 'slim' ? 0.86 : build === 'broad' ? 1.14 : 1;
  const heightScale = height;
  const mouth = getMouthPath(expression);
  const browLeft = getBrowTransform(expression, -1);
  const browRight = getBrowTransform(expression, 1);
  const eyeOpen = expression === 'surprised' ? 15 : expression === 'angry' ? 7 : 10;
  const eyeFill = expression === 'sad' ? 0.75 : 1;
  const hair = getHairPath(hairStyle, palette.hair);

  return {
    shadow: `<ellipse data-part="shadow" cx="150" cy="582" rx="86" ry="12" fill="#000000" opacity="0.35"/>`,
    leftLeg: `<path data-part="leftLeg" d="M118 390 L112 566" stroke="${palette.pants}" stroke-width="26" stroke-linecap="round"/>`,
    rightLeg: `<path data-part="rightLeg" d="M182 390 L188 566" stroke="${palette.pants}" stroke-width="26" stroke-linecap="round"/>`,
    leftShoe: `<path data-part="leftShoe" d="M98 568 Q112 556 128 568 L130 580 L96 580 Z" fill="${palette.shoes}"/>`,
    rightShoe: `<path data-part="rightShoe" d="M172 568 Q188 556 202 568 L204 580 L170 580 Z" fill="${palette.shoes}"/>`,
    torso: `<path data-part="torso" d="M${150 - 52 * widthScale} 250 Q150 226 ${150 + 52 * widthScale} 250 L${150 + 48 * widthScale} 398 Q150 414 ${150 - 48 * widthScale} 398 Z" fill="${palette.shirt}"/>`,
    leftArm: `<g data-part="leftArm" data-joint="shoulder-left" transform="rotate(4 ${150 - 52 * widthScale} 262)"><path d="M${150 - 52 * widthScale} 262 L${150 - 74 * widthScale} 378" stroke="${palette.shirt}" stroke-width="22" stroke-linecap="round"/><circle cx="${150 - 74 * widthScale}" cy="382" r="11" fill="${palette.skin}"/></g>`,
    rightArm: `<g data-part="rightArm" data-joint="shoulder-right" transform="rotate(-14 ${150 + 52 * widthScale} 262)"><path d="M${150 + 52 * widthScale} 262 L${150 + 76 * widthScale} 374" stroke="${palette.shirt}" stroke-width="22" stroke-linecap="round"/><circle cx="${150 + 76 * widthScale}" cy="378" r="11" fill="${palette.skin}"/></g>`,
    neck: `<rect data-part="neck" x="138" y="226" width="24" height="34" rx="10" fill="${palette.skin}"/>`,
    head: `<ellipse data-part="head" cx="150" cy="${166 / heightScale}" rx="58" ry="70" fill="${palette.skin}"/>`,
    hair,
    leftEye: `<g data-part="leftEye" opacity="${eyeFill}"><ellipse cx="128" cy="${160 / heightScale}" rx="11" ry="${eyeOpen}" fill="#ffffff"/><circle cx="129" cy="${161 / heightScale}" r="5" fill="${palette.eye}"/></g>`,
    rightEye: `<g data-part="rightEye" opacity="${eyeFill}"><ellipse cx="172" cy="${160 / heightScale}" rx="11" ry="${eyeOpen}" fill="#ffffff"/><circle cx="173" cy="${161 / heightScale}" r="5" fill="${palette.eye}"/></g>`,
    leftBrow: `<path data-part="leftBrow" d="M112 140 Q128 132 144 140" stroke="${palette.hair}" stroke-width="5" stroke-linecap="round" fill="none" transform="${browLeft}"/>`,
    rightBrow: `<path data-part="rightBrow" d="M156 140 Q172 132 188 140" stroke="${palette.hair}" stroke-width="5" stroke-linecap="round" fill="none" transform="${browRight}"/>`,
    nose: `<path data-part="nose" d="M150 168 Q156 186 148 188" stroke="#c99370" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    mouth: `<path data-part="mouth" data-expression="${expression}" d="${mouth}" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  };
}

function getMouthPath(expression: Expression): string {
  switch (expression) {
    case 'happy':
      return 'M130 202 Q150 226 170 202';
    case 'sad':
      return 'M130 216 Q150 194 170 216';
    case 'surprised':
      return 'M140 208 Q150 222 160 208 Q150 200 140 208';
    case 'angry':
      return 'M130 214 Q150 200 170 214';
    case 'thinking':
      return 'M132 208 Q146 204 160 210';
    case 'talking':
      return 'M134 206 Q150 222 166 206';
    default:
      return 'M134 208 Q150 214 166 208';
  }
}

function getBrowTransform(expression: Expression, side: -1 | 1): string {
  if (expression === 'angry') {
    return `rotate(${side * 12} 150 140)`;
  }
  if (expression === 'sad' || expression === 'thinking') {
    return `rotate(${side * -10} 150 140)`;
  }
  if (expression === 'surprised') {
    return 'translate(0 -6)';
  }
  return '';
}

function getHairPath(style: CharacterConfig['hairStyle'], color: string): string {
  switch (style) {
    case 'buzz':
      return `<path data-part="hair" d="M96 142 Q150 72 204 142 Q150 112 96 142 Z" fill="${color}"/>`;
    case 'wavy':
      return `<path data-part="hair" d="M92 148 Q84 78 150 74 Q216 78 208 148 Q198 116 180 112 Q164 132 150 114 Q132 134 114 112 Q98 118 92 148 Z" fill="${color}"/>`;
    case 'long':
      return `<path data-part="hair" d="M88 150 Q82 68 150 66 Q218 68 212 150 L222 270 Q204 244 196 200 Q188 124 150 118 Q112 124 104 200 Q96 244 78 270 Z" fill="${color}"/>`;
    default:
      return `<path data-part="hair" d="M94 146 Q90 80 150 76 Q210 80 206 146 Q188 118 168 116 Q150 130 132 116 Q112 118 94 146 Z" fill="${color}"/>`;
  }
}

function assembleSvg(rig: CharacterRig): string {
  const order = [
    'shadow',
    'leftLeg',
    'rightLeg',
    'leftShoe',
    'rightShoe',
    'torso',
    'leftArm',
    'rightArm',
    'neck',
    'head',
    'hair',
    'leftBrow',
    'rightBrow',
    'leftEye',
    'rightEye',
    'nose',
    'mouth',
  ];
  const body = order
    .map(part => rig.parts[part] ?? '')
    .filter(Boolean)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 600" width="300" height="600" data-character-id="${rig.id}">
  ${body}
</svg>`;
}
