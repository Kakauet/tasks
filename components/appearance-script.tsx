import {
ACCENT_PRESETS,ACCENT_STORAGE_KEY,BOARD_COLORS_STORAGE_KEY,BOARD_COLOR_PRESETS,
BOARD_SECTIONS,BOARD_SECTION_VARIABLES,DARK_MODE_PRESETS,DARK_MODE_STORAGE_KEY,
DEFAULT_BOARD_COLOR_SELECTIONS,buildAccentTokens,
} from "@/lib/appearance"

/** Apply saved colors before the body is painted, using the same presets as settings. */
export function AppearanceScript() {
  const accents = Object.fromEntries(ACCENT_PRESETS.map((preset) => {
    const tokens = buildAccentTokens(preset)
    return [preset.id, Object.fromEntries(Object.entries(tokens).map(([key, value]) => [
      `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value,
    ]))]
  }))
  const darkModes = Object.fromEntries(DARK_MODE_PRESETS.map((preset) => [
    preset.id, Object.fromEntries(Object.entries(preset.tokens).map(([key, value]) => [`--dark-${key}`, value])),
  ]))
  const config = JSON.stringify({
    accents, darkModes, accentKey: ACCENT_STORAGE_KEY, darkKey: DARK_MODE_STORAGE_KEY,
    boardKey: BOARD_COLORS_STORAGE_KEY, sections: BOARD_SECTIONS, variables: BOARD_SECTION_VARIABLES,
    defaults: DEFAULT_BOARD_COLOR_SELECTIONS,
    colors: Object.fromEntries(BOARD_COLOR_PRESETS.map((preset) => [preset.id, preset.token])),
    defaultAccent: ACCENT_PRESETS[0].id, defaultDark: DARK_MODE_PRESETS[0].id,
  }).replace(/</g, "\\u003c")
  const script = `(() => {
    const c = ${config};
    const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const apply = tokens => Object.entries(tokens).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    apply(c.accents[read(c.accentKey)] || c.accents[c.defaultAccent]);
    apply(c.darkModes[read(c.darkKey)] || c.darkModes[c.defaultDark]);
    let board = {};
    try { board = JSON.parse(read(c.boardKey)) || {}; } catch {}
    c.sections.forEach(section => document.documentElement.style.setProperty(c.variables[section], c.colors[board[section]] || c.colors[c.defaults[section]]));
  })();`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
