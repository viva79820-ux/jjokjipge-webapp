// Touch layouts use the app container width, up to 1024px.
// Fine-pointer desktops cap that same frame at 560px.
// Bottom tabs and the later detail booking bar share appWidthClass.
export const appWidthClass = "w-full max-w-app pc:max-w-pc";

export const appShellClass = `@container/app mx-auto min-h-screen min-w-0 bg-background ${appWidthClass}`;

export const appFixedBarClass = `fixed bottom-0 left-1/2 z-20 -translate-x-1/2 ${appWidthClass}`;

export const appMainClass = "pb-[calc(7rem+env(safe-area-inset-bottom))]";
