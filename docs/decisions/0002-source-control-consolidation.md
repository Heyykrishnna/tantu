# Source-control consolidation

Date: 29 October 2026. Status: Adopted.

## Context

A root checkout must include the frontend and backend source needed by the documented setup commands. An embedded frontend repository recorded as a gitlink without a submodule mapping could not provide that source to a fresh clone.

## Decision

Track application source directly in the root repository. Frontend and backend remain independent npm packages with their own lockfiles, while Git ownership is shared. No submodule initialization or separate frontend remote is required.

Preserve the existing root commits. Retain the original frontend Git metadata as a local backup under `.git/frontend-repository-backup`; do not publish that metadata as application content. Keep frontend file contents intact during conversion.

Exclude dependencies, generated builds, local environment files, logs, and the entire local phase-planning folder. Keep `.env.example` eligible for tracking. Remove already tracked operating-system metadata from the index while preserving the local file.

## Verification

The published tree must contain ordinary frontend files rather than a gitlink. Validate setup and project checks from a clean checkout, confirm ignored content is absent from the committed tree, and compare the pushed branch revision with the remote.
