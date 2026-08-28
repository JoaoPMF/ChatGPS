# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added comprehensive subdivision aliases for Portugal, Argentina, Australia, Brazil, Canada, Chile, Colombia, India, Indonesia, Japan, Kazakhstan, Italy, the Philippines, Russia, South Africa, and the United States.
- Added current local subdivision definitions missing from the bundled ISO dataset, including Christmas Island, Cocos Islands, Jervis Bay Territory, Ñuble, newer Indonesian and Kazakh subdivisions, and the Negros Island Region.
- Added a per-subdivision accuracy breakdown to `!acc <subdivision-map>`, showing each answered subdivision's percentage and correct-answer count.

### Changed

- Switched the Portugal subdivision map to [A True Portugal](https://www.geoguessr.com/maps/69ab93c917013e56097d6653).
- Added the `true portugal` map shortcut; `portugal` continues to select the Portugal subdivision map.