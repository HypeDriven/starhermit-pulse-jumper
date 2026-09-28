'use strict';

// Strings for the Graphics settings section. The rest of the game is English
// only; this panel follows the browser language (navigator.language).

const EN = {
  graphics: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {tier})', renderScale: 'Render scale',
  fromPreset: 'From preset ({tier})', adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
  postFailed: 'Post-processing is unavailable on this device, so effects are off.', unknownGpu: 'unknown GPU',
  cat: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Color grade', antialias: 'Anti-aliasing',
    reflections: 'Reflections', particles: 'Particles', background: 'Background', detail: 'Detail' },
  tier: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra', off: 'Off', on: 'On', medium: 'Medium',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Static', animated: 'Animated', plain: 'Plain', detailed: 'Detailed' },
  sum: { noShadows: 'no shadows', shadows: '{n}² shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
    bloom: 'bloom', noAa: 'no anti-aliasing', particles: '{n} particles' },
};

const GB = { ...EN, cat: { ...EN.cat, grade: 'Colour grade' } };

const ES = {
  graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderizado',
  fromPreset: 'Del ajuste ({tier})', adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
  postFailed: 'El posprocesado no está disponible en este dispositivo; los efectos están desactivados.', unknownGpu: 'GPU desconocida',
  cat: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Antialiasing',
    reflections: 'Reflejos', particles: 'Partículas', background: 'Fondo', detail: 'Detalle' },
  tier: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', off: 'No', on: 'Sí', medium: 'Media',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Estático', animated: 'Animado', plain: 'Sencillo', detailed: 'Detallado' },
  sum: { noShadows: 'sin sombras', shadows: 'sombras {n}²', ao: 'oclusión ambiental', aoHigh: 'oclusión ambiental completa',
    bloom: 'resplandor', noAa: 'sin antialiasing', particles: '{n} partículas' },
};
const ES419 = { ...ES, showFps: 'Mostrar cuadros por segundo', cat: { ...ES.cat, antialias: 'Suavizado de bordes' },
  sum: { ...ES.sum, noAa: 'sin suavizado de bordes' } };

const DE = {
  graphics: 'Grafik', quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})', renderScale: 'Renderskalierung',
  fromPreset: 'Wie Voreinstellung ({tier})', adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
  postFailed: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar, Effekte sind aus.', unknownGpu: 'unbekannte GPU',
  cat: { shadows: 'Schatten', ao: 'Umgebungsverdeckung', bloom: 'Leuchteffekt', grade: 'Farbkorrektur', antialias: 'Kantenglättung',
    reflections: 'Spiegelungen', particles: 'Partikel', background: 'Hintergrund', detail: 'Details' },
  tier: { low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra', off: 'Aus', on: 'An', medium: 'Mittel',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Statisch', animated: 'Animiert', plain: 'Schlicht', detailed: 'Detailliert' },
  sum: { noShadows: 'keine Schatten', shadows: '{n}²-Schatten', ao: 'Umgebungsverdeckung', aoHigh: 'volle Umgebungsverdeckung',
    bloom: 'Leuchteffekt', noAa: 'keine Kantenglättung', particles: '{n} Partikel' },
};

const FR = {
  graphics: 'Graphismes', quality: 'Qualité', auto: 'Auto (détecté : {tier})', renderScale: 'Échelle de rendu',
  fromPreset: 'Selon le préréglage ({tier})', adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
  postFailed: 'Le post-traitement est indisponible sur cet appareil : les effets sont désactivés.', unknownGpu: 'GPU inconnu',
  cat: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs', antialias: 'Anticrénelage',
    reflections: 'Reflets', particles: 'Particules', background: 'Arrière-plan', detail: 'Détails' },
  tier: { low: 'Faible', balanced: 'Équilibrée', high: 'Élevée', ultra: 'Ultra', off: 'Non', on: 'Oui', medium: 'Moyennes',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Statique', animated: 'Animé', plain: 'Simples', detailed: 'Détaillés' },
  sum: { noShadows: 'sans ombres', shadows: 'ombres {n}²', ao: 'occlusion ambiante', aoHigh: 'occlusion ambiante complète',
    bloom: 'halo lumineux', noAa: 'sans anticrénelage', particles: '{n} particules' },
};
const FRCA = { ...FR, showFps: 'Afficher la fréquence d’images', cat: { ...FR.cat, antialias: 'Lissage des contours' },
  sum: { ...FR.sum, noAa: 'sans lissage des contours' } };

const PT = {
  graphics: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderização',
  fromPreset: 'Da predefinição ({tier})', adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
  postFailed: 'O pós-processamento não está disponível neste dispositivo; os efeitos estão desligados.', unknownGpu: 'GPU desconhecida',
  cat: { shadows: 'Sombras', ao: 'Oclusão ambiente', bloom: 'Brilho', grade: 'Correção de cor', antialias: 'Suavização de serrilhado',
    reflections: 'Reflexos', particles: 'Partículas', background: 'Fundo', detail: 'Detalhes' },
  tier: { low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', off: 'Desligado', on: 'Ligado', medium: 'Média',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Estático', animated: 'Animado', plain: 'Simples', detailed: 'Detalhado' },
  sum: { noShadows: 'sem sombras', shadows: 'sombras {n}²', ao: 'oclusão ambiente', aoHigh: 'oclusão ambiente completa',
    bloom: 'brilho', noAa: 'sem suavização', particles: '{n} partículas' },
};

const IT = {
  graphics: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {tier})', renderScale: 'Scala di rendering',
  fromPreset: 'Dal preset ({tier})', adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
  postFailed: 'La post-elaborazione non è disponibile su questo dispositivo: gli effetti sono disattivati.', unknownGpu: 'GPU sconosciuta',
  cat: { shadows: 'Ombre', ao: 'Occlusione ambientale', bloom: 'Bagliore', grade: 'Correzione colore', antialias: 'Antialiasing',
    reflections: 'Riflessi', particles: 'Particelle', background: 'Sfondo', detail: 'Dettagli' },
  tier: { low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra', off: 'No', on: 'Sì', medium: 'Medie',
    fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', static: 'Statico', animated: 'Animato', plain: 'Semplici', detailed: 'Dettagliati' },
  sum: { noShadows: 'senza ombre', shadows: 'ombre {n}²', ao: 'occlusione ambientale', aoHigh: 'occlusione ambientale completa',
    bloom: 'bagliore', noAa: 'senza antialiasing', particles: '{n} particelle' },
};

export const GFX_STRINGS = {
  'en-US': EN, 'en-GB': GB, 'es-419': ES419, 'es-ES': ES, 'de-DE': DE, 'fr-FR': FR, 'fr-CA': FRCA, 'pt-BR': PT, 'it-IT': IT,
};

const FALLBACK = { en: 'en-US', es: 'es-419', de: 'de-DE', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT' };

/** Pick the string table for a BCP-47 tag (exact, then region rules, then language). */
export function pickLocale(tag) {
  const t = String(tag || 'en-US');
  const exact = Object.keys(GFX_STRINGS).find((k) => k.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const [lang, region = ''] = t.toLowerCase().split('-');
  if (lang === 'en' && ['gb', 'uk', 'ie', 'au', 'nz'].includes(region)) return 'en-GB';
  if (lang === 'es' && region === 'es') return 'es-ES';
  if (lang === 'fr' && region === 'ca') return 'fr-CA';
  return FALLBACK[lang] || 'en-US';
}

export function gfxStrings(tag) {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return GFX_STRINGS[pickLocale(tag || nav)];
}
