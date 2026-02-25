import { Capacitor } from "@capacitor/core";

/** Running as a native Capacitor app (iOS/Android) */
export const isNative = Capacitor.isNativePlatform();

/** Running inside milaidy Electron app as iframe */
export const isMilaidy = !isNative && typeof window !== "undefined" && window.parent !== window;

/** Running as standalone web app (direct browser access) */
export const isStandalone = !isNative && !isMilaidy;

/** Current platform identifier */
export const platform = isNative ? "native" : isMilaidy ? "milaidy" : "web";
