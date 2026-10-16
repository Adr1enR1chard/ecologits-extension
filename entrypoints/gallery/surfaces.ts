/**
 * The surfaces the gallery can show on their own: `gallery.html?surface=popup`. Apart from the
 * gallery, so that the layout tests list them without loading the UI.
 */
export const POPUP_SURFACES = ["popup", "popup-one-provider", "popup-empty"] as const;
export const SURFACES = [...POPUP_SURFACES, "options"] as const;

export type PopupSurface = (typeof POPUP_SURFACES)[number];
export type Surface = (typeof SURFACES)[number];
