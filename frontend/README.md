# Webviewer Backup (Vanilla)
*Created: 2026-02-01*

This directory is a pristine backup of the working `Webviewer` setup. It is based on the "vanilla" template from the `Examples/Engine IFC` directory.

## State Description
This version is a fully functional IFC viewer running on Vite + TypeScript. It includes:
- **Core Libraries**: `@thatopen/components`, `@thatopen/ui`, `web-ifc`.
- **Modifications**:
  - **`viewport-settings.ts`**: Fixed a potential crash by checking if `world.renderer` exists before accessing properties.
  - **`main.ts`**: Implemented `ResizeObserver` and an initial size check to prevent `GL_INVALID_FRAMEBUFFER_OPERATION` warnings caused by rendering to a zero-sized viewport.

## How to Restore
If the main `Webviewer` project breaks or needs to be reset:

1.  **Delete/Rename** the current `Webviewer` folder.
2.  **Copy** this `Webviewer_Backup_Vanilla` folder.
3.  **Rename** the copy to `Webviewer`.
4.  Run `npm install` (if node_modules were not copied) and `npm run dev`.

## Key Commands
- `npm run dev`: Starts the local development server.
- `npm run build`: Compiles the project for production.
