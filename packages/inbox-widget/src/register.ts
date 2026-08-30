// Entry point for the `<script src="…/inbox-widget.iife.js">` path: importing it is the
// registration. Bundler consumers should import from `./index` and call `defineInboxWidget()`
// themselves instead, so they control the tag name and *when* it's defined.
import { defineInboxWidget } from './element';

defineInboxWidget();
