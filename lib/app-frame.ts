// Touch layouts use the app container width, up to 1024px.
// Fine-pointer desktops cap that same frame at 560px.
// Bottom tabs and the later detail booking bar share appWidthClass.
export const appWidthClass = "w-full max-w-app pc:max-w-pc";

export const appShellClass = `@container/app mx-auto min-h-screen min-w-0 bg-background ${appWidthClass}`;

export const appFixedBarClass = `fixed bottom-0 left-1/2 z-20 -translate-x-1/2 ${appWidthClass}`;

// Bottom tab is 4.5rem. The center phone control rises 1.25rem above it
// (-mt-5). The next 1.25rem keeps the last content off that control.
// Safe-area is added for devices with a home indicator.
export const appMainClass =
  "pb-[calc(4.5rem+1.25rem+1.25rem+env(safe-area-inset-bottom))]";
