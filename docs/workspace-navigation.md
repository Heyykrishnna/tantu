# Workspace navigation and settings

## Switching without repeated loading

Workspace features and settings sections mount on their first visit and stay mounted while that workspace and membership role remain selected. Returning to a loaded section preserves its forms, selection, expanded menus, and fetched results. Hidden sections are removed from keyboard navigation and the accessibility tree. Hidden solving orbs pause.

The dynamic route reads URL parameters inside a Suspense boundary, with a solving-orb fallback, so the App Router can stream its shell without a blocking route read. The settings sidebar stays mounted when sections change. Its File Tree groups support arrow keys, Home, End, Enter, and Space. On small screens, a labeled settings selector replaces the desktop tree. Workspace links retain ordinary URLs and modifier-click behavior.

Task and page snapshots are held in memory, bounded to 20 query results for the current workspace. Successful mutations invalidate these snapshots. Settings resources are requested only when needed, with duplicate reads suppressed while the settings view remains mounted. Appearance preferences have one authoritative state shared by the header theme control and settings form. The system theme listens for device changes while explicit Light and Dark choices remain fixed.

Use **Refresh workspace view** to fetch the current feature again. This explicitly resets its unsaved forms. **Refresh records** reloads the current task/page list. Data changed by other people or browser tabs may require refresh; retained snapshots are not a real-time subscription. Existing workspace-access polling remains active. Switching workspaces, changing membership role, signing out, or refreshing the browser discards retained feature state. This is a UI optimization; server authorization and private HTTP `no-store` responses remain in place.

## Controls and motion

Buttons use the existing CandyButton primitive, including restrained ghost actions and layout-preserving variants for existing controls. Solving loaders are noninteractive and announce loading status. Theme and density choices use native radio inputs with animated selection indicators. Switches use native inputs and a damped spring thumb. System and saved reduced-motion preferences disable decorative transitions, and hidden orbs pause.

Styling remains in Tailwind classes. Local Inter and Poppins fonts remain in use. No dependency versions, lockfiles, or global CSS were changed for this delivery.

## File Tree provenance

The sidebar is adapted from the `file-tree` registry item published in [@devclubnst/ui 2.3.0](https://www.npmjs.com/package/@devclubnst/ui/v/2.3.0), the source used by the requested `npx @devclubnst/ui add file-tree` command. The component uses the already installed React, Motion, Lucide, clsx, and tailwind-merge dependencies. Its MIT license is preserved beside the adapted implementation in `frontend/components/ui/file-tree.LICENSE`.

The documentation website returned a certificate verification error during this delivery. The verified npm registry package supplied the component source; certificate verification was not disabled.

## Workspace creation

Workspace names are trimmed and checked before submission. The form disables duplicate submission while pending and shows request failures. After a successful creation, the workspace list refreshes and selection moves to the new workspace without signing in again. The sidebar form resets and closes after success. Settings creation follows the same workspace selection behavior.

## Scope and validation

Existing settings cover workspace profile, spaces, membership and permissions, appearance, connected provider accounts, AI consent, personal sessions, data usage, retention defaults, audit exports, developer keys/webhooks, and automation. Configuration versioning, policy simulation/drift, dependency mapping, forecasting, and SSO/SCIM remain separate implementation work. Unconfigured identity, network, and session-policy controls are disabled and labeled; retention defaults do not themselves purge content.

Run `npm --prefix discovery run test:navigation` after `npm --prefix frontend run build`. This suite exercises the production frontend with synthetic API fixtures to isolate UI state, requests, accessibility, motion controls, and workspace switching. It does not validate PostgreSQL persistence. The separate `test:l1a:browser` journeys use actual Fastify and disposable PostgreSQL. Both browser stages are included in `npm run check:l1b`.
