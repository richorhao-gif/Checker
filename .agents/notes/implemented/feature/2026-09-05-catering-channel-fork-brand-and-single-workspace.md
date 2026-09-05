# Agent Note: Catering-channel fork brand and pinned single workspace

Status: implemented

English | [中文](2026-09-05-catering-channel-fork-brand-and-single-workspace.zh.md)

## Problem

This repository ships as a private LAN deployment: a bid-review tool for the 益海嘉里·金龙鱼 catering channel, not the public DeepSeek Harness preview product. Two inherited facts conflict with that deployment.

The product chrome still carries the upstream identity — the sidebar wordmark, the empty-hero fish logo and 「探索未至之境」 headline with its `Preview` badge, the browser-title suffix, the PWA manifest and favicon, the boot splash, and the first-run welcome notice. Operators see a third-party preview product rather than the company tool they were handed.

The shipped web-app roster also mounts the dual-face directory picker `@deepseek-ai/dsh-host-directory-picker-auto`, which samples the bind host and display once at boot and mounts the matching native-or-browse interaction. On a LAN or headless bind it resolves to the in-app browse face, so any remote operator can browse the server's filesystem and adopt an arbitrary directory as a new workspace. A shared single-purpose deployment must not expose the host's directory tree to its users.

## Decision

The product presents as the catering-channel bid-review tool, and the deployment pins exactly one server workspace.

### Brand

The mark is `packages/client/ui-primitives/src/BrandMark.tsx`: a 24×24 vermilion seal disc (`#C8102E`) carrying a gold arowana stroke (`#D9A441`), painted with fixed presentation colors rather than `currentColor` so it reads on both themes, and `aria-hidden`. `BrandWordmark.tsx` lays the mark out as HTML with the name 「益海嘉里 · 金龙鱼」 and a 「餐饮渠道」 badge plate; the sidebar rail uses the bare mark and the wide column uses the wordmark.

The empty hero pairs the mark with the headline 「审之有据 · 落印为凭」 / "Reviewed with evidence, sealed with confidence" and a channel badge 「餐饮渠道 · 标书审核」 / "Catering Channel · Bid Review". The badge reuses the rendering the `Preview` badge established — a mono superscript pill on the business-tertiary background with a readable label token, present in the accessible headline — and only its locale key and identity change (`hero.preview` → `hero.channel`, css `previewBadge` → `channelBadge`).

The remaining chrome follows the same identity: `apps/web/index.html` titles the page 「金龙鱼餐饮渠道标书审核」 (the document-title service appends the session name to this base), the PWA manifest and favicon carry the company name and seal mark, the boot splash reads 「金龙鱼 · 标书审核」, and the first-run welcome notice is company-neutral copy with its `WELCOME_NOTICE_VERSION` bumped so every operator re-acknowledges it once.

### Single workspace

In `packages/bundle/web-app/cordis.patch.yml` the `directory-picker` entry (`@deepseek-ai/dsh-host-directory-picker-auto`) is `disabled: true`, and the host backend `@deepseek-ai/dsh-host-directory-picker-browse` is mounted directly in its place without its client surface `@deepseek-ai/dsh-client-ui-directory-picker-browse`. `-auto` would mount the backend and the surface together as Loader entries at boot; the surface is what occupies ui-workspace's two `directoryFlow` holes, and the "Add workspace…" affordance renders only while a hole is occupied. Mounting the backend alone leaves both holes empty, so the affordance is absent from the sidebar browser and the hero picker. The backend cannot simply be dropped: `@deepseek-ai/dsh-host-apiproxy` injects `directoryPicker` as a required service, so with no backend registering it the host tree never activates and `assertEntriesActivated` fails the boot; the `-browse` backend registers that service and satisfies apiproxy. This closes the user-facing affordance, not the capability — apiproxy still exposes the `directoryPicker` RPC, so a hand-crafted client could call it, and removing that surface too would mean making the inject optional, a code change outside this config-level pin.

`ui-workspace` itself stays mounted: it registers the whole sidebar session-navigation region (`sidebar.workspaces`) and the hero picker, so removing it would delete session-history browsing. Operationally the deployment launches the server from a dedicated isolated working directory, so the single default workspace is a clearly-named server directory rather than a personal folder; that launch choice is not enforced by the config above.

## Alternatives considered

**Remove the `ui-workspace` roster entry to hide workspaces.** Rejected: ui-workspace registers the entire sidebar session-navigation region and the hero workspace picker, not only an add-workspace control. Removing it deletes session-history browsing, which the bid-review tool still needs.

**Keep the `-auto` directory picker.** Rejected: on a LAN or headless bind it resolves to the in-app browse face and exposes the server's directory tree to every remote operator.

**Pin the picker to `-native` through an overlay.** Rejected: the native OS chooser is unavailable on a headless server, so the interaction would fail at the point of use rather than hide.

**Make the brand a deployment-varying config field.** Rejected: the brand is one product identity per deployment, not an operator tunable; the same reasoning the `Preview` badge recorded applies to its replacement.

## Consequences

Every surface an operator meets — sidebar, empty hero, browser tab, installed-app name, boot splash, welcome notice — presents the catering-channel bid-review identity, and the upstream DeepSeek Harness product marks are gone from the shipped web app. The deployment loses multi-workspace switching: each conversation inherits the one pinned server workspace and cannot add another. This is the intended trade for a shared tool that must not let users browse the host filesystem. Provider-facing strings that name DeepSeek as the model or search supplier stay, because they state a real supplier rather than the product wordmark.

## Testing

The conversation, sidebar, document-title, app-root, and welcome-notice component tests pin the new strings and markup; the assembled Web lifecycle and onboarding snapshots pin the English headline and channel badge in the real hero. The shipped web-app composition boots with the `-browse` backend mounted in place of `-auto`, so apiproxy's required `directoryPicker` inject resolves; the browser e2e lane adds only the `-browse` client surface through its own scaffold patch — the backend already ships in the production roster, and re-inserting it would duplicate its loader entry id — so the directory-picker interaction tests and goldens still drive the in-app browse dialog.

## Related

[web-preview-product-badge](2026-08-05-web-preview-product-badge.md) — this fork replaces that note's `Preview` badge identity with the channel badge while inheriting its rendering rationale unchanged; the supersession is partial (one presentation swapped in the same hero slot), so both notes stay active and cross-linked.
